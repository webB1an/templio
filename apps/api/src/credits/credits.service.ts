import { Injectable, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

/** 默认规则值，可通过管理端 SystemConfig 覆盖（key: checkin_reward / share_reward / share_reward_daily_cap） */
const DEFAULTS = {
  checkin_reward: 10,
  share_reward: 5,
  share_reward_daily_cap: 50,
};

export type CreditLedgerType =
  | 'recharge'
  | 'gift'
  | 'checkin'
  | 'share_reward'
  | 'unlock_deduct'
  | 'admin_adjust'
  | 'refund_deduct';

@Injectable()
export class CreditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getRule(key: keyof typeof DEFAULTS): Promise<number> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key } });
    const v = Number(row?.value);
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : DEFAULTS[key];
  }

  /** 读余额；账户不存在视为 0（不自动建，读端宽容） */
  async getBalance(userId: number) {
    const [account, todayCheckin, totalEarned] = await Promise.all([
      this.prisma.creditAccount.findUnique({ where: { userId } }),
      this.todayCheckin(userId),
      this.prisma.creditLedger.aggregate({
        where: { userId, type: { in: ['recharge', 'gift', 'checkin', 'share_reward'] } },
        _sum: { amount: true },
      }),
    ]);
    return {
      balance: account?.balance ?? 0,
      checkedInToday: !!todayCheckin,
      totalEarned: totalEarned._sum.amount ?? 0,
    };
  }

  private async todayCheckin(userId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.prisma.checkinRecord.findUnique({
      where: { userId_date: { userId, date: today } },
    });
  }

  async ledger(userId: number, page = 1, pageSize = 20) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.creditLedger.findMany({
        where: { userId },
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.creditLedger.count({ where: { userId } }),
    ]);
    return { items, total, page, pageSize };
  }

  /**
   * 每日签到：CheckinRecord 主键 (userId, date) 天然幂等。
   * 连续天数按"昨天是否签到"递增；奖励写 ledger（幂等键 checkin:{userId}:{date}）。
   */
  async checkin(userId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exists = await this.todayCheckin(userId);
    if (exists) {
      throw new ConflictException('今天已经签到过啦');
    }
    const reward = await this.getRule('checkin_reward');
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayRecord = await this.prisma.checkinRecord.findUnique({
      where: { userId_date: { userId, date: yesterday } },
    });
    const streakDays = (yesterdayRecord?.streakDays ?? 0) + 1;

    return this.prisma.$transaction(async (tx) => {
      // createMany 不做回读，规避 @db.Date 主键 create 的返回匹配问题；唯一键冲突 = 已签到
      try {
        await tx.checkinRecord.createMany({ data: { userId, date: today, reward, streakDays } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException('今天已经签到过啦');
        }
        throw e;
      }
      const balanceAfter = await this.credit(tx, {
        userId,
        type: 'checkin',
        amount: reward,
        idempotentKey: `checkin:${userId}:${today.toISOString().slice(0, 10)}`,
        reason: `连续签到 ${streakDays} 天`,
      });
      return { reward, streakDays, balance: balanceAfter };
    });
  }

  /**
   * 分享奖励上报：被分享者打开分享页时调用。
   * 防刷（PRD §3.5）：同一 sharer+template 仅首次计奖；sharer 每日奖励有上限。
   */
  async shareEvent(receiverId: number, templateId: number, sharerId: number) {
    if (sharerId === receiverId) {
      throw new BadRequestException('不能给自己发分享奖励');
    }
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, status: 'published' },
      select: { id: true },
    });
    if (!template) throw new BadRequestException('模板不存在');

    // 幂等：unique(sharerId, templateId)
    const dup = await this.prisma.shareReward.findUnique({
      where: { sharerId_templateId: { sharerId, templateId } },
    });
    if (dup) {
      return { rewarded: false, reason: '该分享已计过奖励' };
    }

    // 分享者当日已获奖励
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const todayEarned = await this.prisma.creditLedger.aggregate({
      where: { userId: sharerId, type: 'share_reward', createdAt: { gte: dayStart } },
      _sum: { amount: true },
    });
    const cap = await this.getRule('share_reward_daily_cap');
    if ((todayEarned._sum.amount ?? 0) >= cap) {
      return { rewarded: false, reason: '分享者今日奖励已达上限' };
    }

    const reward = Math.min(await this.getRule('share_reward'), cap - (todayEarned._sum.amount ?? 0));
    if (reward <= 0) return { rewarded: false, reason: '分享者今日奖励已达上限' };

    return this.prisma.$transaction(async (tx) => {
      try {
        await tx.shareReward.create({ data: { sharerId, receiverId, templateId, reward } });
      } catch {
        // 并发重复：唯一键冲突视为已计奖
        return { rewarded: false, reason: '该分享已计过奖励' };
      }
      const balance = await this.credit(tx, {
        userId: sharerId,
        type: 'share_reward',
        amount: reward,
        idempotentKey: `share:${sharerId}:${templateId}`,
        reason: `分享奖励（模板 ${templateId}）`,
      });
      return { rewarded: true, reward, balance };
    });
  }

  /**
   * 原子加积分（幂等键唯一）。必须在事务内调用（传入 tx）。
   * 返回加后的余额。
   */
  async credit(
    tx: Prisma.TransactionClient,
    opts: { userId: number; type: CreditLedgerType; amount: number; idempotentKey: string; reason?: string },
  ): Promise<number> {
    if (opts.amount <= 0) throw new BadRequestException('积分数额必须为正');
    // 幂等：已存在同键流水则直接返回当前余额
    const existing = await tx.creditLedger.findUnique({ where: { idempotentKey: opts.idempotentKey } });
    if (existing) return existing.balanceAfter;
    // 确保账户存在
    await tx.creditAccount.upsert({
      where: { userId: opts.userId },
      create: { userId: opts.userId, balance: 0 },
      update: {},
    });
    const account = await tx.creditAccount.update({
      where: { userId: opts.userId },
      data: { balance: { increment: opts.amount } },
    });
    await tx.creditLedger.create({
      data: {
        userId: opts.userId,
        type: opts.type,
        amount: opts.amount,
        balanceAfter: account.balance,
        idempotentKey: opts.idempotentKey,
        reason: opts.reason,
      },
    });
    return account.balance;
  }

  /**
   * 原子扣积分（余额不足即失败）。必须在事务内调用。
   * 返回扣后的余额。
   */
  async deduct(
    tx: Prisma.TransactionClient,
    opts: { userId: number; type: CreditLedgerType; amount: number; idempotentKey: string; reason?: string },
  ): Promise<number> {
    if (opts.amount <= 0) throw new BadRequestException('积分数额必须为正');
    const existing = await tx.creditLedger.findUnique({ where: { idempotentKey: opts.idempotentKey } });
    if (existing) return existing.balanceAfter;
    // 原子扣减：balance >= amount 才更新（单条 UPDATE，天然防并发超扣）
    const updated = await tx.creditAccount.updateMany({
      where: { userId: opts.userId, balance: { gte: opts.amount } },
      data: { balance: { decrement: opts.amount } },
    });
    if (updated.count === 0) {
      throw new ForbiddenException('积分余额不足');
    }
    const account = await tx.creditAccount.findUniqueOrThrow({ where: { userId: opts.userId } });
    await tx.creditLedger.create({
      data: {
        userId: opts.userId,
        type: opts.type,
        amount: -opts.amount,
        balanceAfter: account.balance,
        idempotentKey: opts.idempotentKey,
        reason: opts.reason,
      },
    });
    return account.balance;
  }

  /** 积分解锁模板（幂等：TemplateUnlock 主键 userId+templateId） */
  async unlockTemplate(userId: number, templateId: number) {
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, status: 'published' },
      select: { id: true, title: true, baseCreditPrice: true },
    });
    if (!template) throw new BadRequestException('模板不存在或未发布');
    if (template.baseCreditPrice === 0) {
      throw new BadRequestException('免费模板无需解锁');
    }
    const already = await this.prisma.templateUnlock.findUnique({
      where: { userId_templateId: { userId, templateId } },
    });
    if (already) {
      return { unlocked: true, alreadyUnlocked: true, balance: (await this.getBalance(userId)).balance };
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.templateUnlock.create({ data: { userId, templateId, creditsSnapshot: template.baseCreditPrice } });
      const balance = await this.deduct(tx, {
        userId,
        type: 'unlock_deduct',
        amount: template.baseCreditPrice,
        idempotentKey: `unlock:${userId}:${templateId}`,
        reason: `解锁「${template.title}」`,
      });
      return { unlocked: true, alreadyUnlocked: false, balance };
    });
  }

  /** 用户是否已解锁某模板 */
  async hasUnlocked(userId: number, templateId: number) {
    const u = await this.prisma.templateUnlock.findUnique({
      where: { userId_templateId: { userId, templateId } },
    });
    return !!u;
  }

  /** 充值到账（支付回调后调用） */
  async recharge(orderNo: string, userId: number, credits: number) {
    return this.prisma.$transaction((tx) =>
      this.credit(tx, {
        userId,
        type: 'recharge',
        amount: credits,
        idempotentKey: `order:${orderNo}`,
        reason: `充值订单 ${orderNo}`,
      }),
    );
  }
}
