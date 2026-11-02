import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";

export interface AdminTokenPayload {
  sub: string;
  exp: number;
}

@Injectable()
export class AdminAuthService {
  private readonly username = process.env.ADMIN_USERNAME?.trim() || "admin";
  private readonly password = process.env.ADMIN_PASSWORD?.trim() || "change-me";
  private readonly secret = process.env.JWT_SECRET?.trim() || "templio-dev-secret";

  login(username: string, password: string): {
    token: string;
    username: string;
    expiresIn: number;
  } {
    if (username !== this.username || password !== this.password) {
      throw new UnauthorizedException("账号或密码错误");
    }
    const expiresIn = 60 * 60 * 12;
    const exp = Math.floor(Date.now() / 1000) + expiresIn;
    return { token: this.sign({ sub: username, exp }), username, expiresIn };
  }

  verify(token: string): AdminTokenPayload {
    const [body, signature] = String(token || "").split(".");
    if (!body || !signature) throw new UnauthorizedException("无效的登录状态");
    const expected = this.signature(body);
    const actual = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) {
      throw new UnauthorizedException("无效的登录状态");
    }
    let payload: AdminTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AdminTokenPayload;
    } catch {
      throw new UnauthorizedException("无效的登录状态");
    }
    if (!payload.exp || payload.exp * 1000 < Date.now()) {
      throw new UnauthorizedException("登录已过期，请重新登录");
    }
    return payload;
  }

  private sign(payload: AdminTokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${this.signature(body)}`;
  }

  private signature(body: string): string {
    return createHmac("sha256", this.secret).update(body).digest("base64url");
  }
}
