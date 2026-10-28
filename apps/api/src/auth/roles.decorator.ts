import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'admin_roles';

/** 声明允许访问的管理角色，如 @Roles('super') */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
