import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

const require = createRequire(import.meta.url);
// pptxgenjs v4 的 .d.ts 在 NodeNext 下解析成模块命名空间，无法直接 new；运行时用 CJS require 拿构造函数。
const PptxGenJS = require("pptxgenjs") as new () => PresentationLike;

interface PresentationLike {
  layout: string;
  author: string;
  company: string;
  title: string;
  addSlide(): SlideLike;
  writeFile(options: { fileName: string }): Promise<string>;
}

interface SlideLike {
  background: unknown;
  addText(text: unknown, options: Record<string, unknown>): void;
}

interface PptxTheme {
  background: string;
  titleColor: string;
  accentColor: string;
  bodyColor: string;
}

interface DeckPage {
  heading: string;
  bullets: string[];
}

/**
 * 生成一组合成测试模板（PPT/Word），用于在拿到真实模板前验证渲染管线。
 * 真实模板到位后，这些只作为回归样本。
 */
export async function runFixtures(outDir: string): Promise<number> {
  const root = resolve(outDir);
  await mkdir(root, { recursive: true });
  const created: string[] = [];

  created.push(
    await makePptx(
      join(root, "01-商务汇报-极简蓝.pptx"),
      {
        background: "F3F6FC",
        titleColor: "1B2B5B",
        accentColor: "2F6BE4",
        bodyColor: "3C4858",
      },
      "2026 年度经营分析汇报",
      "战略复盘 · 增长计划 · 预算安排",
      [
        { heading: "01 上一年度经营复盘", bullets: ["营收同比增长 18.6%", "核心业务毛利率提升 3.2 个百分点", "新客获取成本下降 12%"] },
        { heading: "02 下一年度增长计划", bullets: ["聚焦高毛利业务线", "加强渠道合作与内容投放", "组织能力升级与人才梯队建设"] },
        { heading: "03 预算与风险提示", bullets: ["市场投入预算增加 15%", "关注原材料价格波动", "建立月度经营分析机制"] },
      ],
    ),
  );

  created.push(
    await makePptx(
      join(root, "02-毕业答辩-学术风.pptx"),
      {
        background: "FFFFFF",
        titleColor: "1F3A2E",
        accentColor: "2E7D5B",
        bodyColor: "45524A",
      },
      "基于深度学习的图像分类方法研究",
      "硕士学位论文答辩 · 2026 届",
      [
        { heading: "研究背景与意义", bullets: ["图像数据规模快速增长", "传统方法在复杂场景下泛化能力不足", "深度模型为自动化分类提供新思路"] },
        { heading: "方法与实验设计", bullets: ["构建多尺度特征融合网络", "在公开数据集上进行对比实验", "消融实验验证各模块有效性"] },
        { heading: "结论与展望", bullets: ["方法在准确率上提升 4.3%", "下一步将探索轻量化部署", "感谢各位老师批评指正"] },
      ],
    ),
  );

  created.push(
    await makePptx(
      join(root, "03-教学课件-清新绿.pptx"),
      {
        background: "F2FAF4",
        titleColor: "1D4B33",
        accentColor: "3FA46A",
        bodyColor: "3F5A4A",
      },
      "七年级语文：记叙文的写作方法",
      "阅读与写作 · 第一课时",
      [
        { heading: "学习目标", bullets: ["理解记叙文的六要素", "掌握细节描写的方法", "完成一篇 500 字片段练习"] },
        { heading: "课堂活动", bullets: ["小组合作分析范文", "仿写一个生活场景", "班级分享与互评"] },
        { heading: "课后作业", bullets: ["观察家人的一个日常动作", "用 200 字写出细节", "下节课带来交流"] },
      ],
    ),
  );

  created.push(
    await makeDocx(join(root, "04-个人简历-简约.docx"), "个人简历：李明 · 产品经理", [
      "求职意向：高级产品经理 / 互联网 · 上海",
      "联系方式：13800000000 · liming@example.com",
      "个人简介：6 年 B 端产品经验，主导过 3 个从 0 到 1 的项目，擅长需求分析与数据驱动迭代。",
      "工作经历：2021.06 - 至今 某科技公司 产品经理；2019.07 - 2021.05 某创业公司 产品助理。",
      "项目经历：企业协作平台（日活 12 万）、数据分析看板（服务 200+ 企业客户）。",
      "教育背景：华东师范大学 信息管理与信息系统 本科。",
      "技能标签：Axure / Figma / SQL / 数据分析 / 用户研究。",
    ]),
  );

  created.push(
    await makeDocx(join(root, "05-项目合同-规范.docx"), "技术服务合同（模板）", [
      "甲方（委托方）：____________    乙方（服务方）：____________",
      "第一条 服务内容：乙方为甲方提供技术咨询与系统实施服务，具体范围见附件一。",
      "第二条 服务期限：自 ____ 年 __ 月 __ 日起至 ____ 年 __ 月 __ 日止。",
      "第三条 服务费用：合同总金额为人民币 ____ 元（大写：____________），分两期支付。",
      "第四条 双方权利义务：甲方应提供必要资料与配合；乙方应按约定进度交付成果。",
      "第五条 保密条款：双方对合作过程中知悉的商业秘密负有保密义务。",
      "第六条 违约责任：任何一方违反合同约定，应承担相应违约责任。",
    ]),
  );

  console.log(`已生成 ${created.length} 个测试模板 → ${root}`);
  for (const filePath of created) console.log(`  ✓ ${filePath}`);
  return 0;
}

