# Templio

PPT / Word 模板库小程序：微信小程序（用户端）+ Web 管理端 + NestJS 服务端 + 桌面批处理 CLI。

> 当前阶段：**P0 打样**（渲染管线 + 环境验证），未上线。
> 规划文档见 `docs/`，开工前请先读 `docs/01-流程确认稿-v1.md` 与 `docs/03-资源受限部署修订.md`。

## 目录

```
templio/
├── apps/
│   ├── desktop-cli/      桌面批处理 CLI（LibreOffice 渲染 + 物料包 + 上传）
│   ├── api/              服务端（NestJS，待建）
│   ├── admin/            Web 管理端（React + AntD，待建）
│   └── miniprogram/      微信原生小程序（液态玻璃，待建）
├── packages/
│   └── shared/           跨端契约：枚举、物料包 schema、图片规格
├── docs/                 规划与设计文档
├── scripts/              运维 / 验收脚本（待建）
└── deploy/               部署配置（待建）
```

## 快速开始

```bash
npm install

# 渲染环境检查（需要 LibreOffice + 中文字体）
npm run doctor

# 运行 CLI
npm run cli -- doctor
npm run cli -- --help
```

## 约束（个人开发者）

- 服务器：2 核 / 2G / 40G，**不使用 Redis**，图片直出（无 CDN/OSS）
- 源文件上传网盘并校验后**立即删除**，服务器只保留封面/预览/文字
- 渲染在 Windows 桌面完成，服务器只做存储、任务调度与小体积图片分发

详见 `docs/03-资源受限部署修订.md`。

## 文档

- [00 思路可行性与流程拷打](docs/00-思路可行性与流程拷打.md)
- [01 流程确认稿 v1](docs/01-流程确认稿-v1.md)
- [02 可行性复核（产品 × 技术）](docs/02-可行性复核-产品与技术.md)
- [03 资源受限部署修订](docs/03-资源受限部署修订.md)
