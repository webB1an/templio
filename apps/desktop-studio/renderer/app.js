const $ = (id) => document.getElementById(id);

const state = {
  srcDir: "",
  outDir: "",
  previewPages: 4,
  force: false,
  busy: false
};

const els = {
  src: $("srcDir"),
  out: $("outDir"),
  pages: $("pages"),
  force: $("force"),
  pickSrc: $("pickSrc"),
  pickOut: $("pickOut"),
  render: $("render"),
  openOutput: $("openOutput"),
  status: $("status"),
  statusDetail: $("statusDetail"),
  progress: $("progressBar"),
  resultCount: $("resultCount"),
  results: $("results"),
  log: $("log"),
  clearLog: $("clearLog")
};

async function init() {
  const saved = readStorage();
  state.srcDir = saved.srcDir || "";
  state.outDir = saved.outDir || (await window.studio.defaultOutput());
  state.previewPages = saved.previewPages || 4;
  state.force = Boolean(saved.force);

  els.src.value = state.srcDir;
  els.out.value = state.outDir;
  els.pages.value = state.previewPages;
  els.force.checked = state.force;

  bindEvents();
  setStatus("准备就绪", state.srcDir ? "点击「开始生成」" : "选择源文件夹后开始生成");
  window.studio.onLog((line) => appendLog(line));
}

function readStorage() {
  try {
    return JSON.parse(localStorage.getItem("templio-studio") || "{}");
  } catch {
    return {};
  }
}

function persist() {
  localStorage.setItem(
    "templio-studio",
    JSON.stringify({
      srcDir: state.srcDir,
      outDir: state.outDir,
      previewPages: state.previewPages,
      force: state.force
    })
  );
}

function bindEvents() {
  els.pickSrc.addEventListener("click", async () => {
    const folder = await window.studio.pickSource();
    if (!folder) return;
    state.srcDir = folder;
    els.src.value = folder;
    persist();
    setStatus("准备就绪", "点击「开始生成」");
  });

  els.pickOut.addEventListener("click", async () => {
    const folder = await window.studio.pickOutput();
    if (!folder) return;
    state.outDir = folder;
    els.out.value = folder;
    persist();
  });

  els.pages.addEventListener("change", () => {
    const value = Math.min(8, Math.max(1, Number(els.pages.value) || 4));
    state.previewPages = value;
    els.pages.value = value;
    persist();
  });

  els.force.addEventListener("change", () => {
    state.force = els.force.checked;
    persist();
  });

  els.render.addEventListener("click", () => void startRender());
  els.openOutput.addEventListener("click", () => window.studio.openPath(state.outDir));
  els.clearLog.addEventListener("click", () => {
    els.log.textContent = "";
  });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !state.busy) {
      void startRender();
    }
  });
}

async function startRender() {
  if (state.busy) return;
  if (!state.srcDir) {
    setStatus("请选择源文件夹", "源文件夹需要包含 .pptx 或 .docx", "error");
    return;
  }
  if (!state.outDir) {
    setStatus("请选择输出文件夹", "", "error");
    return;
  }

  state.busy = true;
  setBusy(true);
  els.log.textContent = "";
  renderResults([]);
  setProgress(0);
  setStatus("正在生成…", "准备调用本机渲染引擎", "running");
  els.resultCount.textContent = "";

  try {
    const result = await window.studio.render({
      srcDir: state.srcDir,
      outDir: state.outDir,
      previewPages: state.previewPages,
      force: state.force
    });
    if (!result || !result.ok) {
      throw new Error((result && result.error) || "生成失败");
    }
    setProgress(100);
    const count = result.packages ? result.packages.length : 0;
    setStatus("生成完成", `共生成 ${count} 个物料包`, "success");
    els.resultCount.textContent = `${count} 个模板`;
    renderResults(result.packages || []);
  } catch (error) {
    setStatus("生成失败", (error && error.message) || String(error), "error");
    appendLog(`✘ ${(error && error.message) || error}`);
  } finally {
    state.busy = false;
    setBusy(false);
  }
}

function setBusy(busy) {
  els.render.disabled = busy;
  els.pickSrc.disabled = busy;
  els.pickOut.disabled = busy;
  els.pages.disabled = busy;
  els.force.disabled = busy;
  els.render.textContent = busy ? "正在生成…" : "开始生成";
}

function setStatus(text, detail, kind) {
  els.status.textContent = text;
  els.status.className = "status-text" + (kind ? ` status-${kind}` : "");
  els.statusDetail.textContent = detail || "";
}

function setProgress(percent) {
  els.progress.style.width = `${Math.min(100, Math.max(0, percent))}%`;
}

function appendLog(line) {
  const text = String(line || "").trimEnd();
  if (!text) return;
  const atBottom = els.log.scrollHeight - els.log.scrollTop - els.log.clientHeight < 40;
  els.log.textContent += `${text}\n`;
  if (els.log.textContent.length > 60000) {
    els.log.textContent = els.log.textContent.slice(-50000);
  }
  if (atBottom) els.log.scrollTop = els.log.scrollHeight;

  const match = text.match(/\[(\d+)\/(\d+)\]/);
  if (match) {
    const done = Number(match[1]);
    const total = Number(match[2]);
    if (total > 0) {
      setProgress(Math.round((done / total) * 92));
      setStatus("正在生成…", `已完成 ${done}/${total} 个模板`, "running");
    }
  }
}

function renderResults(packages) {  els.results.innerHTML = "";
  if (!packages.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML =
      '<div class="empty-icon">▤</div><h3>还没有生成结果</h3><p>左侧选择源文件夹，点击「开始生成」<br />生成的封面和缩略图会显示在这里</p>';
    els.results.appendChild(empty);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "cards";
  packages.forEach((pkg) => {
    const card = document.createElement("article");
    card.className = "card";

    const cover = document.createElement("img");
    cover.className = "card-cover";
    cover.src = pkg.thumbUrl || pkg.coverUrl;
    cover.alt = pkg.title;
    cover.addEventListener("error", () => {
      cover.style.display = "none";
    });

    const main = document.createElement("div");
    main.className = "card-main";

    const title = document.createElement("h3");
    title.className = "card-title";
    title.textContent = pkg.title || pkg.name;

    const meta = document.createElement("p");
    meta.className = "card-meta";
    meta.textContent = `${pkg.previewCount || 0} 张预览 · ${pkg.name}`;

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const openFolder = document.createElement("button");
    openFolder.className = "mini-btn";
    openFolder.textContent = "打开文件夹";
    openFolder.addEventListener("click", () => window.studio.openPath(pkg.dir));

    const openCover = document.createElement("button");
    openCover.className = "mini-btn";
    openCover.textContent = "查看封面";
    openCover.addEventListener("click", () => window.studio.openPath(pkg.coverPath));

    actions.append(openFolder, openCover);
    main.append(title, meta, actions);
    card.append(cover, main);
    grid.appendChild(card);
  });
  els.results.appendChild(grid);
}

void init();

// 本地桌面端调试/冒烟测试钩子（不影响正常使用）
window.__templioStudio = {
  state,
  startRender,
  setPaths(srcDir, outDir) {
    state.srcDir = srcDir;
    state.outDir = outDir;
    els.src.value = srcDir;
    els.out.value = outDir;
  }
};
