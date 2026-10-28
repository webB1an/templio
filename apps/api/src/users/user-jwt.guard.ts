import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface UserJwtPayload {
  sub: number;
  openid: string;
  scope: 'user';
}

/**
 * 用户端 JWT 鉴权守卫（与 admin JwtAuthGuard 分开，payload 挂 request.user）。
 */
@Injectable()
export class UserJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('请先登录');
    }
    try {
      const payload = await this.jwt.verifyAsync<UserJwtPayload>(header.slice(7));
      if (payload.scope !== 'user') throw new Error('wrong scope');
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }
  }
}

/**
 * 可选用户鉴权：有合法 token 时挂 request.user，没有也放行。
 * 用于 share-links 等登录后体验更佳但不强制的接口。
 */
@Injectable()
export class OptionalUserJwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (header?.startsWith('Bearer ')) {
      try {
        const payload = await this.jwt.verifyAsync<UserJwtPayload>(header.slice(7));
        if (payload.scope === 'user') req.user = payload;
      } catch {
        // 无效 token 视为未登录
      }
    }
    return true;
  }
}
