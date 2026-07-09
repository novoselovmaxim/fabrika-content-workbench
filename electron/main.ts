import { app, BrowserWindow, shell } from "electron";
import path from "path";
import http from "http";
import fs from "fs";
import net from "net";

process.env.ELECTRON_APP = "true";

const isDev = !app.isPackaged;
const PORT = 3001;
const HEALTH_URL_PATH = "/api/health";

const gotLock = app.requestSingleInstanceLock();

let mainWindow: BrowserWindow | null = null;

const LOG_FILE = path.join(
  app.getPath("userData"),
  "startup-error.log"
);

function logError(msg: string, err?: unknown): void {
  const lines = [
    `[${new Date().toISOString()}] ${msg}`,
    ...(err ? [String(err), err instanceof Error ? (err.stack || "") : ""] : []),
  ];
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, lines.join("\n") + "\n");
  } catch {}
}

function findFreePort(start: number, maxTries = 10): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(start, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && start < PORT + maxTries) {
        findFreePort(start + 1, maxTries).then(resolve, reject);
      } else {
        reject(err);
      }
    });
  });
}

function waitForServer(url: string, timeout = 30000): Promise<void> {
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

function createWindow(port: number) {
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
    mainWindow.loadURL(`http://localhost:${port}`);
  }

  mainWindow.webContents.on("did-fail-load", (_e, code, desc) => {
    logError(`Page load failed: ${code} ${desc}`);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      if (!url.includes("localhost")) {
        event.preventDefault();
        shell.openExternal(url);
      }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  if (!gotLock) {
    app.quit();
    return;
  }

  try {
    if (!isDev) {
      const serverPath = path.join(__dirname, "../../server/dist/bundle.cjs");
      if (!fs.existsSync(serverPath)) {
        logError(`Server bundle not found at ${serverPath}`);
        throw new Error(`Server bundle not found at ${serverPath}`);
      }

      // Find a free port before starting the server
      const freePort = await findFreePort(PORT);
      process.env.INITIAL_PORT = String(freePort);
      logError(`Using port ${freePort}`);

      // Перехватываем console.log/error сервера в лог-файл
      const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
      const origLog = console.log.bind(console);
      const origError = console.error.bind(console);
      type ConsoleFn = (...args: any[]) => void;
      console.log = ((...args: any[]) => {
        logStream.write(`[${new Date().toISOString()}] ${args.join(" ")}\n`);
        origLog(...args);
      }) as ConsoleFn;
      console.error = ((...args: any[]) => {
        logStream.write(`[${new Date().toISOString()}] [ERR] ${args.join(" ")}\n`);
        origError(...args);
      }) as ConsoleFn;

      logError(`Loading server from ${serverPath}`);
      require(serverPath);
      logError("Server module loaded, waiting for it to listen...");

      await waitForServer(`http://localhost:${freePort}${HEALTH_URL_PATH}`);
      logError("Server is ready");
    }
    createWindow(parseInt(process.env.INITIAL_PORT || String(PORT), 10));
  } catch (err) {
    logError("Startup failed", err);
    mainWindow = new BrowserWindow({
      width: 600,
      height: 400,
      title: "Ошибка запуска",
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    mainWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        `<!DOCTYPE html>
<html><body style="font-family:sans-serif;padding:2em;background:#1a1a2e;color:#eee">
<h2>Ошибка запуска</h2>
<p>Приложение не смогло запуститься.</p>
<p style="font-size:0.85em;color:#aaa">Лог ошибки:<br><pre style="white-space:pre-wrap;font-size:0.8em">${String(err)}</pre></p>
<p style="font-size:0.85em;color:#aaa">Полный лог: <code>${LOG_FILE}</code></p>
</body></html>`
      )}`
    );
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow(parseInt(process.env.INITIAL_PORT || String(PORT), 10));
});
