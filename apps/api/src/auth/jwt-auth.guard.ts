import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface AdminJwtPayload {
  sub: number;
  username: string;
  role: string;
}

/**
 * 管理端 JWT 鉴权守卫：校验 Authorization: Bearer <token>
 * 校验通过后把 payload 挂到 request.admin 上。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }
    try {
      const token = header.slice(7);
      req.admin = await this.jwt.verifyAsync<AdminJwtPayload>(token);
      return true;
    } catch {
      throw new UnauthorizedException('invalid or expired token');
    }
  }
}
