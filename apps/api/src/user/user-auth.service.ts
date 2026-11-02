import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

export interface UserTokenPayload {
  sub: string;
  exp: number;
}

@Injectable()
export class UserAuthService {
  private readonly appId = (process.env.MINIPROGRAM_APPID || process.env.WECHAT_APPID || "").trim();
  private readonly appSecret = (process.env.WECHAT_APP_SECRET || "").trim();
  private readonly secret = `${(process.env.JWT_SECRET || "templio-dev-secret").trim()}:user`;

  constructor(private readonly prisma: PrismaService) {}

  async loginWithCode(code: string): Promise<{
    token: string;
    user: { id: string; nickname: string | null; avatar: string | null };
  }> {
    if (!code) throw new BadRequestException("缺少微信登录 code");
    if (!this.appId || !this.appSecret) {
      throw new BadRequestException("服务端未配置微信小程序 AppID / AppSecret");
    }

    const endpoint =
      "https://api.weixin.qq.com/sns/jscode2session" +
      `?appid=${encodeURIComponent(this.appId)}` +
      `&secret=${encodeURIComponent(this.appSecret)}` +
      `&js_code=${encodeURIComponent(code)}` +
      "&grant_type=authorization_code";

    let data: { openid?: string; errcode?: number; errmsg?: string };
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
      data = (await response.json()) as typeof data;
    } catch {
      throw new UnauthorizedException("微信登录服务暂时不可用，请稍后重试");
    }

    if (data.errcode || !data.openid) {
      const detail = data.errcode ? `（${data.errcode}: ${data.errmsg || "未知错误"}）` : "";
      throw new UnauthorizedException(`微信登录失败${detail}`);
    }

    const user = await this.prisma.user.upsert({
      where: { openid: data.openid },
      update: {},
      create: { openid: data.openid },
    });

    const expiresIn = 60 * 60 * 24 * 30;
    const exp = Math.floor(Date.now() / 1000) + expiresIn;
    return {
      token: this.sign({ sub: user.id, exp }),
      user: { id: user.id, nickname: user.nickname, avatar: user.avatar },
    };
  }

  async getTokenLifetime(): Promise<number> {
    return 60 * 60 * 24 * 30;
  }

  verify(token: string): UserTokenPayload {
    const [body, signature] = String(token || "").split(".");
    if (!body || !signature) throw new UnauthorizedException("未登录");
    const expected = this.signature(body);
    const actual = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) {
      throw new UnauthorizedException("登录状态无效");
    }
    let payload: UserTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as UserTokenPayload;
    } catch {
      throw new UnauthorizedException("登录状态无效");
    }
    if (!payload.exp || payload.exp * 1000 < Date.now()) {
      throw new UnauthorizedException("登录已过期");
    }
    return payload;
  }

  private sign(payload: UserTokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${this.signature(body)}`;
  }

  private signature(body: string): string {
    return createHmac("sha256", this.secret).update(body).digest("base64url");
  }
}
