import { useUpdater } from "../lib/useUpdater";

function handleDownload(downloadUrl: string) {
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(downloadUrl);
  } else {
    window.open(downloadUrl, "_blank");
  }
}

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
      <button onClick={() => handleDownload(data.downloadUrl)}
        style={{ color: "white", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>
        Скачать →
      </button>
    </div>
  );
}
