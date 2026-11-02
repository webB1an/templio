const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = findRepoRoot();
const CLI_ENTRY = path.join(ROOT, "apps", "desktop-cli", "dist", "index.js");
const DEFAULT_OUTPUT = path.join(ROOT, "dist-packages");

/** 开发态与打包后的 exe 都从自身位置向上寻找仓库根目录 */
function findRepoRoot() {
  const starts = [path.dirname(process.execPath), app.getAppPath(), process.cwd(), __dirname];
  for (const start of starts) {
    let dir = start;
    for (let depth = 0; depth < 8; depth += 1) {
      if (fs.existsSync(path.join(dir, "apps", "desktop-cli", "dist", "index.js"))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return path.resolve(__dirname, "../..");
}

let mainWindow = null;
let rendering = false;

function createWindow() {
  const iconPath = path.join(__dirname, "assets", "icon.ico");
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#f2f4f8",
    title: "模板宝 · 模板工作台",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  const screenshotPath = process.env.TEMPLIO_STUDIO_SCREENSHOT;
  const smokePayload = process.env.TEMPLIO_STUDIO_SMOKE_PAYLOAD;
  if (screenshotPath || smokePayload) {
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        try {
          if (smokePayload) {
            const payload = JSON.parse(smokePayload);
            await mainWindow.webContents.executeJavaScript(
              `(async () => { window.__templioStudio.setPaths(${JSON.stringify(payload.srcDir)}, ${JSON.stringify(
                payload.outDir
              )}); window.__templioStudio.startRender(); })()`
            );
            await new Promise((resolve) => setTimeout(resolve, 15000));
          }
          if (screenshotPath) {
            const image = await mainWindow.webContents.capturePage();
            fs.writeFileSync(screenshotPath, image.toPNG());
          }
        } catch (error) {
          console.error("studio smoke failed:", error);
        } finally {
          app.quit();
        }
      }, 1200);
    });
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function sendLog(line) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("studio:log", line);
  }
}

function spawnLogged(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT,
      env: { ...process.env, ...options.env },
      windowsHide: true
    });
    let stderr = "";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };
    const forward = (chunk) => {
      const text = chunk.toString();
      text
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .forEach(sendLog);
    };
    child.stdout.on("data", forward);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      forward(chunk);
    });
    child.on("error", (error) => finish(error));
    // 用 exit 而不是 close：渲染可能派生 LibreOffice 子进程，
    // close 会等待所有 stdio 句柄释放，导致界面一直停在“正在生成”。
    child.on("exit", (code) => {
      if (code === 0) finish();
      else finish(new Error(stderr.trim() || `命令退出码 ${code}`));
    });
  });
}

async function ensureEngine() {
  if (fs.existsSync(CLI_ENTRY)) return;
  sendLog("渲染引擎未构建，正在构建 desktop-cli……");
  await spawnLogged("npm.cmd", ["run", "build", "-w", "@templio/desktop-cli"]);
  if (!fs.existsSync(CLI_ENTRY)) {
    throw new Error("渲染引擎构建完成但未找到入口文件，请检查 desktop-cli");
  }
}

async function scanPackages(outDir) {
  if (!fs.existsSync(outDir)) return [];
  const entries = await fsp.readdir(outDir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(outDir, entry.name);
    const imagesDir = path.join(dir, "images");
    if (!fs.existsSync(imagesDir)) continue;

    const coverPath = path.join(imagesDir, "cover.webp");
    const thumbPath = path.join(imagesDir, "thumb.webp");
    if (!fs.existsSync(coverPath)) continue;

    let title = entry.name;
    try {
      const manifest = JSON.parse(await fsp.readFile(path.join(dir, "manifest.json"), "utf8"));
      title = manifest.titleGuess || title;
    } catch {
      // manifest 缺失时用目录名
    }

    let previewCount = 0;
    try {
      previewCount = (await fsp.readdir(imagesDir)).filter((name) => /^preview-\d+\.webp$/i.test(name)).length;
    } catch {
      // 忽略
    }

    result.push({
      dir,
      name: entry.name,
      title,
      previewCount,
      coverUrl: pathToFileURL(coverPath).href,
      thumbUrl: fs.existsSync(thumbPath) ? pathToFileURL(thumbPath).href : pathToFileURL(coverPath).href,
      coverPath
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

ipcMain.handle("studio:pick-source", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择模板源文件夹（.pptx / .docx）",
    properties: ["openDirectory"]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("studio:pick-output", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择封面/缩略图输出文件夹",
    properties: ["openDirectory", "createDirectory"]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("studio:default-output", () => DEFAULT_OUTPUT);

ipcMain.handle("studio:open-path", async (_event, target) => {
  if (!target) return { ok: false, error: "路径为空" };
  const error = await shell.openPath(path.resolve(String(target)));
  return error ? { ok: false, error } : { ok: true };
});

ipcMain.handle("studio:render", async (_event, payload) => {
  if (rendering) return { ok: false, error: "已有生成任务正在进行" };
  const srcDir = path.resolve(String(payload.srcDir || ""));
  const outDir = path.resolve(String(payload.outDir || DEFAULT_OUTPUT));
  const previewPages = Math.min(8, Math.max(1, Number(payload.previewPages) || 4));
  const force = Boolean(payload.force);

  if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
    return { ok: false, error: "源文件夹不存在" };
  }

  const relativeOutput = path.relative(srcDir, outDir);
  if (!relativeOutput || (!relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput))) {
    return {
      ok: false,
      error: "输出文件夹不能放在源文件夹内部；否则下次递归扫描会把生成的 source 文件也当成模板"
    };
  }

  rendering = true;
  try {
    await ensureEngine();
    await fsp.mkdir(outDir, { recursive: true });

    const args = [
      CLI_ENTRY,
      "render",
      srcDir,
      "--out",
      outDir,
      "--preview-pages",
      String(previewPages)
    ];
    if (force) args.push("--force");
    sendLog(`源目录：${srcDir}`);
    sendLog(`输出目录：${outDir}`);
    sendLog(`预览页数：${previewPages}${force ? " · 强制重跑" : ""}`);

    await spawnLogged(process.env.npm_node_execpath || "node", args);
    sendLog("✓ 渲染进程已结束，正在扫描物料包…");
    const packages = await scanPackages(outDir);
    sendLog(`✓ 已找到 ${packages.length} 个物料包`);
    return { ok: true, packages, outDir };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) };
  } finally {
    rendering = false;
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
