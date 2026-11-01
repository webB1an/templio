import {
  IMAGE_SPEC,
  TEMPLATE_IMAGE_BUDGET_BYTES,
  formatBytes,
} from "@templio/shared";
import { detectChineseFonts } from "../lib/fonts.js";
import { findSoffice, readSofficeVersion } from "../lib/soffice.js";

const C = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  green: "\u001b[32m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
};

interface CheckResult {
  label: string;
  ok: boolean;
  required: boolean;
  detail: string;
  hint?: string;
}

function mark(ok: boolean): string {
  return ok ? `${C.green}✔${C.reset}` : `${C.red}✘${C.reset}`;
}

export async function runDoctor(): Promise<boolean> {
  const checks: CheckResult[] = [];

  const nodeMajor = Number(process.versions.node.split(".")[0] ?? 0);
  checks.push({
    label: "Node.js",
    ok: nodeMajor >= 22,
    required: true,
    detail: `v${process.versions.node}`,
    hint: "需要 Node.js >= 22.12",
  });

  const soffice = await findSoffice();
  if (soffice) {
    const version = await readSofficeVersion(soffice);
    const ok = /^\d/.test(version);
    checks.push({
      label: "LibreOffice",
      ok,
      required: true,
      detail: ok ? `${version}  ${soffice}` : `${soffice}（${version}）`,
      hint: "安装命令：winget install TheDocumentFoundation.LibreOffice --silent",
    });
  } else {
    checks.push({
      label: "LibreOffice",
      ok: false,
      required: true,
      detail: "未找到 soffice",
      hint: "安装：winget install TheDocumentFoundation.LibreOffice --silent，或设置 TEMPLIO_SOFFICE",
    });
  }

  const fonts = await detectChineseFonts();
  checks.push({
    label: "中文字体",
    ok: fonts.ok,
    required: true,
    detail: fonts.detail,
    hint: "缺少中文字体会导致渲染方块字/版面漂移",
  });

  checks.push({
    label: "图片预算",
    ok: true,
    required: false,
    detail:
      `thumb ${IMAGE_SPEC.thumb.width}×${IMAGE_SPEC.thumb.height} / ` +
      `cover ${IMAGE_SPEC.cover.width}×${IMAGE_SPEC.cover.height} / ` +
      `preview 宽 ${IMAGE_SPEC.preview.width}，合计约 ${formatBytes(TEMPLATE_IMAGE_BUDGET_BYTES)}/模板`,
  });

  console.log("");
  console.log(`${C.dim}Templio 渲染环境检查${C.reset}`);
  console.log("─".repeat(64));
  for (const check of checks) {
    console.log(`${mark(check.ok)} ${check.label.padEnd(12)} ${check.detail}`);
    if (!check.ok && check.hint) {
      console.log(`  ${C.yellow}→ ${check.hint}${C.reset}`);
    }
  }
  console.log("─".repeat(64));

  const failed = checks.filter((check) => check.required && !check.ok);
  if (failed.length > 0) {
    console.log(`${C.red}结论：${failed.length} 项必需检查未通过${C.reset}`);
    return false;
  }
  console.log(`${C.green}结论：渲染环境就绪${C.reset}`);
  return true;
}
