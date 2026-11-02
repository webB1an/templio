# Changelog

## v0.1.0（2026-11-02）

首个可运营版本：服务端 + Web 管理端 + 微信小程序（用户端）+ 桌面 CLI + CI/CD + 运维监控。

### 服务端（NestJS + Prisma + MySQL）

- 公开 API：模板列表/详情/分类聚合、封面/预览图、短链 302
- 管理端 API：JWT 登录、概览统计、模板增删改查/上下架/批量、CSV 导出
- 微信静默登录：`wx.login` → `jscode2session` → openid → 30 天 token
- 用户收藏、下载记录、浏览/复制计数
- 物料包导入（multipart），源文件暂存/下载/清理
- 网盘链接/提取码配置、短链自动生成、`NETDISK_SYNC_COMMAND` 同步任务框架
- DeepSeek AI 标注（单条/批量/自动应用 ≥90%）、网盘同步任务
- 安全：登录限流、CORS 白名单、安全响应头、隐藏 X-Powered-By

### Web 管理端（React 19 + Vite + AntD）

- 登录、数据看板（浏览/下载/收藏/今日/热门 Top5/7 天趋势）
- 模板库：搜索/状态/分类筛选、编辑、上下架、批量、删除
- 网盘配置、源文件下载/删除/一键同步、AI 标注/自动应用、待复核队列
- 模板 CSV / 点击 CSV 导出

### 微信小程序（原生 JS + 液态玻璃 UI）

- 8 个页面：首页/搜索/分类/列表/详情/我的/我的收藏/下载记录
- 静默登录、云端收藏、下载记录、浏览/复制上报
- 真实封面/预览图、分页加载、下拉刷新、分享好友/朋友圈

### 桌面 CLI（Node/TS + LibreOffice）

- `doctor` / `fixtures` / `render` / `status` / `upload`
- SHA-256 幂等、ledger 断点账本、图片预算降质
- `upload --with-source`、失败自动重试

### 运维与交付

- GitHub Actions CI（commitlint/typecheck/build/渲染冒烟）
- GitHub Actions Deploy（构建产物 + node_modules 同步，服务器不跑 npm install）
- 每日数据库/图片备份（表数量校验、保留策略）
- 每 5 分钟健康检查（API/PM2/磁盘/内存，可选 webhook）
- Nginx HSTS/安全头、日志轮转、短链/图片/管理端路由
- 生产验收脚本 `npm run verify:prod`（15 项）
- 存储孤儿清理、模板删除级联清理
- 文档：README、docs/00–07（含交付手册、验收清单、微信上线与隐私指引）

### 已知限制（待外部输入）

- 微信小程序代码上传密钥未提供，体验版/审核未执行
- 百度/夸克网盘账号未授权，真实自动同步未启用（框架已就绪）
- 真实模板内容待运营录入
- 微信公众平台 request 合法域名/隐私指引待确认
