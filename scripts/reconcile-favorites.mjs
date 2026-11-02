#!/usr/bin/env node
/**
 * 按真实收藏行重算 Template.favoriteCount，修复历史漂移。
 *
 * 用法（服务器上加载 .env 后）：
 *   cd /www/wwwroot/templio/apps/api
 *   set -a; . ./.env; set +a
 *   node ../../scripts/reconcile-favorites.mjs          # 只检查
 *   node ../../scripts/reconcile-favorites.mjs --apply  # 写入修正
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const shouldApply = process.argv.includes("--apply");
const prisma = new PrismaClient();

async function main() {
  const [templates, groups] = await Promise.all([
    prisma.template.findMany({ select: { id: true, title: true, favoriteCount: true } }),
    prisma.userFavorite.groupBy({ by: ["templateId"], _count: { _all: true } }),
  ]);
  const actual = new Map(groups.map((group) => [group.templateId, group._count._all]));
  const drift = [];
  for (const template of templates) {
    const count = actual.get(template.id) || 0;
    if (template.favoriteCount !== count) {
      drift.push({ ...template, actual: count });
    }
  }

  if (!drift.length) {
    console.log(`✔ favoriteCount 全部一致（${templates.length} 个模板）`);
    return;
  }

  console.log(`发现 ${drift.length} 个模板计数不一致：`);
  for (const item of drift) {
    console.log(`  - ${item.id} ${item.title || ""}：db=${item.favoriteCount} actual=${item.actual}`);
  }

  if (!shouldApply) {
    console.log("\n当前为 dry-run；确认后加 --apply 修正。");
    return;
  }

  for (const item of drift) {
    await prisma.template.update({
      where: { id: item.id },
      data: { favoriteCount: item.actual },
    });
  }
  console.log(`✔ 已修正 ${drift.length} 个模板的 favoriteCount`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
