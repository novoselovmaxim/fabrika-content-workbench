import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useState, useEffect } from "react";
import ComplianceBadge from "../components/ComplianceBadge";

const CATEGORY_LABELS: Record<string, string> = {
  "general": "Общие требования (ст. 5)",
  "minor-protection": "Защита несовершеннолетних (ст. 6)",
  "banned-goods": "Запрещённые товары (ст. 7)",
  "internet-labeling": "Маркировка (ст. 18.1)",
  "medical": "Медицина и фарма (ст. 24)",
  "bad": "БАДы и добавки (ст. 25)",
  "financial": "Финансовые услуги (ст. 28)",
  "alcohol": "Алкоголь (ст. 21)",
  "gambling": "Азартные игры (ст. 27)",
  "tobacco": "Табак и никотин",
  "military-weapons": "Оружие (ст. 26)",
  "tonic-drinks": "Энергетики (ст. 25.1)",
  "environment": "Экология",
  "video-game": "Видеоигры",
  "personal-data": "Персональные данные",
  "hidden-ad": "Скрытая реклама",
  "promotions": "Акции (ст. 9)",
};

const CATEGORY_COLORS: Record<string, string> = {
  "general": "#6366f1",
  "minor-protection": "#f59e0b",
  "banned-goods": "#ef4444",
  "internet-labeling": "#22c55e",
  "medical": "#06b6d4",
  "bad": "#a855f7",
  "financial": "#f97316",
  "alcohol": "#dc2626",
  "gambling": "#e11d48",
  "tobacco": "#78716c",
  "military-weapons": "#1e293b",
  "tonic-drinks": "#0891b2",
  "environment": "#65a30d",
  "video-game": "#8b5cf6",
  "personal-data": "#3b82f6",
  "hidden-ad": "#6b7280",
  "promotions": "#d946ef",
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  vk: "VK",
  telegram: "Telegram",
  youtube: "YouTube",
  zen: "Дзен",
};

const PLATFORM_APPLIES_LABELS: Record<string, string> = {
  apply: "Применяется",
  stricter: "Строже",
  relaxed: "Ослаблено",
  blocked: "Не применяется",
};

