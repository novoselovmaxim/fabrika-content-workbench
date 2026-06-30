import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useState, useEffect } from "react";
import { useUpdater } from "../lib/useUpdater";

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

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health });

  // Load available models from provider
  const { data: modelsData, isLoading: modelsLoading } = useQuery({
    queryKey: ["models"],
    queryFn: () => fetch("/api/settings/models/list").then((r) => r.json()),
    refetchOnMount: true,
  });

  const { data: igStatus, refetch: refetchIg } = useQuery({
    queryKey: ["instagram", "status"],
    queryFn: () => fetch("/api/instagram/status").then((r) => r.json()),
  });

  // Load saved settings
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
  const [igAccessToken, setIgAccessToken] = useState("");
  const [igAccountId, setIgAccountId] = useState("");

  // Per-task model selections
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
    // Reset task models that no longer match the selected provider
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
      if (savedSettings.ig_access_token) setIgAccessToken(savedSettings.ig_access_token);
      if (savedSettings.ig_account_id) setIgAccountId(savedSettings.ig_account_id);
      // Load per-task models (saved setting, or first available model)
      const loaded: Record<string, string> = {};
      const textModels = modelsData?.textModels || FALLBACK_MODELS;
      for (const t of TASK_MODELS) {
        loaded[t.key] = savedSettings[t.key] || textModels[0] || FALLBACK_MODELS[0];
      }
      setTaskModels(loaded);
    }
  }, [savedSettings]);

  // Save AI settings
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
        }),
      }).then((r) => r.json()),
  });

  // Save task model settings
  const saveTaskModels = useMutation({
    mutationFn: () =>
      fetch("/api/settings/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskModels),
      }).then((r) => r.json()),
  });

  // Save Instagram settings
  const saveIgSettings = useMutation({
    mutationFn: () =>
      fetch("/api/settings/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ig_access_token: igAccessToken,
          ig_account_id: igAccountId,
        }),
      }).then((r) => r.json()),
  });

  const configureIg = useMutation({
    mutationFn: () =>
      fetch("/api/instagram/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: igAccessToken, instagramAccountId: igAccountId }),
      }).then((r) => r.json()),
    onSuccess: () => refetchIg(),
  });

  const checkIg = useQuery({
    queryKey: ["instagram", "check"],
    queryFn: () => fetch("/api/instagram/check").then((r) => r.json()),
    enabled: !!(igStatus as any)?.configured,
  });

  const { data: updateData } = useUpdater();

  return (
    <div>
      <div className="page-header">
        <h2>Настройки</h2>
        <p>Настройки приложения</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Server status */}
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
            </div>
            <div>
              <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Vsellm API Key</label>
              <input className="input" type="password" placeholder="sk-vsellm-..." value={vsellmKey} onChange={(e) => setVsellmKey(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Tavily API Key (поиск конкурентов)</label>
              <input className="input" type="password" placeholder="tvly-..." value={tavilyKey} onChange={(e) => setTavilyKey(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Brave Search API Key (поиск конкурентов)</label>
              <input className="input" type="password" placeholder="BSA..." value={braveKey} onChange={(e) => setBraveKey(e.target.value)} />
            </div>
            <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => saveAiSettings.mutate()} disabled={saveAiSettings.isPending}>
              {saveAiSettings.isPending ? "Сохранение..." : "💾 Сохранить ключи"}
            </button>
            <div className="text-xs text-dim">
              Ключи хранятся в базе. Приоритет: .env → база
            </div>
          </div>
        </div>

        {/* Models per task */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Модели по задачам</span>
            {saveTaskModels.isSuccess && <span className="tag tag-ready">Сохранено</span>}
          </div>
          <div className="flex flex-col gap-4">
            {/* Provider filter */}
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

        {/* Meta / Instagram */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Meta / Instagram</span>
            <div className="flex gap-2">
              {(igStatus as any)?.configured && <span className="tag tag-ready">Подключено</span>}
              {saveIgSettings.isSuccess && <span className="tag tag-ready">Сохранено</span>}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Instagram Account ID</label>
              <input className="input" placeholder="178414..." value={igAccountId} onChange={(e) => setIgAccountId(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Access Token</label>
              <input className="input" type="password" placeholder="EAA..." value={igAccessToken} onChange={(e) => setIgAccessToken(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={() => saveIgSettings.mutate()} disabled={saveIgSettings.isPending}>
                {saveIgSettings.isPending ? "Сохранение..." : "💾 Сохранить"}
              </button>
              <button className="btn btn-primary" onClick={() => configureIg.mutate()} disabled={!igAccessToken || !igAccountId || configureIg.isPending}>
                {configureIg.isPending ? "Проверка..." : (igStatus as any)?.configured ? "Переподключить" : "Подключить"}
              </button>
            </div>

            {(checkIg as any)?.valid && (
              <div className="flex items-center gap-2 text-xs">
                <span className="tag tag-ready">✓</span>
                <span>Instagram аккаунт подтвержден (ID: {(checkIg as any).userId})</span>
              </div>
            )}
            {(checkIg as any)?.error && (
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--red)" }}>
                <span>✗</span>
                <span>{(checkIg as any).error}</span>
              </div>
            )}
          </div>
        </div>

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

        {/* Updates */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Обновления</span>
          </div>
          {updateData?.hasUpdate ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm" style={{ color: "var(--accent)", fontWeight: 600 }}>
                Доступна новая версия {updateData.latest}
              </p>
              <p className="text-xs text-dim">
                Текущая версия: {updateData.current}
              </p>
              <a
                href={updateData.releaseUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
                style={{ alignSelf: "flex-start", textDecoration: "none" }}
              >
                📥 Скачать {updateData.latest}
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-dim">✓ У вас актуальная версия</p>
              <p className="text-xs text-dim">
                Проверка обновлений происходит автоматически. При появлении новой версии здесь появится уведомление.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
