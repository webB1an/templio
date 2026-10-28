import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

/**
 * 角色守卫：与 JwtAuthGuard 配对使用（@UseGuards(JwtAuthGuard, RolesGuard)）。
 * 无 @Roles 元数据时默认放行；有元数据时校验 req.admin.role。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const { admin } = context.switchToHttp().getRequest();
    if (!admin?.role || !required.includes(admin.role)) {
      throw new ForbiddenException('权限不足');
    }
    return true;
  }
}
