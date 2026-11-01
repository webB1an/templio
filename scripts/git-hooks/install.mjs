import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

// 只有存在 .git 且未显式禁用时才安装 git hooks：
// - 本地开发：安装 commit-msg 钩子，提交时校验 Conventional Commits
// - CI / 生产依赖安装（HUSKY=0 或无 .git）：直接跳过
if (existsSync(".git") && process.env.HUSKY !== "0") {
  try {
    execSync("npx --no-install husky", { stdio: "inherit" });
  } catch {
    console.warn("[git-hooks] husky 不可用，跳过本地 git hooks");
  }
}
