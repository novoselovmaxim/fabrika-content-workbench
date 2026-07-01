import { useState } from "react";
import { useLicense, useActivateLicense } from "../lib/useLicense";
import { useRequestLicense } from "../lib/useRequestLicense";

const TERMS = [
  { value: 1, label: "1 месяц" },
  { value: 3, label: "3 месяца" },
  { value: 6, label: "6 месяцев" },
  { value: 12, label: "12 месяцев" },
];

export function LicenseGate({ children }: { children: React.ReactNode }) {
  const { data: license, isLoading } = useLicense();
  const activate = useActivateLicense();
  const requestLicense = useRequestLicense();
  const [key, setKey] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [showBuy, setShowBuy] = useState(false);
  const [buyEmail, setBuyEmail] = useState("");
  const [buyTerm, setBuyTerm] = useState(1);
  const [sent, setSent] = useState(false);

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

  const handleBuyRequest = async () => {
    if (!buyEmail.trim()) return;
    try {
      await requestLicense.mutateAsync({ email: buyEmail.trim(), termMonths: buyTerm });
      setSent(true);
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

      <div style={{ marginTop: 8, textAlign: "center" }}>
        {!showBuy ? (
          <button
            className="btn btn-ghost"
            onClick={() => setShowBuy(true)}
            style={{ fontSize: 13, color: "var(--text-dim)", cursor: "pointer", background: "none", border: "none", textDecoration: "underline" }}
          >
            Нет ключа? Купить лицензию
          </button>
        ) : sent ? (
          <div style={{ maxWidth: 320 }}>
            <p style={{ color: "var(--accent)", fontWeight: 600, fontSize: 14 }}>
              ✓ Запрос отправлен
            </p>
            <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 4 }}>
              Ожидайте ключ на почту {buyEmail}. Обычно ответ приходит в течение нескольких часов.
            </p>
            <button
              className="btn btn-ghost"
              onClick={() => { setShowBuy(false); setSent(false); }}
              style={{ fontSize: 12, color: "var(--text-dim)", cursor: "pointer", background: "none", border: "none", textDecoration: "underline", marginTop: 8 }}
            >
              ← Назад
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 280 }}>
            <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
              Выберите срок и укажите почту — мы пришлём ключ
            </p>
            <select
              value={buyTerm}
              onChange={e => setBuyTerm(Number(e.target.value))}
              className="input"
              style={{ width: "100%", fontSize: 14 }}
            >
              {TERMS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              placeholder="Ваш email"
              value={buyEmail}
              onChange={e => setBuyEmail(e.target.value)}
              className="input"
              style={{ width: "100%", fontSize: 14 }}
            />
            <button
              className="btn btn-primary"
              onClick={handleBuyRequest}
              disabled={requestLicense.isPending || !buyEmail.trim()}
              style={{ padding: "8px 16px", fontSize: 14 }}
            >
              {requestLicense.isPending ? "Отправка..." : "📨 Отправить запрос"}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setShowBuy(false)}
              style={{ fontSize: 12, color: "var(--text-dim)", cursor: "pointer", background: "none", border: "none", textDecoration: "underline" }}
            >
              ← Отмена
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
