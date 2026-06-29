import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getStoredProjectId } from "../lib/project";
import { useState, useEffect } from "react";

interface DesignSystem {
  name: string;
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    description: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
    description: string;
  };
  composition: {
    layout: string;
    mood: string;
    lighting: string;
    textures: string;
    description: string;
  };
  systemPrompt: string;
}

const DEFAULT_DESIGN_SYSTEM: DesignSystem = {
  name: "",
  palette: { primary: "#6366f1", secondary: "#818cf8", accent: "#22c55e", background: "#0f1117", text: "#e4e4e7", description: "" },
  typography: { headingFont: "Inter", bodyFont: "system-ui", description: "" },
  composition: { layout: "центр", mood: "спокойный", lighting: "естественное", textures: "", description: "" },
  systemPrompt: "",
};

export default function BrandStylesPage() {
  const queryClient = useQueryClient();
  const currentProjectId = getStoredProjectId();

  const { data: project } = useQuery({
    queryKey: ["project", currentProjectId],
    queryFn: () => api.projects.get(currentProjectId!),
    enabled: !!currentProjectId,
  });

  const { data: styles = [], refetch: refetchStyles } = useQuery({
    queryKey: ["brand-styles", currentProjectId],
    queryFn: () => api.brandStyles.get(currentProjectId!),
    enabled: !!currentProjectId,
  });

  const { data: knowledgeStats } = useQuery({
    queryKey: ["knowledge-stats", currentProjectId],
    queryFn: () => api.knowledge.stats(currentProjectId!),
    enabled: !!currentProjectId,
  });

  const [localStyles, setLocalStyles] = useState<any[]>([]);
  const [designSystem, setDesignSystem] = useState<DesignSystem | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [genSuggested, setGenSuggested] = useState(false);
  const [editSysPrompt, setEditSysPrompt] = useState("");

  useEffect(() => {
    if (styles.length > 0) {
      setLocalStyles(styles);
      const ds = styles.find((s: any) => s.contentType === "design_system");
      if (ds) {
        try {
          const parsed = JSON.parse(ds.systemPrompt);
          setDesignSystem(parsed);
          setEditSysPrompt(parsed.systemPrompt || "");
        } catch { /* ignore malformed */ }
      }
    } else if (currentProjectId) {
      setLocalStyles([]);
    }
  }, [styles, currentProjectId]);

  // Suggest generation if there's knowledge or project has basic info
  useEffect(() => {
    if (!project || designSystem) return;
    const hasInfo = (project.niche || project.audience) && (knowledgeStats && knowledgeStats.total > 0);
    if (hasInfo) setGenSuggested(true);
  }, [project, knowledgeStats, designSystem]);

  const saveStyles = useMutation({
    mutationFn: () => api.brandStyles.save(currentProjectId!, localStyles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-styles", currentProjectId] });
      refetchStyles();
    },
  });

  const addStyle = () => {
    setLocalStyles((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", contentType: "carousel", systemPrompt: "", isActive: false, logoUrl: "" },
    ]);
  };

  const updateStyle = (id: string, field: string, value: any) => {
    setLocalStyles((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const deleteStyle = (id: string) => {
    setLocalStyles((prev) => prev.filter((s) => s.id !== id));
  };

  const handleGenerate = async () => {
    if (!currentProjectId) return;
    setGenLoading(true);
    try {
      const result = await api.projects.generateDesignSystem(currentProjectId);
      if (result.designSystem) {
        setDesignSystem(result.designSystem);
        setEditSysPrompt(result.designSystem.systemPrompt || "");
        setGenSuggested(false);
      }
    } catch (err: any) {
      alert("Ошибка генерации: " + err.message);
    } finally {
      setGenLoading(false);
    }
  };

  const handleSaveDesignSystem = () => {
    if (!designSystem || !currentProjectId) return;
    const updated = { ...designSystem, systemPrompt: editSysPrompt };
    const dsEntry = {
      id: "design-system",
      name: "🎨 Дизайн-система: " + (updated.name || "без названия"),
      contentType: "design_system",
      systemPrompt: JSON.stringify(updated),
      isActive: false,
    };
    const filtered = localStyles.filter((s) => s.contentType !== "design_system");
    const newStyles = [...filtered, dsEntry];
    setLocalStyles(newStyles);
    setDesignSystem(updated);
    saveStyles.mutate();
  };

  const handleApplyToStyles = () => {
    if (!designSystem || !currentProjectId) return;
    const styleEntry = {
      id: crypto.randomUUID(),
      name: designSystem.name || "Основной стиль",
      contentType: "all",
      systemPrompt: editSysPrompt,
      isActive: true,
    };
    const filtered = localStyles.filter((s) => s.contentType === "design_system" || s.contentType === "all");
    const newStyles = [...filtered, styleEntry];
    setLocalStyles(newStyles);
    saveStyles.mutate();
  };

  const updatePalette = (key: keyof DesignSystem["palette"], value: string) => {
    if (!designSystem) return;
    setDesignSystem({ ...designSystem, palette: { ...designSystem.palette, [key]: value } });
  };

  const updateTypography = (key: keyof DesignSystem["typography"], value: string) => {
    if (!designSystem) return;
    setDesignSystem({ ...designSystem, typography: { ...designSystem.typography, [key]: value } });
  };

  const updateComposition = (key: keyof DesignSystem["composition"], value: string) => {
    if (!designSystem) return;
    setDesignSystem({ ...designSystem, composition: { ...designSystem.composition, [key]: value } });
  };

  if (!currentProjectId) {
    return (
      <div>
        <div className="page-header">
          <h2>🎨 Фирменный стиль</h2>
          <p>Сначала создайте проект в Стратегии</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>🎨 Фирменный стиль</h2>
        <p>Дизайн-система и системные промпты для генерации изображений</p>
      </div>

      {/* Generate suggestion banner */}
      {genSuggested && !genLoading && (
        <div style={{
          padding: "16px 20px", background: "rgba(99,102,241,0.1)",
          border: "1px solid rgba(99,102,241,0.3)", borderRadius: 12, marginBottom: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>🧬 Достаточно информации для дизайн-системы</div>
            <div className="text-sm text-dim" style={{ marginTop: 4 }}>
              На основе {knowledgeStats?.total || 0} материалов в базе знаний AI может создать визуальный стиль бренда
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleGenerate} style={{ fontSize: 14, padding: "10px 24px" }}>
            🎨 Сгенерировать
          </button>
        </div>
      )}

      {/* Loading */}
      {genLoading && (
        <div className="card" style={{ textAlign: "center", padding: 40, marginBottom: 20 }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>⏳ AI создаёт дизайн-систему...</div>
          <div className="text-sm text-dim">Анализ бренда, цветовой палитры, типографики и визуального языка</div>
        </div>
      )}

      {/* Design System display */}
      {designSystem && !genLoading && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">🎨 {designSystem.name || "Дизайн-система"}</span>
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={handleSaveDesignSystem} disabled={saveStyles.isPending}>
                {saveStyles.isPending ? "Сохранение..." : "💾 Сохранить"}
              </button>
              <button className="btn btn-ghost" onClick={handleApplyToStyles} disabled={saveStyles.isPending}>
                ➡️ Применить к стилям
              </button>
            </div>
          </div>

          {/* Color palette */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Цветовая палитра</div>
            <div className="flex gap-3" style={{ flexWrap: "wrap" }}>
              {(["primary", "secondary", "accent", "background", "text"] as const).map((key) => (
                <div key={key} className="flex flex-col gap-1" style={{ alignItems: "center" }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 10,
                    background: designSystem.palette[key],
                    border: "2px solid var(--border)",
                    cursor: "pointer",
                  }}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "color";
                      input.value = designSystem.palette[key];
                      input.addEventListener("input", (e) => updatePalette(key, (e.target as HTMLInputElement).value));
                      input.click();
                    }}
                  />
                  <span style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-dim)" }}>{key}</span>
                  <input
                    className="input"
                    style={{ width: 90, fontSize: 11, textAlign: "center", padding: "4px 6px" }}
                    value={designSystem.palette[key]}
                    onChange={(e) => updatePalette(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <textarea
              className="input" rows={2}
              style={{ marginTop: 8, fontSize: 12 }}
              value={designSystem.palette.description}
              onChange={(e) => setDesignSystem({ ...designSystem, palette: { ...designSystem.palette, description: e.target.value } })}
              placeholder="Описание палитры"
            />
          </div>

          {/* Typography */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Типографика</div>
            <div className="flex gap-4" style={{ flexWrap: "wrap" }}>
              <div className="flex flex-col gap-1" style={{ flex: 1, minWidth: 180 }}>
                <label className="text-xs text-dim">Шрифт заголовков</label>
                <input className="input" value={designSystem.typography.headingFont}
                  onChange={(e) => updateTypography("headingFont", e.target.value)} />
              </div>
              <div className="flex flex-col gap-1" style={{ flex: 1, minWidth: 180 }}>
                <label className="text-xs text-dim">Шрифт текста</label>
                <input className="input" value={designSystem.typography.bodyFont}
                  onChange={(e) => updateTypography("bodyFont", e.target.value)} />
              </div>
            </div>
            <textarea
              className="input" rows={2}
              style={{ marginTop: 8, fontSize: 12 }}
              value={designSystem.typography.description}
              onChange={(e) => updateTypography("description", e.target.value)}
              placeholder="Описание типографики"
            />
          </div>

          {/* Composition */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Композиция и визуальный язык</div>
            <div className="flex gap-4" style={{ flexWrap: "wrap" }}>
              <div className="flex flex-col gap-1" style={{ flex: 1, minWidth: 150 }}>
                <label className="text-xs text-dim">Расположение</label>
                <input className="input" value={designSystem.composition.layout}
                  onChange={(e) => updateComposition("layout", e.target.value)} />
              </div>
              <div className="flex flex-col gap-1" style={{ flex: 1, minWidth: 150 }}>
                <label className="text-xs text-dim">Настроение</label>
                <input className="input" value={designSystem.composition.mood}
                  onChange={(e) => updateComposition("mood", e.target.value)} />
              </div>
              <div className="flex flex-col gap-1" style={{ flex: 1, minWidth: 150 }}>
                <label className="text-xs text-dim">Освещение</label>
                <input className="input" value={designSystem.composition.lighting}
                  onChange={(e) => updateComposition("lighting", e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1" style={{ marginTop: 8 }}>
              <label className="text-xs text-dim">Текстуры</label>
              <input className="input" value={designSystem.composition.textures}
                onChange={(e) => updateComposition("textures", e.target.value)} />
            </div>
            <textarea
              className="input" rows={2}
              style={{ marginTop: 8, fontSize: 12 }}
              value={designSystem.composition.description}
              onChange={(e) => updateComposition("description", e.target.value)}
              placeholder="Описание визуального языка"
            />
          </div>

          {/* System prompt */}
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <label className="text-xs text-dim" style={{ fontWeight: 600 }}>Системный промпт для генерации</label>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }}
                onClick={() => handleGenerate()} disabled={genLoading}>
                🔄 Перегенерировать
              </button>
            </div>
            <textarea
              className="input" rows={5}
              value={editSysPrompt}
              onChange={(e) => setEditSysPrompt(e.target.value)}
              placeholder="Промпт для генерации изображений"
              style={{ fontFamily: "inherit", fontSize: 13, lineHeight: 1.5 }}
            />
          </div>

          {/* Action hint */}
          <div className="text-xs text-dim" style={{ marginTop: 12, textAlign: "center" }}>
            Нажмите «💾 Сохранить» чтобы сохранить дизайн-систему, или «➡️ Применить к стилям» чтобы добавить как активный стиль
          </div>
        </div>
      )}

      {/* Existing brand styles */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Стили проекта</span>
          {saveStyles.isSuccess && <span className="tag tag-ready">Сохранено</span>}
        </div>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-dim">
            Каждый стиль добавляется к промпту для генерации изображения.
            Можно применить/отключить для каждого типа контента.
            Стили автоматически используются во всех генерациях контента этого проекта.
          </p>

          {localStyles.filter((s) => s.contentType !== "design_system").map((style) => (
            <div key={style.id} style={{ padding: 14, background: "var(--bg-hover)", borderRadius: 8 }}>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
                  <input
                    className="input"
                    style={{ flex: 1, minWidth: 180 }}
                    placeholder="Название стиля"
                    value={style.name}
                    onChange={(e) => updateStyle(style.id, "name", e.target.value)}
                  />
                  <select
                    className="input"
                    style={{ width: 150 }}
                    value={style.contentType}
                    onChange={(e) => updateStyle(style.id, "contentType", e.target.value)}
                  >
                    <option value="all">Все типы</option>
                    <option value="carousel">Карусель</option>
                    <option value="post">Пост</option>
                    <option value="stories">Stories</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={style.isActive}
                      onChange={(e) => updateStyle(style.id, "isActive", e.target.checked)}
                    />
                    Активен
                  </label>
                  <button
                    className="btn btn-ghost"
                    style={{ color: "var(--red)", fontSize: 12 }}
                    onClick={() => deleteStyle(style.id)}
                  >
                    🗑 Удалить
                  </button>
                </div>
                <div>
                  <label className="text-xs text-dim" style={{ display: "block", marginBottom: 2 }}>
                    URL логотипа бренда (опционально)
                  </label>
                  <input
                    className="input"
                    value={style.logoUrl || ""}
                    onChange={(e) => updateStyle(style.id, "logoUrl", e.target.value)}
                    placeholder="https://example.com/logo.png"
                    style={{ fontSize: 12 }}
                  />
                </div>
                <div>
                  <label className="text-xs text-dim" style={{ display: "block", marginBottom: 2 }}>
                    Системный промпт
                  </label>
                  <textarea
                    className="input"
                    rows={4}
                    value={style.systemPrompt}
                    onChange={(e) => updateStyle(style.id, "systemPrompt", e.target.value)}
                    placeholder="Опишите фирменный стиль: цвета, освещение, композиция, настроение..."
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
            <button className="btn btn-ghost" onClick={addStyle}>
              ➕ Добавить стиль
            </button>
            <button className="btn btn-primary" onClick={() => saveStyles.mutate()} disabled={saveStyles.isPending}>
              {saveStyles.isPending ? "Сохранение..." : "💾 Сохранить стили"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
