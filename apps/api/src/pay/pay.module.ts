import {
  BadRequestException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Body,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../credits/credits.service';
import { UserJwtAuthGuard, UserJwtPayload } from '../users/user-jwt.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CreditsModule } from '../credits/credits.module';

// ─────────────────────────── 用户端 ───────────────────────────

class CreateOrderDto {
  @IsString()
  @Length(1, 64)
  skuKey!: string;
}

/** 生成订单号：t + 时间戳36进制 + 随机，避免并发碰撞 */
function genOrderNo(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

@Controller('pay')
export class PayController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly config: ConfigService,
  ) {}

  private get isMockPay() {
    return this.config.get('MOCK_PAY') === 'true';
  }

  /** 可用 SKU 列表（小程序充值页） */
  @Get('skus')
  skus() {
    return this.prisma.paymentSku.findMany({
      where: { enabled: true, verified: true },
      orderBy: { sort: 'asc' },
      select: {
        skuKey: true, name: true, description: true, wxPriceFen: true,
        credits: true, bonusCredits: true, badgeText: true, activityNote: true,
      },
    });
  }

  /** 创建充值订单 */
  @UseGuards(UserJwtAuthGuard)
  @Post('orders')
  async createOrder(@Req() req: { user: UserJwtPayload }, @Body() dto: CreateOrderDto) {
    const sku = await this.prisma.paymentSku.findUnique({ where: { skuKey: dto.skuKey } });
    if (!sku || !sku.enabled || !sku.verified) {
      throw new NotFoundException('充值项不存在或未开放');
    }
    const orderNo = genOrderNo();
    const order = await this.prisma.paymentOrder.create({
      data: {
        orderNo,
        userId: req.user.sub,
        openid: req.user.openid,
        skuKey: sku.skuKey,
        skuSnapshot: {
          name: sku.name,
          credits: sku.credits,
          bonusCredits: sku.bonusCredits,
          wxPriceFen: sku.wxPriceFen,
        },
        amountFen: sku.wxPriceFen,
        creditsSnapshot: sku.credits + sku.bonusCredits,
      },
    });
    if (this.isMockPay) {
      return {
        orderNo: order.orderNo,
        amountFen: order.amountFen,
        credits: order.creditsSnapshot,
        mockMode: true,
        mockPayUrl: `/api/pay/mock-pay/${orderNo}`,
      };
    }
    // TODO M3 上线前：接入微信小程序虚拟支付服务端签名（requestVirtualPayment 所需 paySignature）
    throw new ServiceUnavailableException('微信虚拟支付暂未开通，请联系管理员');
  }

  /** mock 支付：仅 MOCK_PAY=true 时可用，模拟微信回调完成订单并到账 */
  @UseGuards(UserJwtAuthGuard)
  @Post('mock-pay/:orderNo')
  async mockPay(@Req() req: { user: UserJwtPayload }, @Param('orderNo') orderNo: string) {
    if (!this.isMockPay) {
      throw new ServiceUnavailableException('mock 支付未开启');
    }
    const order = await this.prisma.paymentOrder.findUnique({ where: { orderNo } });
    if (!order || order.userId !== req.user.sub) throw new NotFoundException('订单不存在');
    if (order.status === 'paid') return { paid: true, alreadyPaid: true };
    if (order.status !== 'created') throw new BadRequestException('订单状态不可支付');

    const platformTxnId = `mock_${orderNo}`;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.paymentOrder.updateMany({
        where: { orderNo, status: 'created' }, // 并发幂等：仅 created → paid
        data: { status: 'paid', paidAt: new Date(), notifiedAt: new Date(), platformTxnId, notifyPayload: { mock: true } },
      });
      if (updated.count === 0) return;
      await this.credits.recharge(orderNo, order.userId, order.creditsSnapshot);
    });
    return { paid: true, credits: order.creditsSnapshot };
  }

  /** 我的订单 */
  @UseGuards(UserJwtAuthGuard)
  @Get('orders')
  async myOrders(@Req() req: { user: UserJwtPayload }, @Query('page') page?: string) {
    const p = Number(page) > 0 ? Number(page) : 1;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.paymentOrder.findMany({
        where: { userId: req.user.sub },
        orderBy: { id: 'desc' },
        skip: (p - 1) * 20,
        take: 20,
        select: {
          orderNo: true, skuKey: true, skuSnapshot: true, amountFen: true,
          creditsSnapshot: true, status: true, createdAt: true, paidAt: true,
        },
      }),
      this.prisma.paymentOrder.count({ where: { userId: req.user.sub } }),
    ]);
    return { items, total, page: p, pageSize: 20 };
  }
}

