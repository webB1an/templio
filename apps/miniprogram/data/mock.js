/**
 * P0 演示用 mock 数据。
 * 服务端模板接口接好后，页面会优先使用接口数据，失败时才回退到这里。
 */

const CATEGORIES = [
  { key: "all", name: "全部" },
  { key: "business", name: "商务汇报" },
  { key: "thesis", name: "毕业答辩" },
  { key: "education", name: "教育课件" },
  { key: "resume", name: "简历求职" },
  { key: "contract", name: "合同文书" },
  { key: "party", name: "党政汇报" },
  { key: "report", name: "工作总结" }
];

const TEMPLATES = [
  {
    id: "demo-01",
    title: "2026 年度经营分析汇报",
    category: "商务汇报",
    categoryKey: "business",
    format: "PPTX",
    pageCount: 28,
    sizeText: "12.6 MB",
    tags: ["商务", "简约", "蓝色"],
    tone: "blue",
    summary: "适合年度总结、经营分析、季度汇报的蓝色商务风模板，含图表与目录页。",
    shortLink: "https://templio.wdbzk.com/r/demo01",
    passcode: "tpl1",
    featured: true
  },
  {
    id: "demo-02",
    title: "硕士学位论文答辩模板",
    category: "毕业答辩",
    categoryKey: "thesis",
    format: "PPTX",
    pageCount: 22,
    sizeText: "9.8 MB",
    tags: ["学术", "答辩", "绿色"],
    tone: "green",
    summary: "学术风答辩模板，包含研究背景、方法、实验、结论与致谢章节。",
    shortLink: "https://templio.wdbzk.com/r/demo02",
    passcode: "tpl2",
    featured: true
  },
  {
    id: "demo-03",
    title: "七年级语文教学课件",
    category: "教育课件",
    categoryKey: "education",
    format: "PPTX",
    pageCount: 18,
    sizeText: "7.2 MB",
    tags: ["教学", "清新", "绿色"],
    tone: "teal",
    summary: "清新绿教学课件模板，适合语文/阅读写作课堂使用。",
    shortLink: "https://templio.wdbzk.com/r/demo03",
    passcode: "tpl3",
    featured: true
  },
  {
    id: "demo-04",
    title: "产品经理个人简历",
    category: "简历求职",
    categoryKey: "resume",
    format: "DOCX",
    pageCount: 2,
    sizeText: "620 KB",
    tags: ["简历", "简约", "单页"],
    tone: "slate",
    summary: "一页式产品经理简历模板，含项目经历与技能标签。",
    shortLink: "https://templio.wdbzk.com/r/demo04",
    passcode: "tpl4",
    featured: false
  },
  {
    id: "demo-05",
    title: "技术服务合同（规范版）",
    category: "合同文书",
    categoryKey: "contract",
    format: "DOCX",
    pageCount: 6,
    sizeText: "380 KB",
    tags: ["合同", "规范", "法律"],
    tone: "slate",
    summary: "标准技术服务合同模板，包含服务内容、费用、保密与违约条款。",
    shortLink: "https://templio.wdbzk.com/r/demo05",
    passcode: "tpl5",
    featured: false
  },
  {
    id: "demo-06",
    title: "党建学习专题汇报",
    category: "党政汇报",
    categoryKey: "party",
    format: "PPTX",
    pageCount: 30,
    sizeText: "15.1 MB",
    tags: ["党建", "红色", "庄重"],
    tone: "orange",
    summary: "红色庄重风格党政学习汇报模板，适用于专题学习与工作汇报。",
    shortLink: "https://templio.wdbzk.com/r/demo06",
    passcode: "tpl6",
    featured: true
  },
  {
    id: "demo-07",
    title: "季度工作总结（极简风）",
    category: "工作总结",
    categoryKey: "report",
    format: "PPTX",
    pageCount: 16,
    sizeText: "6.4 MB",
    tags: ["总结", "极简", "灰蓝"],
    tone: "indigo",
    summary: "极简灰蓝风季度总结模板，重点突出数据与结论。",
    shortLink: "https://templio.wdbzk.com/r/demo07",
    passcode: "tpl7",
    featured: false
  },
  {
    id: "demo-08",
    title: "校园活动策划方案",
    category: "工作总结",
    categoryKey: "report",
    format: "DOCX",
    pageCount: 8,
    sizeText: "540 KB",
    tags: ["策划", "校园", "活动"],
    tone: "pink",
    summary: "校园活动策划方案模板，包含活动背景、流程、预算与分工。",
    shortLink: "https://templio.wdbzk.com/r/demo08",
    passcode: "tpl8",
    featured: false
  }
];

function findTemplate(id) {
  return TEMPLATES.find((item) => item.id === id) || null;
}

module.exports = { CATEGORIES, TEMPLATES, findTemplate };
