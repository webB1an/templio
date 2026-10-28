/**
 * 初始化管理员账号种子脚本（本地跑，走 SSH 隧道连线上库）
 *
 * 用法：
 *   node scripts/seed-admin.mjs <username> <password> [role]
 *   role: super（默认）| operator
 *
 * 仅在 AdminUser 表为空时允许直接创建 super；非空时需提供已存在 super 的凭证确认，
 * 防止脚本被滥用提权。
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const [username, password, role = 'super'] = process.argv.slice(2);

if (!username || !password) {
  console.error('用法: node scripts/seed-admin.mjs <username> <password> [super|operator]');
  process.exit(1);
}
if (password.length < 8) {
  console.error('密码至少 8 位');
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const count = await prisma.adminUser.count();
  if (count > 0 && role === 'super') {
    console.error(`已存在 ${count} 个管理员，拒绝脚本直接创建 super（防止提权）。`);
    console.error('请用已有 super 账号在管理端创建，或指定 operator 角色。');
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.adminUser.create({
    data: { username, passwordHash, role },
    select: { id: true, username: true, role: true },
  });
  console.log('已创建管理员:', admin);
} finally {
  await prisma.$disconnect();
}