// ─────────────────────────── 管理端 ───────────────────────────

class AdminAdjustDto {
  @IsInt()
  @Type(() => Number)
  userId!: number;

  @IsInt()
  @Type(() => Number)
  amount!: number; // 正=加，负=减

  @IsOptional()
  @IsString()
  @Length(0, 256)
  reason?: string;
}

class ConfigDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  checkin_reward?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  share_reward?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  share_reward_daily_cap?: number;
}

class SkuDto {
  @IsString()
  @Length(1, 64)
  skuKey!: string;

  @IsString()
  @Length(1, 64)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 256)
  description?: string;

  @IsString()
  @Length(1, 128)
  wxProductId!: string;

  @IsInt()
  @Type(() => Number)
  @Min(1)
  wxPriceFen!: number;

  @IsInt()
  @Type(() => Number)
  @Min(1)
  credits!: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  bonusCredits?: number;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  badgeText?: string;

  @IsOptional()
  @IsString()
  @Length(0, 128)
  activityNote?: string;

  @IsOptional()
  @Type(() => Boolean)
  enabled?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  verified?: boolean;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sort?: number;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminPayController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
  ) {}

  @Get('pay/orders')
  async listOrders(@Query('status') status?: string, @Query('page') page?: string) {
    const p = Number(page) > 0 ? Number(page) : 1;
    const where = status && ['created', 'paid', 'closed', 'refunded'].includes(status) ? { status: status as never } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.paymentOrder.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (p - 1) * 20,
        take: 20,
        include: { user: { select: { id: true, openid: true } } },
      }),
      this.prisma.paymentOrder.count({ where }),
    ]);
    return { items, total, page: p, pageSize: 20 };
  }

  /** 补偿关单（未支付订单手工关闭） */
  @Patch('pay/orders/:id/close')
  async closeOrder(@Param('id', ParseIntPipe) id: number) {
    const order = await this.prisma.paymentOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status === 'paid') throw new BadRequestException('已支付订单不可关闭，走退款流程');
    await this.prisma.paymentOrder.update({ where: { id }, data: { status: 'closed', closedAt: new Date() } });
    return { closed: true };
  }

  /** 人工调账（加/扣积分，留痕） */
  @Post('credits/adjust')
  async adjust(@Body() dto: AdminAdjustDto) {
    if (dto.amount === 0) throw new BadRequestException('调账数额不能为 0');
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('用户不存在');
    const key = `admin_adjust:${dto.userId}:${Date.now()}`;
    return this.prisma.$transaction(async (tx) => {
      if (dto.amount > 0) {
        const balance = await this.credits.credit(tx, {
          userId: dto.userId,
          type: 'admin_adjust',
          amount: dto.amount,
          idempotentKey: key,
          reason: dto.reason ?? '管理员调账',
        });
        return { balance };
      }
      const balance = await this.credits.deduct(tx, {
        userId: dto.userId,
        type: 'admin_adjust',
        amount: -dto.amount,
        idempotentKey: key,
        reason: dto.reason ?? '管理员调账',
      });
      return { balance };
    });
  }

  /** 规则配置读取 */
  @Get('config')
  async getConfig() {
    const rows = await this.prisma.systemConfig.findMany({
      where: { key: { in: ['checkin_reward', 'share_reward', 'share_reward_daily_cap'] } },
    });
    const map: Record<string, number> = {};
    for (const r of rows) map[r.key] = Number(r.value);
    return {
      checkin_reward: map.checkin_reward ?? 10,
      share_reward: map.share_reward ?? 5,
      share_reward_daily_cap: map.share_reward_daily_cap ?? 50,
    };
  }

  /** 规则配置更新 */
  @Patch('config')
  async updateConfig(@Body() dto: ConfigDto) {
    const entries = Object.entries(dto).filter(([, v]) => v !== undefined) as [string, number][];
    for (const [key, value] of entries) {
      await this.prisma.systemConfig.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    }
    return this.getConfig();
  }

  /** SKU 管理 */
  @Get('skus')
  listSkus() {
    return this.prisma.paymentSku.findMany({ orderBy: { sort: 'asc' } });
  }

  @Post('skus')
  createSku(@Body() dto: SkuDto) {
    return this.prisma.paymentSku.create({ data: dto });
  }

  @Patch('skus/:id')
  async updateSku(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<SkuDto>) {
    return this.prisma.paymentSku.update({ where: { id }, data: dto });
  }
}

@Module({
  imports: [PrismaModule, AuthModule, CreditsModule],
  controllers: [PayController, AdminPayController],
  providers: [],
})
export class PayModule {}