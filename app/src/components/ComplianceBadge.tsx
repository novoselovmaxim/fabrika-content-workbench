import { useState } from "react";

const LEVEL_CONFIG = {
  low: { color: "var(--green)", label: "Низкий", icon: "✓", bg: "rgba(34,197,94,0.1)" },
  medium: { color: "var(--orange)", label: "Средний риск", icon: "⚠", bg: "rgba(230,138,46,0.1)" },
  high: { color: "var(--red)", label: "Высокий риск", icon: "🚫", bg: "rgba(229,62,62,0.1)" },
};

interface Violation {
  ruleId: string;
  title: string;
  article: string;
  severity: string;
  explanation: string;
  matchedText?: string;
  source: "regex" | "ai";
}

interface Props {
  riskScore?: number;
  riskLevel?: "low" | "medium" | "high";
  violations?: Violation[];
  loading?: boolean;
  onCheckClick?: () => void;
  compact?: boolean;
}

export default function ComplianceBadge({
  riskScore = 0,
  riskLevel = "low",
  violations = [],
  loading = false,
  onCheckClick,
  compact = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const config = LEVEL_CONFIG[riskLevel];

  if (loading) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 8, background: "var(--bg-hover)", fontSize: 12, color: "var(--text-dim)" }}>
        <span style={{ animation: "pulse 1.5s infinite" }}>⏳</span>
        Проверка...
      </div>
    );
  }

  if (compact) {
    return (
      <span
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "2px 8px", borderRadius: 6,
          background: config.bg, color: config.color,
          fontSize: 11, fontWeight: 600, cursor: "pointer",
          border: `1px solid ${config.color}30`,
        }}
        title={`Риск: ${config.label} (${Math.round(riskScore * 100)}%)`}
      >
        <span>{config.icon}</span>
        <span>{Math.round(riskScore * 100)}%</span>
      </span>
    );
  }

  return (
    <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${config.color}20` }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", background: config.bg, cursor: "pointer",
          borderBottom: expanded ? `1px solid ${config.color}20` : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{config.icon}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: config.color }}>{config.label}</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
              {violations.length} нарушений · {Math.round(riskScore * 100)}% риск
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {onCheckClick && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: "2px 8px" }}
              onClick={(e) => { e.stopPropagation(); onCheckClick(); }}
            >
              Проверить
            </button>
          )}
          <span style={{ fontSize: 12, color: "var(--text-dim)", transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "" }}>
            ▼
          </span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "8px 12px", background: "var(--bg)" }}>
          {violations.length === 0 ? (
            <div className="text-sm text-dim" style={{ padding: "8px 0" }}>
              Нарушений не обнаружено
            </div>
          ) : (
            violations.map((v, i) => (
              <div key={i} style={{
                padding: "8px 0", borderBottom: i < violations.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <SeverityBadge severity={v.severity} />
                  <span className="text-xs text-dim" style={{ background: "var(--bg-hover)", padding: "1px 6px", borderRadius: 4 }}>
                    {v.source === "ai" ? "AI" : "Шаблон"}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{v.title}</span>
                  <span className="text-xs text-dim">{v.article}</span>
                </div>
                <div className="text-sm" style={{ color: "var(--text-dim)", lineHeight: 1.4 }}>
                  {v.explanation}
                </div>
                {v.matchedText && (
                  <div style={{
                    marginTop: 4, padding: "4px 8px", background: "var(--bg-hover)",
                    borderRadius: 6, fontSize: 12, fontFamily: "monospace",
                    color: "var(--text-dim)", borderLeft: `3px solid ${config.color}`,
                  }}>
                    "{v.matchedText}"
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    high: "var(--red)",
    medium: "var(--orange)",
    low: "var(--text-dim)",
  };
  const labels: Record<string, string> = {
    high: "Высокий",
    medium: "Средний",
    low: "Низкий",
  };
  return (
    <span style={{
      fontSize: 10, padding: "1px 6px", borderRadius: 4,
      background: `${colors[severity] || "var(--text-dim)"}20`,
      color: colors[severity] || "var(--text-dim)",
      fontWeight: 600, textTransform: "uppercase",
      letterSpacing: 0.3,
    }}>
      {labels[severity] || severity}
    </span>
  );
}
