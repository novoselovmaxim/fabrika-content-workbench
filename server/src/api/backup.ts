import { Router } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { PATHS, DATA_DIR } from "../paths.js";
import { sqlite } from "../db.js";
const tmpDir = path.join(DATA_DIR, "tmp");
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
const backupUpload = multer({ dest: tmpDir, limits: { fileSize: 500 * 1024 * 1024 } });

export const backupRouter = Router();

backupRouter.get("/info", (_req, res) => {
  try {
    const stat = fs.statSync(PATHS.db);
    const backupDir = path.join(DATA_DIR, "backups");
    const backups = fs.existsSync(backupDir)
      ? fs.readdirSync(backupDir).filter((f) => f.endsWith(".db")).map((f) => {
          const s = fs.statSync(path.join(backupDir, f));
          return { name: f, size: s.size, mtime: s.mtime.toISOString() };
        }).sort((a, b) => b.mtime.localeCompare(a.mtime))
      : [];

    res.json({
      current: {
        path: PATHS.db,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
      },
      backups,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

backupRouter.get("/download", (_req, res) => {
  try {
    sqlite.exec("VACUUM;");
    const stat = fs.statSync(PATHS.db);
    res.setHeader("Content-Type", "application/x-sqlite3");
    res.setHeader("Content-Disposition", `attachment; filename="fabrika-backup-${new Date().toISOString().slice(0, 10)}.db"`);
    res.setHeader("Content-Length", stat.size);
    const stream = fs.createReadStream(PATHS.db);
    stream.pipe(res);
    stream.on("error", () => { res.status(500).end(); });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

backupRouter.post("/create", (_req, res) => {
  try {
    sqlite.exec("VACUUM;");
    const backupDir = path.join(DATA_DIR, "backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const dateStr = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `fabrika-backup-${dateStr}.db`);
    fs.copyFileSync(PATHS.db, backupPath);
    const stat = fs.statSync(backupPath);
    res.json({ path: backupPath, size: stat.size, created: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

backupRouter.post("/restore", backupUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Файл базы данных не загружен. Используйте multipart/form-data с полем 'file'." });
    }
    const backupDir = path.join(DATA_DIR, "backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const currentBackup = path.join(backupDir, `pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
    fs.copyFileSync(PATHS.db, currentBackup);

    sqlite.close();
    fs.copyFileSync(req.file.path, PATHS.db);

    res.json({
      success: true,
      message: "База данных восстановлена. Требуется перезапуск приложения.",
      backupCreated: currentBackup,
    });
    process.exit(0);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
