const NEW_PREFIX = "fabrika-";
const OLD_PREFIX = "bereg-";

function migrateKey(key: string): string | null {
  const newKey = NEW_PREFIX + key;
  const oldKey = OLD_PREFIX + key;
  const newVal = localStorage.getItem(newKey);
  if (newVal !== null) return newKey;
  const oldVal = localStorage.getItem(oldKey);
  if (oldVal !== null) {
    localStorage.setItem(newKey, oldVal);
    localStorage.removeItem(oldKey);
    return newKey;
  }
  return null;
}

export function getStoredProjectId(): string | undefined {
  try {
    const key = migrateKey("current-project-id");
    return key ? localStorage.getItem(key) || undefined : undefined;
  } catch {
    return undefined;
  }
}

export function setStoredProjectId(id: string) {
  try {
    localStorage.setItem(NEW_PREFIX + "current-project-id", id);
  } catch { /* ignore */ }
}

export function clearStoredProjectId() {
  try {
    localStorage.removeItem(NEW_PREFIX + "current-project-id");
  } catch { /* ignore */ }
}

export function getStoredPlatformId(): string | undefined {
  try {
    const key = migrateKey("current-platform-id");
    return key ? localStorage.getItem(key) || undefined : undefined;
  } catch {
    return undefined;
  }
}

export function setStoredPlatformId(id: string) {
  try {
    localStorage.setItem(NEW_PREFIX + "current-platform-id", id);
  } catch { /* ignore */ }
}

export function clearStoredPlatformId() {
  try {
    localStorage.removeItem(NEW_PREFIX + "current-platform-id");
  } catch { /* ignore */ }
}

export function getStoredProductId(): string | undefined {
  try {
    const key = migrateKey("current-product-id");
    return key ? localStorage.getItem(key) || undefined : undefined;
  } catch {
    return undefined;
  }
}

export function setStoredProductId(id: string) {
  try {
    localStorage.setItem(NEW_PREFIX + "current-product-id", id);
  } catch { /* ignore */ }
}

export function clearStoredProductId() {
  try {
    localStorage.removeItem(NEW_PREFIX + "current-product-id");
  } catch { /* ignore */ }
}