export default function CompliancePage() {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [testText, setTestText] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);

  // Custom rule form
  const [customCode, setCustomCode] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [customPattern, setCustomPattern] = useState("");
  const [customSeverity, setCustomSeverity] = useState("warning");
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);

  const { data: rules, isLoading: rulesLoading } = useQuery({
    queryKey: ["compliance-rules"],
    queryFn: () => api.compliance.listRules(),
  });

  const { data: policyRulesData, refetch: refetchPolicy } = useQuery({
    queryKey: ["policy-rules"],
    queryFn: () => api.compliance.listPolicyRules(),
  });

  // Auto-sync on first load
  const syncRules = useMutation({
    mutationFn: () => api.compliance.syncRules(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["compliance-rules"] }),
  });

  useEffect(() => {
    if (rules && rules.length > 0) {
      const hasDbEntry = rules.some((r: any) => r.dbId);
      if (!hasDbEntry) syncRules.mutate();
    }
  }, [rules]);

  const toggleRule = useMutation({
    mutationFn: ({ ruleId, enabled }: { ruleId: string; enabled: number }) =>
      api.compliance.toggleRule(ruleId, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["compliance-rules"] }),
  });

  // Custom rules CRUD
  const createCustomRule = useMutation({
    mutationFn: () => api.compliance.createPolicyRule({
      code: customCode,
      description: customDesc,
      pattern: customPattern,
      severity: customSeverity,
    }),
    onSuccess: () => { refetchPolicy(); resetForm(); },
  });

  const updateCustomRule = useMutation({
    mutationFn: (data: any) => api.compliance.updatePolicyRule(data.id, data),
    onSuccess: () => { refetchPolicy(); setEditingCustomId(null); resetForm(); },
  });

  const toggleCustomRule = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: number }) =>
      api.compliance.updatePolicyRule(id, { enabled }),
    onSuccess: () => refetchPolicy(),
  });

  const deleteCustomRule = useMutation({
    mutationFn: (id: string) => api.compliance.deletePolicyRule(id),
    onSuccess: () => refetchPolicy(),
  });

  function resetForm() {
    setCustomCode("");
    setCustomDesc("");
    setCustomPattern("");
    setCustomSeverity("warning");
    setShowCustomForm(false);
  }

  function startEdit(rule: any) {
    setEditingCustomId(rule.id);
    setCustomCode(rule.code);
    setCustomDesc(rule.description);
    setCustomPattern(rule.pattern || "");
    setCustomSeverity(rule.severity || "warning");
    setShowCustomForm(true);
  }

  const categories = rules
    ? [...new Set(rules.map((r: any) => r.category))].sort()
    : [];

  const filteredRules = rules
    ? selectedCategory === "all"
      ? rules
      : rules.filter((r: any) => r.category === selectedCategory)
    : [];

  const platformFiltered = platformFilter === "all"
    ? filteredRules
    : filteredRules.filter((r: any) => {
        if (!r.platforms) return true;
        return r.platforms[platformFilter] !== "blocked";
      });

  const groupedRules = platformFiltered.reduce((acc: any, r: any) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {} as Record<string, any[]>);

  const enabledCount = rules?.filter((r: any) => r.enabled).length || 0;
  const totalCount = rules?.length || 0;
  const structuralCount = rules?.filter((r: any) => r.ruleType === "structural").length || 0;
  const textCount = totalCount - structuralCount;

  const SEVERITY_LABELS: Record<string, string> = { info: "Инфо", warning: "Предупреждение", block: "Блокирующий" };
  const SEVERITY_COLORS: Record<string, string> = { info: "var(--dim)", warning: "var(--orange)", block: "var(--red)" };

  async function handleTest() {
    if (!testText.trim()) return;
    setTestLoading(true);
    try {
      const result = await api.compliance.check(testText, { useAi: false });
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ error: err.message });
    }
    setTestLoading(false);
  }

  function getPlatformLabel(rule: any): string {
    if (!rule.platforms) return "Все платформы";
    const keys = Object.keys(rule.platforms);
    const applicable = keys.filter(k => rule.platforms[k] !== "blocked");
    if (applicable.length === 0) return "Не применяется";
    if (applicable.length <= 3) return applicable.map((k: string) => PLATFORM_LABELS[k] || k).join(", ");
    return `${applicable.length} платформ`;
  }

  return (
    <div>
      <div className="page-header">
        <h2>Комплаенс</h2>
        <p>Проверка рекламных текстов на соответствие 38-ФЗ «О рекламе»</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          <div className="card">
            <div className="text-2xl font-bold">{totalCount}</div>
            <div className="text-xs text-dim">Всего правил</div>
          </div>
          <div className="card">
            <div className="text-2xl font-bold" style={{ color: "var(--green)" }}>{enabledCount}</div>
            <div className="text-xs text-dim">Активно</div>
          </div>
          <div className="card">
            <div className="text-2xl font-bold">{textCount}</div>
            <div className="text-xs text-dim">Текстовых</div>
          </div>
          <div className="card">
            <div className="text-2xl font-bold" style={{ color: "var(--accent)" }}>{structuralCount}</div>
            <div className="text-xs text-dim">Структурных</div>
          </div>
          <div className="card">
            <div className="text-2xl font-bold">{policyRulesData?.length || 0}</div>
            <div className="text-xs text-dim">Пользовательских</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 8 }}>
          <div className="flex gap-1 flex-wrap">
            <button
              className={`btn btn-sm ${selectedCategory === "all" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setSelectedCategory("all")}
            >
              Все ({totalCount})
            </button>
            {categories.map((cat: string) => (
              <button
                key={cat}
                className={`btn btn-sm ${selectedCategory === cat ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setSelectedCategory(cat)}
                style={selectedCategory === cat ? { background: CATEGORY_COLORS[cat] || "var(--accent)" } : {}}
              >
                {CATEGORY_LABELS[cat] || cat}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <select
              className="input"
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              style={{ width: 160, fontSize: 12 }}
            >
              <option value="all">Все платформы</option>
              {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <button
              className="btn btn-ghost"
              onClick={() => syncRules.mutate()}
              disabled={syncRules.isPending}
              style={{ fontSize: 12 }}
            >
              {syncRules.isPending ? "..." : "⟳"}
            </button>
          </div>
        </div>

        {/* Rules list */}
        {rulesLoading ? (
          <div className="text-dim text-sm">Загрузка правил...</div>
        ) : (
          <div className="flex flex-col gap-3">
            {Object.keys(groupedRules).length === 0 ? (
              <div className="card">
                <div className="text-sm text-dim" style={{ padding: "12px 0" }}>
                  Нет правил в этой категории{platformFilter !== "all" ? " для выбранной платформы" : ""}
                </div>
              </div>
            ) : (
              Object.entries(groupedRules).map(([category, catRules]: [string, any]) => (
                <div key={category} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{
                    padding: "10px 14px",
                    background: `${CATEGORY_COLORS[category] || "var(--bg-hover)"}10`,
                    borderBottom: "1px solid var(--border)",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: CATEGORY_COLORS[category] || "var(--accent)",
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{CATEGORY_LABELS[category] || category}</span>
                    <span className="tag" style={{ fontSize: 10 }}>{catRules.length}</span>
                  </div>
                  {catRules.map((rule: any) => (
                    <div key={rule.id} style={{
                      padding: "10px 14px",
                      borderBottom: "1px solid var(--border)",
                      display: "flex", alignItems: "flex-start", gap: 10,
                      opacity: rule.enabled ? 1 : 0.5,
                    }}>
                      <label className="switch" style={{ margin: 0, flexShrink: 0, marginTop: 2 }}>
                        <input
                          type="checkbox"
                          checked={!!rule.enabled}
                          onChange={() => toggleRule.mutate({ ruleId: rule.id, enabled: rule.enabled ? 0 : 1 })}
                        />
                        <span className="slider round" />
                      </label>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <SeverityTag severity={rule.severity} />
                          <RuleTypeTag ruleType={rule.ruleType} />
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{rule.title}</span>
                          <span className="text-xs text-dim">{rule.article}</span>
                          {rule.appliesTo && (
                            <span className="text-xs" style={{ color: "var(--green)", background: "rgba(34,197,94,0.1)", padding: "1px 6px", borderRadius: 4 }}>
                              {postTypeLabels(rule.appliesTo)}
                            </span>
                          )}
                          {rule.platforms && Object.keys(rule.platforms).length > 0 && (
                            <span className="text-xs" style={{ color: "var(--accent)", background: "rgba(99,102,241,0.1)", padding: "1px 6px", borderRadius: 4 }}>
                              {getPlatformLabel(rule)}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-dim" style={{ marginTop: 2 }}>{rule.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        {/* Custom patterns */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Пользовательские паттерны</span>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => { setShowCustomForm(!showCustomForm); setEditingCustomId(null); resetForm(); }}>
              {showCustomForm ? "Отмена" : "+ Добавить"}
            </button>
          </div>

          {showCustomForm && (
            <div className="flex flex-col gap-3" style={{ marginBottom: 12, padding: 12, background: "var(--bg-hover)", borderRadius: 10 }}>
              <div>
                <label className="text-xs text-dim">Код</label>
                <input className="input" value={customCode} onChange={(e) => setCustomCode(e.target.value)} placeholder="no_guaranteed_result" />
              </div>
              <div>
                <label className="text-xs text-dim">Описание</label>
                <input className="input" value={customDesc} onChange={(e) => setCustomDesc(e.target.value)} placeholder="Запрет обещаний гарантированного результата" />
              </div>
              <div>
                <label className="text-xs text-dim">Регулярное выражение (regex)</label>
                <input className="input" value={customPattern} onChange={(e) => setCustomPattern(e.target.value)} placeholder="\\b(гарантирую|100%)\\b" />
                <span className="text-xs text-dim" style={{ marginTop: 2, display: "block" }}>Проверяется флагом <code>giu</code></span>
              </div>
              <div>
                <label className="text-xs text-dim">Уровень</label>
                <select className="input" value={customSeverity} onChange={(e) => setCustomSeverity(e.target.value)}>
                  {Object.entries(SEVERITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                {editingCustomId ? (
                  <button className="btn btn-primary" onClick={() => updateCustomRule.mutate({ id: editingCustomId, code: customCode, description: customDesc, pattern: customPattern, severity: customSeverity })}>
                    💾 Сохранить
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={() => createCustomRule.mutate()} disabled={!customCode || !customDesc}>
                    Создать
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {(!policyRulesData || policyRulesData.length === 0) ? (
              <div className="text-dim text-sm">Нет пользовательских правил. Добавьте своё regex-правило, чтобы проверять текст на специфические фразы.</div>
            ) : (
              policyRulesData.map((rule: any) => (
                <div key={rule.id} className="flex items-start justify-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-3" style={{ flex: 1 }}>
                    <label className="switch" style={{ margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={!!rule.enabled}
                        onChange={() => toggleCustomRule.mutate({ id: rule.id, enabled: rule.enabled ? 0 : 1 })}
                      />
                      <span className="slider round" />
                    </label>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm" style={{ fontWeight: 500 }}>{rule.code}</span>
                        <span className="tag" style={{ background: SEVERITY_COLORS[rule.severity] || "var(--dim)", color: "#fff", fontSize: 10 }}>
                          {SEVERITY_LABELS[rule.severity] || rule.severity}
                        </span>
                      </div>
                      <div className="text-xs text-dim">{rule.description}</div>
                      {rule.pattern && (
                        <code className="text-xs" style={{ color: "var(--accent)", marginTop: 2, display: "inline-block" }}>{rule.pattern}</code>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1" style={{ flexShrink: 0, marginLeft: 8 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => startEdit(rule)}>✏️</button>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 6px", color: "var(--red)" }} onClick={() => { if (confirm("Удалить правило?")) deleteCustomRule.mutate(rule.id); }}>🗑</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Test sandbox */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Песочница</span>
            <span className="text-xs text-dim">Проверка произвольного текста по всем активным правилам</span>
          </div>
          <div className="flex flex-col gap-3">
            <textarea
              className="input"
              rows={5}
              placeholder="Вставьте текст для проверки..."
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              style={{ fontFamily: "inherit", resize: "vertical" }}
            />
            <div className="flex items-center gap-2">
              <button
                className="btn btn-primary"
                onClick={handleTest}
                disabled={!testText.trim() || testLoading}
              >
                {testLoading ? "Проверка..." : "🔍 Проверить текст"}
              </button>
              {testResult && (
                <span className="text-xs text-dim">
                  {testResult.violations?.length || 0} нарушений · риск {Math.round((testResult.riskScore || 0) * 100)}%
                </span>
              )}
            </div>
            {testResult && (
              <ComplianceBadge
                riskScore={testResult.riskScore}
                riskLevel={testResult.riskLevel}
                violations={testResult.violations}
              />
            )}
            {testResult?.error && (
              <div className="text-sm" style={{ color: "var(--red)" }}>
                Ошибка: {testResult.error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const POST_TYPE_LABELS: Record<string, string> = {
  advertising: "Реклама",
  sponsored: "Спонсорское",
  personal: "Личное",
  educational: "Обучение",
  informational: "Инфо",
  other: "Другое",
};

function postTypeLabels(appliesTo: string[]) {
  if (!appliesTo || appliesTo.length === 0) return "Все типы";
  const mapped = appliesTo.map((t: string) => POST_TYPE_LABELS[t] || t);
  if (mapped.length <= 3) return mapped.join(", ");
  return `${mapped.slice(0, 3).join(", ")}…`;
}

function SeverityTag({ severity }: { severity: string }) {
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
      fontWeight: 600,
    }}>
      {labels[severity] || severity}
    </span>
  );
}

function RuleTypeTag({ ruleType }: { ruleType: string }) {
  return (
    <span style={{
      fontSize: 10, padding: "1px 6px", borderRadius: 4,
      background: ruleType === "structural" ? "rgba(99,102,241,0.15)" : "rgba(107,114,128,0.15)",
      color: ruleType === "structural" ? "var(--accent)" : "var(--text-dim)",
      fontWeight: 600,
    }}>
      {ruleType === "structural" ? "Структура" : "Текст"}
    </span>
  );
}