async function makePptx(
  filePath: string,
  theme: PptxTheme,
  deckTitle: string,
  deckSubtitle: string,
  pages: DeckPage[],
): Promise<string> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "Templio";
  pptx.company = "Templio";
  pptx.title = deckTitle;

  const cover = pptx.addSlide();
  cover.background = { color: theme.background };
  cover.addText(deckTitle, {
    x: 0.7,
    y: 1.5,
    w: 8.6,
    h: 1.3,
    fontFace: "Microsoft YaHei",
    fontSize: 36,
    bold: true,
    color: theme.titleColor,
  });
  cover.addText(deckSubtitle, {
    x: 0.7,
    y: 2.9,
    w: 8.6,
    h: 0.6,
    fontFace: "Microsoft YaHei",
    fontSize: 18,
    color: theme.accentColor,
  });
  cover.addText("Templio 模板测样 · 渲染管线验证", {
    x: 0.7,
    y: 4.9,
    w: 8.6,
    h: 0.4,
    fontFace: "Microsoft YaHei",
    fontSize: 11,
    color: theme.bodyColor,
  });

  for (const page of pages) {
    const slide = pptx.addSlide();
    slide.background = { color: theme.background };
    slide.addText(page.heading, {
      x: 0.7,
      y: 0.6,
      w: 8.6,
      h: 0.8,
      fontFace: "Microsoft YaHei",
      fontSize: 28,
      bold: true,
      color: theme.titleColor,
    });
    slide.addText(
      page.bullets.map((bullet) => ({
        text: bullet,
        options: { bullet: true, color: theme.bodyColor },
      })),
      {
        x: 0.9,
        y: 1.7,
        w: 8.2,
        h: 2.8,
        fontFace: "Microsoft YaHei",
        fontSize: 18,
        lineSpacing: 28,
        color: theme.bodyColor,
      },
    );
  }

  await pptx.writeFile({ fileName: filePath });
  return filePath;
}

async function makeDocx(filePath: string, title: string, paragraphs: string[]): Promise<string> {
  const document = new Document({
    creator: "Templio",
    title,
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [
              new TextRun({ text: title, bold: true, size: 44, font: "Microsoft YaHei" }),
            ],
          }),
          ...paragraphs.map(
            (paragraph) =>
              new Paragraph({
                children: [new TextRun({ text: paragraph, size: 22, font: "Microsoft YaHei" })],
              }),
          ),
        ],
      },
    ],
  });
  await writeFile(filePath, await Packer.toBuffer(document));
  return filePath;
}
