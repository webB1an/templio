import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface FontCheck {
  ok: boolean;
  detail: string;
}

/**
 * 渲染机通常已安装的常用字体（Windows 自带 + 常见免费商用字体）。
 * 只对"非常用字体"告警，避免每个模板都提示 Microsoft YaHei。
 */
const COMMON_FONTS = new Set(
  [
    "microsoft yahei",
    "微软雅黑",
    "simsun",
    "宋体",
    "simhei",
    "黑体",
    "kaiti",
    "楷体",
    "dengxian",
    "等线",
    "fangsong",
    "仿宋",
    "arial",
    "calibri",
    "cambria",
    "times new roman",
    "segoe ui",
    "verdana",
    "tahoma",
    "georgia",
    "consolas",
    "courier new",
    "arial unicode ms",
    "source han sans",
    "思源黑体",
    "source han serif",
    "思源宋体",
    "alibaba pu hui ti",
    "阿里巴巴普惠体",
    "harmonyos sans",
    "pingfang sc",
    "苹方",
  ].map((font) => font.toLowerCase()),
);

/** 返回模板里使用、但可能不在渲染机上的字体 */
export function filterUnknownFonts(fonts: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const font of fonts) {
    const key = font.trim().toLowerCase();
    if (!key || COMMON_FONTS.has(key) || seen.has(key)) continue;
    seen.add(key);
    result.push(font.trim());
  }
  return result;
}

/** 渲染保真的前提：常用中文字体必须存在，否则 LibreOffice 会静默替换字体导致版面漂移。 */
const WIN_FONTS: Array<{ label: string; file: string }> = [
  { label: "微软雅黑", file: "msyh.ttc" },
  { label: "宋体", file: "simsun.ttc" },
  { label: "黑体", file: "simhei.ttf" },
  { label: "楷体", file: "simkai.ttf" },
  { label: "等线", file: "Deng.ttf" },
];

export async function detectChineseFonts(): Promise<FontCheck> {
  if (process.platform === "win32") {
    const root = "C:\\Windows\\Fonts";
    const found = WIN_FONTS.filter((font) => existsSync(`${root}\\${font.file}`)).map((font) => font.label);
    return {
      ok: found.length >= 3,
      detail: found.length ? `已安装：${found.join(" / ")}` : "未找到常用中文字体",
    };
  }

  if (process.platform === "darwin") {
    const candidates = [
      "/System/Library/Fonts/PingFang.ttc",
      "/System/Library/Fonts/STHeiti Light.ttc",
      "/Library/Fonts/Arial Unicode.ttf",
    ];
    const ok = candidates.some((candidate) => existsSync(candidate));
    return { ok, detail: ok ? "已找到苹方/黑体" : "未找到中文字体" };
  }

  try {
    const { stdout } = await execFileAsync("fc-list", [":lang=zh", "family"], { timeout: 15_000 });
    const families = [
      ...new Set(
        stdout
          .split(/\r?\n/)
          .map((line) => line.split(",")[0]?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const preview = families.slice(0, 4).join(" / ");
    return {
      ok: families.length > 0,
      detail: families.length
        ? `已安装 ${families.length} 个中文字体家族：${preview}${families.length > 4 ? " …" : ""}`
        : "fc-list 未返回中文字体",
    };
  } catch {
    return { ok: false, detail: "未安装 fontconfig / fc-list，请先安装 fontconfig 与中文字体" };
  }
}
