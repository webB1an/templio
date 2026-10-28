import { Injectable, UnauthorizedException, ForbiddenException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { AdminJwtPayload } from './jwt-auth.guard';

const TOKEN_TTL = '12h';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { username } });
    if (!admin || !admin.enabled) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });
    const payload: AdminJwtPayload = { sub: admin.id, username: admin.username, role: admin.role };
    return {
      accessToken: await this.jwt.signAsync(payload, { expiresIn: TOKEN_TTL }),
      expiresIn: TOKEN_TTL,
      profile: { id: admin.id, username: admin.username, role: admin.role },
    };
  }

  async profile(adminId: number) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { id: true, username: true, role: true, enabled: true, lastLoginAt: true, createdAt: true },
    });
    if (!admin?.enabled) throw new UnauthorizedException('账号不可用');
    return admin;
  }

  /** 创建管理员（仅 super 角色） */
  async createAdmin(username: string, password: string, role: string) {
    const exists = await this.prisma.adminUser.findUnique({ where: { username } });
    if (exists) throw new ConflictException('用户名已存在');
    const passwordHash = await bcrypt.hash(password, 10);
    return this.prisma.adminUser.create({
      data: { username, passwordHash, role: role as never },
      select: { id: true, username: true, role: true, enabled: true, createdAt: true },
    });
  }

  /** 管理员列表（仅 super） */
  listAdmins() {
    return this.prisma.adminUser.findMany({
      select: { id: true, username: true, role: true, enabled: true, lastLoginAt: true, createdAt: true },
      orderBy: { id: 'asc' },
    });
  }

  /** 更新管理员状态/角色（仅 super；不允许停用自己） */
  async updateAdmin(id: number, currentAdminId: number, data: { enabled?: boolean; role?: string }) {
    if (id === currentAdminId && data.enabled === false) {
      throw new ForbiddenException('不能停用自己的账号');
    }
    return this.prisma.adminUser.update({
      where: { id },
      data: {
        ...(data.enabled === undefined ? {} : { enabled: data.enabled }),
        ...(data.role === undefined ? {} : { role: data.role as never }),
      },
      select: { id: true, username: true, role: true, enabled: true },
    });
  }

  /** 重置密码（super 重置他人；本人改自己的） */
  async resetPassword(id: number, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.adminUser.update({ where: { id }, data: { passwordHash } });
    return { ok: true };
  }
}
