import { useState } from "react";
import { useLicense, useActivateLicense } from "../lib/useLicense";

export function LicenseGate({ children }: { children: React.ReactNode }) {
  const { data: license, isLoading } = useLicense();
  const activate = useActivateLicense();
  const [key, setKey] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  if (isLoading) return <div className="loading">Загрузка...</div>;
  if (license?.status === "active") return <>{children}</>;

  const handleActivate = async () => {
    setError("");
    try {
      await activate.mutateAsync({ key: key.trim(), email: email.trim() });
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100vh", gap: 16, padding: 32,
    }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--accent)" }}>
        🏭 Фабрика Контента
      </h1>
      <p style={{ color: "var(--text-dim)" }}>
        Введите лицензионный ключ для активации
      </p>
      <input
        placeholder="FBR-XXXX-XXXX"
        value={key}
        onChange={e => setKey(e.target.value)}
        className="input"
        style={{ width: 280, fontSize: 16, textAlign: "center" }}
      />
      <input
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="input"
        style={{ width: 280, fontSize: 16, textAlign: "center" }}
      />
      {error && <p style={{ color: "var(--danger, #e74c3c)", fontSize: 14 }}>{error}</p>}
      <button
        className="btn btn-primary"
        onClick={handleActivate}
        disabled={activate.isPending}
        style={{ padding: "10px 24px", fontSize: 16 }}
      >
        {activate.isPending ? "Активация..." : "Активировать"}
      </button>
      <p style={{ fontSize: 12, color: "var(--text-dim)" }}>
        Нет ключа?{" "}
        <a href="https://yourdomain.ru" target="_blank" rel="noreferrer">
          Купить лицензию
        </a>
      </p>
    </div>
  );
}
