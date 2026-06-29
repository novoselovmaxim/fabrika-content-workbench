import { defineConfig } from "drizzle-kit";
import path from "path";
import os from "os";

// В dev БД лежит в database/, в продакшене — в ~/FabrikaContent/db/
const isDev = !process.env.PKG_EXECPATH;
const dbPath = isDev
  ? "../database/fabrika.db"
  : path.join(os.homedir(), "FabrikaContent", "db", "workbench.db");

const outDir = isDev ? "../database/migrations" : "../migrations";

export default defineConfig({
  schema: "./src/schema.ts",
  out: outDir,
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
