import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

// 只有存在 .git 时才安装 git hooks：
// - 本地开发：安装 commit-msg 钩子，提交时校验 Conventional Commits
// - CI / 部署产物（无 .git）：直接跳过，避免 npm ci 失败
if (existsSync(".git")) {
  execSync("npx --no-install husky", { stdio: "inherit" });
}
