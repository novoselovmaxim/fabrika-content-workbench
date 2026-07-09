import { contextBridge, ipcRenderer, shell } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getPlatform: () => process.platform,
  openExternal: (url: string) => shell.openExternal(url),
});
