import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useState, useEffect } from "react";
import { Sun, Moon, Monitor, Globe } from "lucide-react";
import { useTheme } from "../lib/theme";
import { useUpdater } from "../lib/useUpdater";
import { getStoredProjectId } from "../lib/project";

const LANGUAGES = [
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
  { code: "zh", label: "中文" },
  { code: "ar", label: "العربية" },
  { code: "pt", label: "Português" },
  { code: "tr", label: "Türkçe" },
  { code: "kz", label: "Қазақ" },
];

function LanguageSection() {
  const projectId = getStoredProjectId();
  const queryClient = useQueryClient();

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.projects.get(projectId!),
    enabled: !!projectId,
  });

  const [primary, setPrimary] = useState("ru");
  const [supported, setSupported] = useState<string[]>(["ru"]);

  useEffect(() => {
    if (project) {
      setPrimary(project.primaryLanguage || "ru");
      try {
        const sup = project.supportedLanguages
          ? (typeof project.supportedLanguages === "string" ? JSON.parse(project.supportedLanguages) : project.supportedLanguages)
          : ["ru"];
        setSupported(Array.isArray(sup) ? sup : ["ru"]);
      } catch {
        setSupported(["ru"]);
      }
    }
  }, [project]);

  const saveLanguages = useMutation({
    mutationFn: () => api.projects.update(projectId!, { primaryLanguage: primary, supportedLanguages: JSON.stringify(supported) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
  });

  function toggleSupported(code: string) {
    setSupported((prev) => prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]);
  }

  if (!projectId) return null;

  return (
    <div className="card" style={{ gridColumn: "span 2" }}>
      <div className="card-header">
        <span className="card-title flex items-center gap-2">
          <Globe size={14} />
          Языки проекта
        </span>
        <span className="text-xs text-dim">Задел на мультиязычность</span>
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Основной язык контента</label>
          <select className="input" value={primary} onChange={(e) => setPrimary(e.target.value)} style={{ maxWidth: 300 }}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Дополнительные языки</label>
          <div className="flex gap-1 flex-wrap">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                className={`btn btn-sm ${supported.includes(l.code) ? "btn-primary" : "btn-ghost"}`}
                onClick={() => toggleSupported(l.code)}
                style={{ fontSize: 11 }}
              >
                {l.code === primary ? "★" : ""} {l.label}
              </button>
            ))}
          </div>
          <div className="text-xs text-dim" style={{ marginTop: 4 }}>
            Выбрано: {supported.length} языков
          </div>
        </div>
        <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => saveLanguages.mutate()} disabled={saveLanguages.isPending}>
          {saveLanguages.isPending ? "Сохранение..." : "💾 Сохранить языки"}
        </button>
        {saveLanguages.isSuccess && <span className="tag tag-ready">Сохранено</span>}
      </div>
    </div>
  );
}

const FALLBACK_MODELS = [
  "vsellm/google/gemini-3-flash-preview",
  "vsellm/openai/gpt-4o-mini",
  "vsellm/anthropic/claude-sonnet-4-20250514",
  "vsellm/deepseek/deepseek-chat-v3.1",
  "vsellm/vertex_ai/imagen-4.0-fast-generate-001",
  "zveno/google/gemini-3-flash-preview",
  "zveno/openai/gpt-4o-mini",
  "zveno/anthropic/claude-sonnet-4.6",
  "zveno/openai/gpt-5.2",
  "zveno/openai/gpt-5-image-mini",
  "zveno/openai/o4-mini",
  "zveno/deepseek/deepseek-v4-pro",
  "zveno/qwen/qwen3-235b-a22b",
  "zveno/cohere/command-a",
];

