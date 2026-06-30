import { app, BrowserWindow } from "electron";
import path from "path";
import http from "http";

process.env.ELECTRON_APP = "true";

const isDev = !app.isPackaged;
const PORT = 3001;
const SERVER_URL = `http://localhost:${PORT}`;

let mainWindow: BrowserWindow | null = null;

function waitForServer(url: string, timeout = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else if (Date.now() - start > timeout)
          reject(new Error("Server did not start in time"));
        else setTimeout(check, 300);
      });
      req.on("error", () => {
        if (Date.now() - start > timeout)
          reject(new Error("Server did not start in time"));
        else setTimeout(check, 300);
      });
      req.end();
    }
    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Фабрика Контента",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(SERVER_URL);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  if (!isDev) {
    const serverPath = path.join(__dirname, "../server/dist/bundle.cjs");
    require(serverPath);
    await waitForServer(SERVER_URL);
  }
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});
