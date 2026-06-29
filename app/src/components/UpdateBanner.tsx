import { useUpdater } from "../lib/useUpdater";

export function UpdateBanner() {
  const { data } = useUpdater();
  if (!data?.hasUpdate) return null;

  return (
    <div style={{
      background: "#2563eb", color: "white", padding: "8px 16px",
      display: "flex", justifyContent: "space-between", alignItems: "center",
      fontSize: 14,
    }}>
      <span>Доступна новая версия {data.latest}</span>
      <a href={data.releaseUrl} target="_blank" rel="noreferrer"
        style={{ color: "white", fontWeight: 600 }}>
        Скачать →
      </a>
    </div>
  );
}
