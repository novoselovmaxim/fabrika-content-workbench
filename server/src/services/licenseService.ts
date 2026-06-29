import { db } from "../db.js";
import { license } from "../schema.js";
import { eq } from "drizzle-orm";

const LICENSE_SERVER = "https://license.yourdomain.ru";

export interface LicenseInfo {
  status: "active" | "inactive" | "expired" | "invalid";
  email?: string;
  planName?: string;
  expiresAt?: string | null;
  activatedAt?: string;
}

export function getLicense(): LicenseInfo {
  const row = db.select().from(license).where(eq(license.id, "singleton")).get();
  if (!row) return { status: "inactive" };
  return {
    status: (row.status as LicenseInfo["status"]) || "inactive",
    email: row.email ?? undefined,
    planName: row.planName ?? undefined,
    expiresAt: row.expiresAt,
    activatedAt: row.activatedAt ?? undefined,
  };
}

export async function activateLicense(key: string, email: string): Promise<LicenseInfo> {
  const resp = await fetch(`${LICENSE_SERVER}/api/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, email }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Server error" }));
    throw new Error(err.error || `Activation failed: ${resp.status}`);
  }

  const data = await resp.json();

  const now = new Date().toISOString();
  const row = {
    id: "singleton" as const,
    licenseKey: key,
    email: data.email || email,
    activatedAt: now,
    expiresAt: data.expiresAt || null,
    status: "active" as const,
    lastChecked: now,
    planName: data.planName || "Standard",
  };

  db.insert(license)
    .values(row)
    .onConflictDoUpdate({ target: license.id, set: row })
    .run();

  return { status: "active", email: row.email, planName: row.planName, expiresAt: row.expiresAt };
}

export async function checkLicenseOnline(): Promise<void> {
  const row = db.select().from(license).where(eq(license.id, "singleton")).get();
  if (!row?.licenseKey || row.status !== "active") return;

  if (row.lastChecked) {
    const diff = Date.now() - new Date(row.lastChecked).getTime();
    if (diff < 3 * 24 * 60 * 60 * 1000) return;
  }

  try {
    const resp = await fetch(`${LICENSE_SERVER}/api/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: row.licenseKey }),
    });
    const data = await resp.json();
    const newStatus = data.valid ? "active" : "expired";
    db.insert(license)
      .values({ id: "singleton", status: newStatus, lastChecked: new Date().toISOString() })
      .onConflictDoUpdate({ target: license.id, set: { status: newStatus, lastChecked: new Date().toISOString() } })
      .run();
  } catch {
    // Offline — не блокируем
  }
}

const FREE_PATHS = ["/api/license", "/api/health", "/api/version"];

// В dev режиме лицензия не требуется
const isDev = !process.env.PKG_EXECPATH && !process.env.NODE_ENV;

export function requireLicense(req: any, res: any, next: any): void {
  if (isDev) return next();
  if (FREE_PATHS.some(p => req.path.startsWith(p))) return next();

  const info = getLicense();
  if (info.status === "active") return next();

  res.status(403).json({
    error: "license_required",
    message: "Требуется активная лицензия. Откройте Settings → License.",
  });
}
