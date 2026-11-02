/* eslint-disable no-console */
/**
 * 演示数据 seed（P0）
 * 幂等：按 sourceHash / category.slug / tag.name / shortLink.code upsert。
 * 运行：
 *   cd apps/api
 *   DATABASE_URL=... node prisma/seed.cjs
 */
const { createHash } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const CATEGORIES = [
  { slug: "business", name: "商务汇报", sort: 10 },
  { slug: "thesis", name: "毕业答辩", sort: 20 },
  { slug: "education", name: "教育课件", sort: 30 },
  { slug: "resume", name: "简历求职", sort: 40 },
  { slug: "contract", name: "合同文书", sort: 50 },
  { slug: "party", name: "党政汇报", sort: 60 },
  { slug: "report", name: "工作总结", sort: 70 }
];

const TEMPLATES = [
  {
    code: "demo01",
    title: "2026 年度经营分析汇报",
    category: "business",
    format: "pptx",
    pageCount: 28,
    fileSize: 12.6 * 1024 * 1024,
    originalName: "01-商务汇报-极简蓝.pptx",
    description: "适合年度总结、经营分析、季度汇报的蓝色商务风模板，含图表与目录页。",
    tags: ["商务", "简约", "蓝色"],
    tone: "blue",
    passcode: "tpl1",
    provider: "baidu",
    url: "https://pan.baidu.com/s/1demo01",
    viewCount: 328
  },
  {
    code: "demo02",
    title: "硕士学位论文答辩模板",
    category: "thesis",
    format: "pptx",
    pageCount: 22,
    fileSize: 9.8 * 1024 * 1024,
    originalName: "02-毕业答辩-学术风.pptx",
    description: "学术风答辩模板，包含研究背景、方法、实验、结论与致谢章节。",
    tags: ["学术", "答辩", "绿色"],
    tone: "green",
    passcode: "tpl2",
    provider: "baidu",
    url: "https://pan.baidu.com/s/1demo02",
    viewCount: 256
  },
  {
    code: "demo03",
    title: "七年级语文教学课件",
    category: "education",
    format: "pptx",
    pageCount: 18,
    fileSize: 7.2 * 1024 * 1024,
    originalName: "03-教学课件-清新绿.pptx",
    description: "清新绿教学课件模板，适合语文 / 阅读写作课堂使用。",
    tags: ["教学", "清新", "绿色"],
    tone: "teal",
    passcode: "tpl3",
    provider: "quark",
    url: "https://pan.quark.cn/s/1demo03",
    viewCount: 198
  },
  {
    code: "demo04",
    title: "产品经理个人简历",
    category: "resume",
    format: "docx",
    pageCount: 2,
    fileSize: 620 * 1024,
    originalName: "04-个人简历-简约.docx",
    description: "一页式产品经理简历模板，含项目经历与技能标签。",
    tags: ["简历", "简约", "单页"],
    tone: "slate",
    passcode: "tpl4",
    provider: "quark",
    url: "https://pan.quark.cn/s/1demo04",
    viewCount: 412
  },
  {
    code: "demo05",
    title: "技术服务合同（规范版）",
    category: "contract",
    format: "docx",
    pageCount: 6,
    fileSize: 380 * 1024,
    originalName: "05-项目合同-规范.docx",
    description: "标准技术服务合同模板，包含服务内容、费用、保密与违约条款。",
    tags: ["合同", "规范", "法律"],
    tone: "slate",
    passcode: "tpl5",
    provider: "baidu",
    url: "https://pan.baidu.com/s/1demo05",
    viewCount: 176
  },
  {
    code: "demo06",
    title: "党建学习专题汇报",
    category: "party",
    format: "pptx",
    pageCount: 30,
    fileSize: 15.1 * 1024 * 1024,
    originalName: "06-党政汇报-红色庄重.pptx",
    description: "红色庄重风格党政学习汇报模板，适用于专题学习与工作汇报。",
    tags: ["党建", "红色", "庄重"],
    tone: "orange",
    passcode: "tpl6",
    provider: "baidu",
    url: "https://pan.baidu.com/s/1demo06",
    viewCount: 233
  },
  {
    code: "demo07",
    title: "季度工作总结（极简风）",
    category: "report",
    format: "pptx",
    pageCount: 16,
    fileSize: 6.4 * 1024 * 1024,
    originalName: "07-工作总结-极简.pptx",
    description: "极简灰蓝风季度总结模板，重点突出数据与结论。",
    tags: ["总结", "极简", "数据"],
    tone: "indigo",
    passcode: "tpl7",
    provider: "quark",
    url: "https://pan.quark.cn/s/1demo07",
    viewCount: 187
  },
  {
    code: "demo08",
    title: "校园活动策划方案",
    category: "report",
    format: "docx",
    pageCount: 8,
    fileSize: 540 * 1024,
    originalName: "08-校园活动策划.docx",
    description: "校园活动策划方案模板，包含活动背景、流程、预算与分工。",
    tags: ["策划", "校园", "活动"],
    tone: "pink",
    passcode: "tpl8",
    provider: "baidu",
    url: "https://pan.baidu.com/s/1demo08",
    viewCount: 145
  }
];

function sourceHashFor(title) {
  return createHash("sha256").update(`templio-seed:${title}`).digest("hex");
}

async function main() {
  const categoryIds = {};
  for (const category of CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, sort: category.sort },
      create: { slug: category.slug, name: category.name, sort: category.sort }
    });
    categoryIds[category.slug] = row.id;
  }

  let templateCount = 0;
  for (const item of TEMPLATES) {
    const sourceHash = sourceHashFor(item.title);
    const template = await prisma.template.upsert({
      where: { sourceHash },
      update: {
        title: item.title,
        description: item.description,
        status: "published",
        categoryId: categoryIds[item.category],
        format: item.format,
        pageCount: item.pageCount,
        fileSize: BigInt(Math.round(item.fileSize)),
        originalName: item.originalName,
        batchKey: "seed",
        publishedAt: new Date()
      },
      create: {
        sourceHash,
        title: item.title,
        description: item.description,
        status: "published",
        categoryId: categoryIds[item.category],
        format: item.format,
        pageCount: item.pageCount,
        fileSize: BigInt(Math.round(item.fileSize)),
        originalName: item.originalName,
        batchKey: "seed",
        viewCount: item.viewCount,
        publishedAt: new Date()
      }
    });

    await prisma.templateTag.deleteMany({ where: { templateId: template.id } });
    for (let index = 0; index < item.tags.length; index += 1) {
      const name = item.tags[index];
      const tag = await prisma.tag.upsert({
        where: { name },
        update: {},
        create: { name, type: "style" }
      });
      await prisma.templateTag.create({
        data: { templateId: template.id, tagId: tag.id, sort: index }
      });
    }

    await prisma.netdiskLink.deleteMany({ where: { templateId: template.id } });
    const link = await prisma.netdiskLink.create({
      data: {
        templateId: template.id,
        provider: item.provider,
        url: item.url,
        passcode: item.passcode,
        status: "synced",
        isPrimary: true,
        isActive: true
      }
    });

    await prisma.shortLink.upsert({
      where: { code: item.code },
      update: { templateId: template.id, netdiskLinkId: link.id, provider: item.provider },
      create: {
        code: item.code,
        templateId: template.id,
        netdiskLinkId: link.id,
        provider: item.provider
      }
    });

    templateCount += 1;
  }

  console.log(`seed done: ${CATEGORIES.length} categories, ${templateCount} templates`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
