# 贡献指南

## 提交规范（Conventional Commits）

所有提交必须符合 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <subject>
```

- **type**（必填）：
  | type | 用途 |
  | --- | --- |
  | `feat` | 新功能 |
  | `fix` | 修复 bug |
  | `docs` | 文档 |
  | `style` | 代码格式（不影响逻辑） |
  | `refactor` | 重构（非新功能、非修复） |
  | `perf` | 性能优化 |
  | `test` | 测试 |
  | `build` | 构建系统 / 依赖 |
  | `ci` | CI 配置 |
  | `chore` | 杂项（脚手架、工具） |
  | `revert` | 回滚 |
- **scope**（推荐）：`cli` / `shared` / `api` / `admin` / `miniprogram` / `ci` / `deploy` / `deps` / `docs`
- **subject**：简短描述，中文或英文均可，不以句号结尾
- **body**（可选）：说明动机与影响
- **footer**（可选）：`BREAKING CHANGE:` 或关联 issue

### 示例

```
feat(cli): 支持 PPT/Word 批量渲染为标准物料包
fix(cli): 修复 Windows 下 soffice 版本探测失败
ci: 增加 commitlint 与渲染冒烟测试
docs: 补充 2C2G 服务器资源预算
chore(deps): 升级 sharp 到 0.35
```

### 本地校验

`npm install` 会通过 husky 安装 `commit-msg` 钩子，提交时自动执行 commitlint。也可手动校验：

```bash
echo "feat(cli): 新增批量导出" | npx commitlint   # 通过
echo "更新一下代码" | npx commitlint               # 失败
```

CI 中同样会校验提交信息（见 `.github/workflows/ci.yml` 的 `commitlint` job）。

## 分支与发布

- `main` 为生产分支，受保护；不要直接改服务器上的文件。
- 功能分支建议：`feat/xxx`、`fix/xxx`。
- 发布由 `.github/workflows/deploy.yml` 在 push 到 `main` 后自动执行（详见 `docs/04-ci-cd.md`）。
