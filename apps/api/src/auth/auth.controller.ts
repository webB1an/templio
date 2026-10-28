import { Body, Controller, Get, Post, UseGuards, Req, Param, Patch, ForbiddenException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, Length, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';

class LoginDto {
  @IsString()
  @Length(2, 64)
  username!: string;

  @IsString()
  @Length(6, 64)
  password!: string;
}

class CreateAdminDto {
  @IsString()
  @Length(2, 64)
  username!: string;

  @IsString()
  @MinLength(8)
  @Length(8, 64)
  password!: string;

  @IsOptional()
  @IsString()
  role?: string; // super | operator
}

class UpdateAdminDto {
  @IsOptional()
  @IsString()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  role?: string;
}

class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  @Length(8, 64)
  password!: string;
}

/**
 * 管理端认证与管理员账号管理
 * POST /api/admin/auth/login          登录
 * GET  /api/admin/auth/profile        当前管理员信息
 * GET  /api/admin/users               管理员列表（super）
 * POST /api/admin/users               创建管理员（super）
 * PATCH /api/admin/users/:id          状态/角色（super）
 * PATCH /api/admin/users/me/password  修改自己的密码
 */
@Controller('admin')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @Get('auth/profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  profile(@Req() req: { admin: { sub: number } }) {
    return this.auth.profile(req.admin.sub);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super')
  listUsers() {
    return this.auth.listAdmins();
  }

  @Post('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super')
  createUser(@Req() req: { admin: { sub: number } }, @Body() dto: CreateAdminDto) {
    return this.auth.createAdmin(dto.username, dto.password, dto.role ?? 'operator');
  }

  @Patch('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super')
  updateUser(
    @Req() req: { admin: { sub: number } },
    @Param('id') id: string,
    @Body() dto: UpdateAdminDto,
  ) {
    const adminId = Number(id);
    if (!Number.isInteger(adminId)) throw new ForbiddenException('invalid id');
    return this.auth.updateAdmin(adminId, req.admin.sub, dto);
  }

  @Patch('users/me/password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async resetMyPassword(
    @Req() req: { admin: { sub: number } },
    @Body() dto: ResetPasswordDto,
  ) {
    return this.auth.resetPassword(req.admin.sub, dto.password);
  }
}