const TASK_MODELS = [
  { key: "model_chat", label: "AI Чат", desc: "Быстрые ответы, диалог" },
  { key: "model_content", label: "Контент", desc: "Каптивы, хуки, CTA, сценарии" },
  { key: "model_strategy", label: "Стратегия", desc: "Идеи, рубрики, брифы" },
  { key: "model_visual_prompt", label: "Визуальные промпты", desc: "Промпты для генерации картинок" },
  { key: "model_image", label: "Генерация изображений", desc: "Создание визуалов" },
];

function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const options: { value: typeof theme; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Светлая", icon: Sun },
    { value: "dark", label: "Тёмная", icon: Moon },
    { value: "system", label: "Как в системе", icon: Monitor },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {options.map((opt) => {
        const active = theme === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", borderRadius: 10, border: "none", cursor: "pointer",
              background: active ? "var(--accent)" : "var(--bg-hover)",
              color: active ? "#fff" : "var(--text)",
              fontSize: 13, fontWeight: active ? 600 : 400,
              transition: "all 0.15s", textAlign: "left",
            }}
          >
            <Icon size={16} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const SEVERITY_LABELS: Record<string, string> = { info: "Инфо", warning: "Предупреждение", block: "Блокирующий" };
const SEVERITY_COLORS: Record<string, string> = { info: "var(--dim)", warning: "var(--orange, #e68a2e)", block: "var(--red)" };

function ComplianceSection() {
  const queryClient = useQueryClient();
  const { data: rules, refetch } = useQuery({
    queryKey: ["policy-rules"],
    queryFn: () => api.compliance.listPolicyRules(),
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formCode, setFormCode] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPattern, setFormPattern] = useState("");
  const [formSeverity, setFormSeverity] = useState("warning");
  const [showForm, setShowForm] = useState(false);

  const toggleRule = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: number }) =>
      api.compliance.updatePolicyRule(id, { enabled }),
    onSuccess: () => refetch(),
  });

  const deleteRule = useMutation({
    mutationFn: (id: string) => api.compliance.deletePolicyRule(id),
    onSuccess: () => refetch(),
  });

  const createRule = useMutation({
    mutationFn: () => api.compliance.createPolicyRule({ code: formCode, description: formDesc, pattern: formPattern, severity: formSeverity }),
    onSuccess: () => { refetch(); setShowForm(false); setFormCode(""); setFormDesc(""); setFormPattern(""); setFormSeverity("warning"); },
  });

  const updateRule = useMutation({
    mutationFn: (data: any) => api.compliance.updatePolicyRule(data.id, data),
    onSuccess: () => { refetch(); setEditingId(null); },
  });

  function startEdit(rule: any) {
    setEditingId(rule.id);
    setFormCode(rule.code);
    setFormDesc(rule.description);
    setFormPattern(rule.pattern || "");
    setFormSeverity(rule.severity || "warning");
  }

  return (
    <div className="card" style={{ gridColumn: "span 2" }}>
      <div className="card-header">
        <span className="card-title">Правила compliance</span>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => { setShowForm(!showForm); setEditingId(null); }}>
          {showForm ? "Отмена" : "+ Добавить"}
        </button>
      </div>
      {(showForm || editingId) && (
        <div className="flex flex-col gap-3" style={{ marginBottom: 12, padding: 12, background: "var(--bg-hover)", borderRadius: 10 }}>
          <div>
            <label className="text-xs text-dim">Код</label>
            <input className="input" value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="no_guaranteed_result" />
          </div>
          <div>
            <label className="text-xs text-dim">Описание</label>
            <input className="input" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Запрет обещаний гарантированного результата" />
          </div>
          <div>
            <label className="text-xs text-dim">Регулярное выражение (regex)</label>
            <input className="input" value={formPattern} onChange={(e) => setFormPattern(e.target.value)} placeholder="\\b(гарантирую|100%)\\b" />
          </div>
          <div>
            <label className="text-xs text-dim">Severity</label>
            <select className="input" value={formSeverity} onChange={(e) => setFormSeverity(e.target.value)}>
              {Object.entries(SEVERITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            {editingId ? (
              <button className="btn btn-primary" onClick={() => updateRule.mutate({ id: editingId, code: formCode, description: formDesc, pattern: formPattern, severity: formSeverity })}>
                💾 Сохранить
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => createRule.mutate()} disabled={!formCode || !formDesc}>
                Создать
              </button>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {(rules || []).map((rule: any) => (
          <div key={rule.id} className="flex items-center justify-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center gap-3" style={{ flex: 1 }}>
              <label className="switch" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={!!rule.enabled}
                  onChange={() => toggleRule.mutate({ id: rule.id, enabled: rule.enabled ? 0 : 1 })}
                />
                <span className="slider round" />
              </label>
              <div style={{ flex: 1 }}>
                <div className="text-sm" style={{ fontWeight: 500 }}>{rule.code}</div>
                <div className="text-xs text-dim">{rule.description}</div>
              </div>
              <span className="tag" style={{ background: SEVERITY_COLORS[rule.severity] || "var(--dim)", color: "#fff", fontSize: 10 }}>
                {SEVERITY_LABELS[rule.severity] || rule.severity}
              </span>
            </div>
            <div className="flex gap-1" style={{ flexShrink: 0 }}>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => startEdit(rule)}>✏️</button>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 6px", color: "var(--red)" }} onClick={() => { if (confirm("Удалить правило?")) deleteRule.mutate(rule.id); }}>🗑</button>
            </div>
          </div>
        ))}
        {(!rules || rules.length === 0) && <div className="text-dim text-sm">Нет правил compliance</div>}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health });

  const { data: modelsData, isLoading: modelsLoading } = useQuery({
    queryKey: ["models"],
    queryFn: () => fetch("/api/settings/models/list").then((r) => r.json()),
    refetchOnMount: true,
  });

  const { data: savedSettings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()),
  });

  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [zvenoKey, setZvenoKey] = useState("");
  const [vsellmKey, setVsellmKey] = useState("");
  const [tavilyKey, setTavilyKey] = useState("");
  const [braveKey, setBraveKey] = useState("");
  const [apifyApiKey, setApifyApiKey] = useState("");

  const [taskModels, setTaskModels] = useState<Record<string, string>>({});
  const [providerFilter, setProviderFilter] = useState("all");

  const availableTextModels: string[] = modelsData?.textModels || FALLBACK_MODELS;
  const availableImageModels: string[] = modelsData?.imageModels ||
    ["vsellm/vertex_ai/imagen-4.0-fast-generate-001", "zveno/openai/gpt-5-image-mini"];

  const availableProviders = [...new Set(
    [...availableTextModels, ...availableImageModels]
      .map((m) => m.split("/")[0])
      .filter(Boolean)
  )].sort();

  function getModelsForTask(taskKey: string): string[] {
    const all = taskKey === "model_image" ? availableImageModels : availableTextModels;
    if (providerFilter === "all") return all;
    return all.filter((m) => m.startsWith(providerFilter + "/"));
  }

  function onProviderFilterChange(provider: string) {
    setProviderFilter(provider);
    setTaskModels((prev) => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        const models = key === "model_image" ? availableImageModels : availableTextModels;
        const filtered = provider === "all" ? models : models.filter((m) => m.startsWith(provider + "/"));
        if (filtered.length > 0 && !filtered.includes(updated[key])) {
          updated[key] = filtered[0];
        }
      }
      return updated;
    });
  }

  useEffect(() => {
    if (savedSettings) {
      if (savedSettings.openai_key) setOpenaiKey(savedSettings.openai_key);
      if (savedSettings.anthropic_key) setAnthropicKey(savedSettings.anthropic_key);
      if (savedSettings.zveno_key) setZvenoKey(savedSettings.zveno_key);
      if (savedSettings.vsellm_key) setVsellmKey(savedSettings.vsellm_key);
      if (savedSettings.tavily_api_key) setTavilyKey(savedSettings.tavily_api_key);
      if (savedSettings.brave_api_key) setBraveKey(savedSettings.brave_api_key);
      if (savedSettings.apify_api_key) setApifyApiKey(savedSettings.apify_api_key);
      const loaded: Record<string, string> = {};
      const textModels = modelsData?.textModels || FALLBACK_MODELS;
      for (const t of TASK_MODELS) {
        loaded[t.key] = savedSettings[t.key] || textModels[0] || FALLBACK_MODELS[0];
      }
      setTaskModels(loaded);
    }
  }, [savedSettings]);

  const saveAiSettings = useMutation({
    mutationFn: () =>
      fetch("/api/settings/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openai_key: openaiKey,
          anthropic_key: anthropicKey,
          zveno_key: zvenoKey,
          vsellm_key: vsellmKey,
          tavily_api_key: tavilyKey,
          brave_api_key: braveKey,
          apify_api_key: apifyApiKey,
        }),
      }).then((r) => r.json()),
  });

  const saveTaskModels = useMutation({
    mutationFn: () =>
      fetch("/api/settings/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskModels),
      }).then((r) => r.json()),
  });

  const { data: updateData } = useUpdater();

  function ContactLink({ label, href, children }: { label: string; href: string; children: React.ReactNode }) {
    return (
      <div>
        <span className="text-dim">{label}: </span>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            const fn = window.electronAPI?.openExternal || ((u: string) => window.open(u, "_blank"));
            fn(href);
          }}
          style={{ color: "var(--accent)", textDecoration: "none", cursor: "pointer" }}
        >{children}</a>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Настройки</h2>
        <p>Настройки приложения</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Server + Theme + Updates in one row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Сервер</span>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between text-sm">
                <span>Статус</span>
                <span className="tag tag-ready">{health?.status || "..."}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>API URL</span>
                <code className="text-dim">http://localhost:3001</code>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>База данных</span>
                <code className="text-dim">database/fabrika.db</code>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Оформление</span>
            </div>
            <ThemeSelector />
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Обновления</span>
            </div>
            <div className="flex flex-col gap-4">
              <p className="text-xs text-dim">Текущая версия: {updateData?.current || "..."}</p>
              {updateData?.hasUpdate ? (
                <>
                  <p className="text-sm" style={{ color: "var(--accent)", fontWeight: 600 }}>
                    Доступна новая версия {updateData.latest}
                  </p>
                  <button
                    onClick={() => {
                      const url = updateData.downloadUrl || updateData.releaseUrl;
                      if (window.electronAPI?.openExternal) {
                        window.electronAPI.openExternal(url);
                      } else {
                        window.open(url, "_blank");
                      }
                    }}
                    className="btn btn-primary"
                    style={{ alignSelf: "flex-start", textDecoration: "none", border: "none", cursor: "pointer" }}
                  >
                    📥 Скачать {updateData.latest}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-dim">✓ У вас актуальная версия</p>
                  <p className="text-xs text-dim">
                    Проверка обновлений происходит автоматически. При появлении новой версии здесь появится уведомление.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* AI Providers */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">AI Провайдеры</span>
            {saveAiSettings.isSuccess && <span className="tag tag-ready">Сохранено</span>}
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>OpenAI API Key</label>
              <input className="input" type="password" placeholder="sk-..." value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Anthropic API Key</label>
              <input className="input" type="password" placeholder="sk-ant-..." value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>ZvenoAI API Key</label>
              <input className="input" type="password" placeholder="sk-zveno-..." value={zvenoKey} onChange={(e) => setZvenoKey(e.target.value)} />
              <span className="text-xs text-dim" style={{ marginTop: 4, display: "inline-block" }}>
                получить ключ{' '}
                <a href="https://zveno.ai/?ref=PLDBkWOG" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                  тут
                </a>
              </span>
            </div>
            <div>
              <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Vsellm API Key</label>
              <input className="input" type="password" placeholder="sk-vsellm-..." value={vsellmKey} onChange={(e) => setVsellmKey(e.target.value)} />
              <span className="text-xs text-dim" style={{ marginTop: 4, display: "inline-block" }}>
                получить ключ{' '}
                <a href="https://vsellm.ru/registration?ref=W0GYAW43WQTB" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                  тут
                </a>
              </span>
            </div>
            <div>
              <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Tavily API Key (поиск конкурентов)</label>
              <input className="input" type="password" placeholder="tvly-..." value={tavilyKey} onChange={(e) => setTavilyKey(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Brave Search API Key (поиск конкурентов)</label>
              <input className="input" type="password" placeholder="BSA..." value={braveKey} onChange={(e) => setBraveKey(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Apify API Key (сбор метрик Instagram)</label>
              <input className="input" type="password" placeholder="apify_api_..." value={apifyApiKey} onChange={(e) => setApifyApiKey(e.target.value)} />
            </div>
            <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => saveAiSettings.mutate()} disabled={saveAiSettings.isPending}>
              {saveAiSettings.isPending ? "Сохранение..." : "💾 Сохранить ключи"}
            </button>
            <div className="text-xs text-dim">
              Ключи хранятся в базе. Приоритет: .env → база
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Модели по задачам</span>
            {saveTaskModels.isSuccess && <span className="tag tag-ready">Сохранено</span>}
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex gap-1 flex-wrap">
              <button
                className={`btn btn-sm ${providerFilter === "all" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => onProviderFilterChange("all")}
              >
                Все
              </button>
              {availableProviders.map((p) => (
                <button
                  key={p}
                  className={`btn btn-sm ${providerFilter === p ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => onProviderFilterChange(p)}
                >
                  {p === "vsellm" ? "Vsellm" : p === "zveno" ? "ZvenoAI" : p}
                </button>
              ))}
            </div>

            {TASK_MODELS.map((t) => (
              <div key={t.key}>
                <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>
                  {t.label}
                  <span style={{ opacity: 0.6 }}> — {t.desc}</span>
                </label>
                <div className="flex gap-2 items-center">
                  <select
                    className="input"
                    value={taskModels[t.key] || ""}
                    onChange={(e) => setTaskModels((prev) => ({ ...prev, [t.key]: e.target.value }))}
                    style={{ flex: 1 }}
                  >
                    {modelsLoading ? (
                      <option value="">Загрузка...</option>
                    ) : getModelsForTask(t.key).length === 0 ? (
                      <option value="">Нет моделей (добавьте ключ API)</option>
                    ) : (
                      getModelsForTask(t.key).map((m: string) => (
                        <option key={m} value={m}>{m}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            ))}
            <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => saveTaskModels.mutate()} disabled={saveTaskModels.isPending}>
              {saveTaskModels.isPending ? "Сохранение..." : "💾 Сохранить распределение"}
            </button>
          </div>
        </div>

        <LanguageSection />

        <ComplianceSection />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Export */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Экспорт данных</span>
            </div>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-dim">
                Экспорт контент-плана, постов и ассетов в файловую систему.
              </p>
              <button className="btn btn-ghost" style={{ alignSelf: "flex-start" }}>📦 Экспорт в JSON</button>
              <button className="btn btn-ghost" style={{ alignSelf: "flex-start" }}>📁 Экспорт папки публикации</button>
            </div>
          </div>

          {/* Contacts */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Контакты</span>
            </div>
            <div className="flex flex-col gap-4 text-sm">
              <ContactLink label="Сайт" href="https://fabric.maxnov.ru">fabric.maxnov.ru</ContactLink>
              <ContactLink label="Telegram" href="https://t.me/novoselovmaxim">@novoselovmaxim</ContactLink>
              <ContactLink label="Email" href="mailto:maxim.novoselov@gmail.com">maxim.novoselov@gmail.com</ContactLink>
            </div>
          </div>
        </div>

        </div>
      </div>
  );
}
