import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { UserJwtPayload } from './user-jwt.guard';

const USER_TOKEN_TTL = '30d';

interface Code2SessionResult {
  openid?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** 小程序登录：code 换 openid → upsert 用户 → 签发用户 JWT */
  async wxLogin(code: string) {
    const openid = await this.resolveOpenid(code);
    const user = await this.prisma.user.upsert({
      where: { openid },
      create: { openid },
      update: {},
    });
    if (user.status !== 'active') {
      throw new UnauthorizedException('账号不可用');
    }
    // 确保积分账户存在
    await this.prisma.creditAccount.upsert({
      where: { userId: user.id },
      create: { userId: user.id, balance: 0 },
      update: {},
    });
    const payload: UserJwtPayload = { sub: user.id, openid: user.openid, scope: 'user' };
    return {
      accessToken: await this.jwt.signAsync(payload, { expiresIn: USER_TOKEN_TTL }),
      profile: { id: user.id, openid: user.openid, nickname: user.nickname, avatarUrl: user.avatarUrl },
    };
  }

  private async resolveOpenid(code: string): Promise<string> {
    // 联调模式：MOCK_AUTH=true 时 code 即 openid（仅供开发调试，生产必须关闭）
    if (this.config.get('MOCK_AUTH') === 'true') {
      return `mock_${code.slice(0, 32)}`;
    }
    const appid = this.config.get<string>('WX_APPID');
    const secret = this.config.get<string>('WX_APP_SECRET');
    if (!appid || !secret) {
      throw new UnauthorizedException('服务端未配置微信登录凭证');
    }
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = (await res.json()) as Code2SessionResult;
    if (!data.openid) {
      this.logger.warn(`code2session 失败 errcode=${data.errcode} errmsg=${data.errmsg}`);
      throw new UnauthorizedException('微信登录失败，请重试');
    }
    if (data.unionid) {
      // unionid 有值时记录（多端打通预留）
      await this.prisma.user.updateMany({
        where: { openid: data.openid, unionid: null },
        data: { unionid: data.unionid },
      });
    }
    return data.openid;
  }

  async me(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, openid: true, nickname: true, avatarUrl: true, createdAt: true, creditAccount: { select: { balance: true } } },
    });
    if (!user) throw new UnauthorizedException('用户不存在');
    return {
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      balance: user.creditAccount?.balance ?? 0,
    };
  }
}
