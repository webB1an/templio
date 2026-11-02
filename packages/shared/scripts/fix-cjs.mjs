import { mkdirSync, writeFileSync } from "node:fs";

// @templio/shared 的 package.json 是 "type": "module"，
// dist-cjs 下的 .js 需要显式声明为 CommonJS，否则 Node 会按 ESM 解析。
mkdirSync("dist-cjs", { recursive: true });
writeFileSync("dist-cjs/package.json", `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`);
