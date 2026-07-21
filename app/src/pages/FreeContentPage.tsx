import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getStoredProjectId, getStoredPlatformId } from "../lib/project";
import { PLATFORM_COLORS } from "../lib/constants";
import { useNavigate, useSearchParams } from "react-router-dom";
import ChatPanel from "../components/ChatPanel";

const STEPS = [
  { key: "rubric", label: "Рубрика" },
  { key: "topic", label: "Тема" },
  { key: "type", label: "Тип поста" },
  { key: "create", label: "Дата и создание" },
];

export default function FreeContentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const projectId = getStoredProjectId() || "";
  const platformId = searchParams.get("platformId") || getStoredPlatformId() || undefined;

  const [step, setStep] = useState(0);
  const [selectedRubric, setSelectedRubric] = useState<any>(null);
  const [selectedTopic, setSelectedTopic] = useState<any>(null);
  const [selectedContentType, setSelectedContentType] = useState<any>(null);
  const [manualTopicTitle, setManualTopicTitle] = useState("");
  const [manualTopicDesc, setManualTopicDesc] = useState("");
  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [error, setError] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);

  const { data: platforms } = useQuery({
    queryKey: ["platforms", projectId],
    queryFn: () => api.platforms.listByProject(projectId!),
    enabled: !!projectId,
  });
  const currentPlatform = platforms?.find((p: any) => p.id === platformId);
  const platformColor = PLATFORM_COLORS[currentPlatform?.type] || "var(--accent)";

  const { data: rubrics } = useQuery({
    queryKey: ["rubrics", projectId, platformId],
    queryFn: () => api.rubrics.list(projectId, platformId),
    enabled: !!projectId,
  });

  const { data: topics } = useQuery({
    queryKey: ["topics", projectId, platformId, selectedRubric?.id],
    queryFn: () => api.topics.list(projectId, platformId),
    enabled: !!projectId && step >= 1,
  });

  const { data: contentTypes } = useQuery({
    queryKey: ["content-types"],
    queryFn: api.contentTypes.list,
  });

  const suggestRubrics = useMutation({
    mutationFn: () => api.generate.suggestRubrics({ projectId, platformId }),
    onSuccess: async (data: any) => {
      setError(null);
      if (!data?.length) {
        setError("AI не предложил рубрики. Попробуйте ещё раз.");
        return;
      }
      await api.rubrics.bulkCreate({ projectId, platformId: platformId || "", rubrics: data });
      queryClient.invalidateQueries({ queryKey: ["rubrics", projectId, platformId] });
    },
    onError: (err: any) => setError(err?.message || "Ошибка генерации рубрик"),
  });

  const suggestTopics = useMutation({
    mutationFn: () =>
      api.generate.suggestTopics({
        projectId,
        platformId,
        rubricId: selectedRubric?.id,
        rubricName: selectedRubric?.name,
        rubricDescription: selectedRubric?.description,
      }),
    onSuccess: async (data: any) => {
      setError(null);
      if (!data?.length || !selectedRubric) {
        setError("AI не предложил темы. Попробуйте ещё раз или напишите вручную.");
        return;
      }
      const items = data.map((t: any) => ({
        title: t.title,
        description: t.description || "",
        rubricId: selectedRubric.id,
        source: "ai_suggested",
      }));
      await api.topics.bulkCreate({ projectId, platformId: platformId || "", topics: items });
      queryClient.invalidateQueries({ queryKey: ["topics", projectId, platformId] });
    },
    onError: (err: any) => setError(err?.message || "Ошибка генерации тем"),
  });

  const createPost = useMutation({
    mutationFn: async () => {
      const topicTitle = selectedTopic?.title || manualTopicTitle || "Без темы";
      const payload: any = {
        projectId,
        platformId: platformId || null,
        title: topicTitle,
        scheduledDate,
        status: "idea",
        rubricId: selectedRubric?.id || null,
        topicId: selectedTopic?.id || null,
        contentTypeId: selectedContentType?.id || null,
      };
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 409) {
        const data = await res.json();
        navigate(`/posts/${data.existingPostId}`);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Ошибка создания поста");
      }
      return res.json();
    },
    onSuccess: (post) => {
      if (!post) return;
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      navigate(`/posts/${post.id}`);
    },
    onError: (err: any) => setError(err?.message || "Ошибка создания поста"),
  });

  const nextStep = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  const canProceed = () => {
    if (step === 0) return !!selectedRubric;
    if (step === 1) return !!(selectedTopic || manualTopicTitle.trim());
    if (step === 2) return !!selectedContentType;
    if (step === 3) return !!scheduledDate;
    return false;
  };

  const isAiGenerating = suggestRubrics.isPending || suggestTopics.isPending;

  return (
    <div style={{ width: "100%" }}>
      <div className="page-header">
        <h2>
          Свободный контент
          {currentPlatform && (
            <span style={{
              fontSize: 11, marginLeft: 10, verticalAlign: "middle",
              background: `${platformColor}18`,
              color: platformColor,
              border: `1px solid ${platformColor}30`,
              borderRadius: 6, padding: "2px 10px", fontWeight: 500,
            }}>
              {currentPlatform.name}
            </span>
          )}
        </h2>
        <p>Создайте пост вручную с помощью AI на каждом шаге</p>
      </div>

      {/* Steps bar */}
      <div className="flex items-center gap-1" style={{ marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
        {STEPS.map((s, i) => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
            <button
              className={`btn ${i === step ? "btn-primary" : i < step ? "btn-ghost" : "btn-ghost"}`}
              onClick={() => i <= step && setStep(i)}
              style={{ fontSize: 12, padding: "5px 10px", opacity: i > step ? 0.4 : 1, whiteSpace: "nowrap" }}
              disabled={i > step}
            >
              {i < step ? "✓" : s.label}
            </button>
            {i < STEPS.length - 1 && <div style={{ width: 8, height: 1, background: "var(--border)" }} />}
          </div>
        ))}
      </div>
      <div style={{ height: 3, background: "var(--bg-hover)", borderRadius: 2, marginBottom: 24 }}>
        <div style={{
          height: "100%", width: `${((step + 1) / STEPS.length) * 100}%`,
          background: "var(--accent)", borderRadius: 2, transition: "width 0.3s",
        }} />
      </div>

      {error && (
        <div style={{
          padding: "10px 14px", background: "rgba(239,68,68,0.12)",
          border: "1px solid rgba(239,68,68,0.4)", borderRadius: 6,
          marginBottom: 16, fontSize: 14, color: "#ef4444", fontWeight: 500,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span>⚠️ {error}</span>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div className="card" style={{ padding: 24, minHeight: 300 }}>

        {/* Step 0: Rubric */}
        {step === 0 && (
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Выберите рубрику</h3>

            <div className="flex gap-2" style={{ marginBottom: 16 }}>
              <button
                className="btn btn-primary"
                onClick={() => suggestRubrics.mutate()}
                disabled={suggestRubrics.isPending}
              >
                {suggestRubrics.isPending ? "⏳ AI генерирует..." : "Сгенерировать рубрики"}
              </button>
            </div>

            {rubrics && rubrics.length > 0 ? (
              <div className="flex flex-col gap-2">
                {rubrics.map((r: any) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRubric(r)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                      background: selectedRubric?.id === r.id ? "var(--bg-hover)" : "transparent",
                      border: `1px solid ${selectedRubric?.id === r.id ? r.color : "var(--border)"}`,
                      borderRadius: 8, cursor: "pointer", textAlign: "left", width: "100%",
                      color: "var(--text)", transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { if (selectedRubric?.id !== r.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { if (selectedRubric?.id !== r.id) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: r.color, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                      {r.description && <div className="text-xs text-dim">{r.description}</div>}
                    </div>
                    {selectedRubric?.id === r.id && <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-dim" style={{ textAlign: "center", padding: 20 }}>
                {suggestRubrics.isPending
                  ? "⏳ AI генерирует рубрики..."
                  : "Рубрики пока не созданы. Нажмите «Сгенерировать рубрики» или создайте их на странице стратегии."}
              </div>
            )}
          </div>
        )}

        {/* Step 1: Topic */}
        {step === 1 && (
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              Выберите тему{selectedRubric ? ` — ${selectedRubric.name}` : ""}
            </h3>
            <p className="text-xs text-dim" style={{ marginBottom: 16 }}>
              Выберите из существующих, сгенерируйте AI или напишите вручную
            </p>

            <div className="flex gap-2" style={{ marginBottom: 16 }}>
              <button
                className="btn btn-primary"
                onClick={() => suggestTopics.mutate()}
                disabled={suggestTopics.isPending}
              >
                {suggestTopics.isPending ? "⏳ AI генерирует..." : "Предложить темы"}
              </button>
            </div>

            {/* Topics from AI or existing */}
            {suggestTopics.isPending && (
              <div className="text-sm text-dim" style={{ textAlign: "center", padding: 20 }}>
                ⏳ AI генерирует темы...
              </div>
            )}
            {topics && !suggestTopics.isPending && topics.filter((t: any) => !selectedRubric || t.rubricId === selectedRubric.id).length > 0 && (
              <div className="flex flex-col gap-2" style={{ marginBottom: 16 }}>
                {topics.filter((t: any) => !selectedRubric || t.rubricId === selectedRubric.id).map((t: any) => (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedTopic(t); setManualTopicTitle(""); setManualTopicDesc(""); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                      background: selectedTopic?.id === t.id ? "var(--bg-hover)" : "transparent",
                      border: `1px solid ${selectedTopic?.id === t.id ? "var(--accent)" : "var(--border)"}`,
                      borderRadius: 8, cursor: "pointer", textAlign: "left", width: "100%",
                      color: "var(--text)",
                    }}
                    onMouseEnter={(e) => { if (selectedTopic?.id !== t.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { if (selectedTopic?.id !== t.id) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{t.title}</div>
                      {t.description && <div className="text-xs text-dim">{t.description}</div>}
                    </div>
                    {selectedTopic?.id === t.id && <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>}
                  </button>
                ))}
              </div>
            )}

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 16 }}>
              <p className="text-xs text-dim" style={{ marginBottom: 8 }}>Или напишите свою тему:</p>
              <input
                className="input"
                placeholder="Название темы"
                value={manualTopicTitle}
                onChange={(e) => { setManualTopicTitle(e.target.value); setSelectedTopic(null); }}
                style={{ marginBottom: 8 }}
              />
              <textarea
                className="input"
                rows={2}
                placeholder="Описание (необязательно)"
                value={manualTopicDesc}
                onChange={(e) => setManualTopicDesc(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Step 2: Content type */}
        {step === 2 && (
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Выберите тип поста</h3>
            {contentTypes && contentTypes.length > 0 ? (
              <div className="flex flex-col gap-2">
                {contentTypes.map((ct: any) => (
                  <button
                    key={ct.id}
                    onClick={() => setSelectedContentType(ct)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                      background: selectedContentType?.id === ct.id ? "var(--bg-hover)" : "transparent",
                      border: `1px solid ${selectedContentType?.id === ct.id ? "var(--accent)" : "var(--border)"}`,
                      borderRadius: 8, cursor: "pointer", textAlign: "left", width: "100%",
                      color: "var(--text)",
                    }}
                    onMouseEnter={(e) => { if (selectedContentType?.id !== ct.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { if (selectedContentType?.id !== ct.id) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{ct.name}</div>
                      <div className="text-xs text-dim">{ct.code}{ct.platform ? ` — ${ct.platform}` : ""}</div>
                    </div>
                    {selectedContentType?.id === ct.id && <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-dim">Типы контента не загружены</div>
            )}
          </div>
        )}

        {/* Step 3: Date & Create */}
        {step === 3 && (
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Дата публикации</h3>

            <div style={{ marginBottom: 24 }}>
              <label className="text-xs text-dim" style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                Выберите дату
              </label>
              <input
                type="date"
                className="input"
                style={{ maxWidth: 240 }}
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>

            <div className="card" style={{ background: "var(--bg-hover)", padding: 16, marginBottom: 24 }}>
              <p className="text-xs text-dim" style={{ marginBottom: 12, fontWeight: 600 }}>Предпросмотр</p>
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                <div><strong>Тема:</strong> {selectedTopic?.title || manualTopicTitle || "—"}</div>
                {selectedRubric && <div><strong>Рубрика:</strong> {selectedRubric.name}</div>}
                {selectedContentType && <div><strong>Тип:</strong> {selectedContentType.name}</div>}
                <div><strong>Дата:</strong> {scheduledDate}</div>
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ fontSize: 15, padding: "10px 32px", width: "100%" }}
              onClick={() => createPost.mutate()}
              disabled={createPost.isPending || !scheduledDate}
            >
              {createPost.isPending ? "⏳ Создание..." : "Создать пост и перейти к редактированию"}
            </button>
          </div>
        )}

      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between" style={{ marginTop: 16 }}>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost" onClick={prevStep} disabled={step === 0}>
            ← Назад
          </button>
          <button className="btn btn-ghost" onClick={() => setShowChat(!showChat)}>
            {showChat ? "✕ Закрыть чат" : "💬 Открыть чат с AI"}
          </button>
        </div>
        <div className="text-xs text-dim">
          Шаг {step + 1} из {STEPS.length}
        </div>
        {step < STEPS.length - 1 ? (
          <button className="btn btn-primary" onClick={nextStep} disabled={!canProceed()}>
            Далее →
          </button>
        ) : null}
      </div>

      {showChat && (
        <ChatPanel
          projectId={projectId}
          forceOpen={true}
          onClose={() => setShowChat(false)}
          pageContext={`Свободный контент, шаг «${STEPS[step].label}»`}
        />
      )}
    </div>
  );
}
