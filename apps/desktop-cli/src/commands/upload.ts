import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseManifest } from "@templio/shared";
import { pathExists } from "../lib/fsx.js";
import { stripOoxmlAuthorMetadata } from "../lib/metadata.js";

export interface UploadCommandOptions {
  distDir: string;
  api: string;
  username: string;
  password?: string;
  token?: string;
  limit?: number;
  dryRun: boolean;
  withSource: boolean;
  report?: string;
}

interface UploadReportItem {
  package: string;
  dir: string;
  status: "imported" | "duplicate" | "failed";
  id?: string;
  title?: string | null;
  error?: string;
}

interface PackageItem {
  dir: string;
  name: string;
}

export async function runUpload(options: UploadCommandOptions): Promise<number> {
  const distDir = resolve(options.distDir);
  const api = options.api.replace(/\/+$/, "");

  if (!(await pathExists(distDir))) {
    console.error(`✘ 物料包目录不存在：${distDir}`);
    return 1;
  }

  const packages = await findPackages(distDir);
  if (packages.length === 0) {
    console.error("✘ 未找到包含 manifest.json 的物料包，请先运行 `templio render`");
    return 1;
  }

  const limited = options.limit && options.limit > 0 ? packages.slice(0, options.limit) : packages;
  console.log(
    `Templio 上传：${limited.length}/${packages.length} 个物料包 → ${api}${options.withSource ? "（含源文件）" : ""}`
  );

  if (options.dryRun) {
    for (const item of limited) console.log(`  · ${item.name}`);
    return 0;
  }

  const token = options.token || (await login(api, options.username, options.password));

  let imported = 0;
  let duplicated = 0;
  const failures: Array<{ name: string; error: string }> = [];
  const reportItems: UploadReportItem[] = [];

  for (const item of limited) {
    try {
      const result = await uploadWithRetry(() => uploadPackage(api, token, item.dir, options.withSource));
      reportItems.push({
        package: item.name,
        dir: item.dir,
        status: result.status === "duplicate" ? "duplicate" : "imported",
        id: result.id,
        title: result.title,
      });
      if (result.status === "duplicate") {
        duplicated += 1;
        console.log(`  ↷ ${item.name} 已存在（${result.title || result.id}）`);
      } else {
        imported += 1;
        console.log(`  ✓ ${item.name} 已导入（${result.title || result.id}）`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ name: item.name, error: message });
      reportItems.push({ package: item.name, dir: item.dir, status: "failed", error: message });
      console.log(`  ✘ ${item.name} ${message}`);
    }
  }

  if (options.report) {
    await writeFile(
      resolve(options.report),
      JSON.stringify({ api, generatedAt: new Date().toISOString(), results: reportItems }, null, 2),
      "utf8",
    );
    console.log(`\n上传报告：${resolve(options.report)}`);
  }

  console.log(`\n完成：导入 ${imported}，跳过 ${duplicated}，失败 ${failures.length}`);
  if (failures.length > 0) {
    for (const failure of failures) console.log(`  ✘ ${failure.name}: ${failure.error}`);
    return 1;
  }
  return 0;
}

async function uploadWithRetry<T>(action: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  ↻ 上传失败（${attempt}/${attempts}），2 秒后重试：${message}`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function login(api: string, username: string, password?: string): Promise<string> {
  if (!password) {
    throw new Error("未提供管理员密码，请设置环境变量 TEMPLIO_ADMIN_PASSWORD 或传 --password");
  }
  const response = await fetch(`${api}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`管理员登录失败（HTTP ${response.status}）${detail ? `：${detail.slice(0, 200)}` : ""}`);
  }
  const data = (await response.json()) as { token?: string };
  if (!data.token) throw new Error("管理员登录失败：未返回 token");
  return data.token;
}

async function findPackages(distDir: string): Promise<PackageItem[]> {
  const entries = await readdir(distDir, { withFileTypes: true });
  const items: PackageItem[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const dir = join(distDir, entry.name);
    if (await pathExists(join(dir, "manifest.json"))) {
      items.push({ dir, name: entry.name });
    }
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

async function uploadPackage(
  api: string,
  token: string,
  packageDir: string,
  withSource: boolean,
): Promise<{ status: string; id: string; title?: string | null }> {
  const manifest = parseManifest(JSON.parse(await readFile(join(packageDir, "manifest.json"), "utf8")));
  const text = JSON.parse(await readFile(join(packageDir, manifest.textFile), "utf8")) as unknown;

  // 源文件可能带着原作者的 creator/lastModifiedBy、店铺名等文档属性。
  // 上传前清理一份临时副本，不修改本地物料包和原始源文件。
  let source: { buffer: Buffer; filename: string } | null = null;
  if (withSource) {
    const sourcePath = join(packageDir, manifest.sourceFile);
    source = {
      buffer: await stripOoxmlAuthorMetadata(await readFile(sourcePath)),
      filename: sourcePath.split(/[\\/]/).pop() || "source",
    };
  }

  const form = new FormData();
  const uploadManifest = source ? { ...manifest, sourceBytes: source.buffer.length } : manifest;
  form.append("manifest", JSON.stringify(uploadManifest));
  form.append("text", JSON.stringify(text));

  const appendImage = async (relativePath: string, field: string, filename: string) => {
    const buffer = await readFile(join(packageDir, relativePath));
    form.append(field, new Blob([new Uint8Array(buffer)], { type: "image/webp" }), filename);
  };

  await appendImage(manifest.images.cover, "cover", "cover.webp");
  await appendImage(manifest.images.thumb, "thumb", "thumb.webp");
  for (let index = 0; index < manifest.images.previews.length; index += 1) {
    await appendImage(manifest.images.previews[index]!, "previews", `preview-${index + 1}.webp`);
  }

  if (source) {
    form.append(
      "source",
      new Blob([new Uint8Array(source.buffer)], { type: "application/octet-stream" }),
      source.filename,
    );
  }

  const response = await fetch(`${api}/api/admin/import/package`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });

  const payload = (await response.json().catch(() => null)) as
    | { status?: string; id?: string; title?: string | null; message?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.message || `上传失败（HTTP ${response.status}）`);
  }
  if (!payload || !payload.status || !payload.id) {
    throw new Error("上传失败：服务端未返回有效结果");
  }
  return { status: payload.status, id: payload.id, title: payload.title };
}
