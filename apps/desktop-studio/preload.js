const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studio", {
  pickSource: () => ipcRenderer.invoke("studio:pick-source"),
  pickOutput: () => ipcRenderer.invoke("studio:pick-output"),
  defaultOutput: () => ipcRenderer.invoke("studio:default-output"),
  listPackages: (outDir) => ipcRenderer.invoke("studio:list-packages", outDir),
  openPath: (target) => ipcRenderer.invoke("studio:open-path", target),
  render: (payload) => ipcRenderer.invoke("studio:render", payload),
  upload: (payload) => ipcRenderer.invoke("studio:upload", payload),
  onLog: (handler) => {
    const listener = (_event, line) => handler(line);
    ipcRenderer.on("studio:log", listener);
    return () => ipcRenderer.removeListener("studio:log", listener);
  }
});
