import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useParams, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect, useCallback } from "react";
import CarouselTab from "../components/content-tabs/CarouselTab";
import PostTab, { type ContentTabHandle } from "../components/content-tabs/PostTab";
import ReelTab from "../components/content-tabs/ReelTab";
import StoriesTab from "../components/content-tabs/StoriesTab";
import PublicationTab from "../components/PublicationTab";
import ComplianceBadge from "../components/ComplianceBadge";
import { BarChart3, RefreshCw, Pencil } from "lucide-react";

function safeJsonParse(val: string) {
  try { return JSON.parse(val); } catch { return null; }
}

const SUPPORTED_OWN_METRICS: Record<string, string[]> = {
  instagram: ["engagement_rate", "likes", "comments", "reach", "impressions", "saves"],
  vk: ["engagement_rate", "reach", "likes", "comments", "shares"],
  telegram: ["engagement_rate", "impressions"],
  youtube: ["engagement_rate", "likes", "comments"],
  zen: [],
};

type Step = "meta" | "content" | "drafts" | "review" | "publication";

const GEN_PROMPTS: Record<string, (post: any) => string> = {
  goal: (p) => `Придумай цель для поста в соцсетях.
Название: ${p.title}
Рубрика: ${p.rubricName || "без рубрики"}
Тип контента: ${p.contentTypeName || "пост"}
Тон: естественный, без агрессивной мотивации

Ответ — одной строкой, конкретная цель (что хотим получить от поста).`,

  hook: (p) => `Придумай хук (цепляющую первую фразу) для поста в соцсетях.
Название: ${p.title}
Рубрика: ${p.rubricName || "без рубрики"}
Тип контента: ${p.contentTypeName || "пост"}
Цель: ${p.goal || "не указана"}
Тон: естественный, без агрессивной мотивации

Ответ — одной строкой, без кавычек.`,

  keyMessage: (p) => `Сформулируй ключевое сообщение для поста в соцсетях.
Название: ${p.title}
Рубрика: ${p.rubricName || "без рубрики"}
Тип контента: ${p.contentTypeName || "пост"}
Цель: ${p.goal || "не указана"}
Хук: ${p.hook || "не указан"}
Тон: естественный, без агрессивной мотивации

Ответ — одной строкой, главная мысль, которую должен вынести читатель.`,

  cta: (p) => `Придумай CTA (призыв к действию) для поста в соцсетях.
Название: ${p.title}
Рубрика: ${p.rubricName || "без рубрики"}
Тип контента: ${p.contentTypeName || "пост"}
Ключевое сообщение: ${p.keyMessage || "не указано"}
Тон: мягкий, без давления

Ответ — одной строкой, призыв к действию.`,
};

const statusLabels: Record<string, string> = {
  idea: "Идея", planned: "Запланирован", draft: "Черновик",
  generated: "Сгенерирован", editing: "Редактируется", ready: "Готов",
  scheduled: "В очереди", published: "Опубликован", archived: "Архив",
};

const statusColors: Record<string, string> = {
  idea: "tag-idea", planned: "tag-planned", draft: "tag-draft",
  generated: "tag-generated", editing: "tag-editing", ready: "tag-ready",
  scheduled: "tag-scheduled", published: "tag-published", archived: "tag-archived",
};

const statuses = ["idea", "planned", "draft", "generated", "editing", "ready", "scheduled", "published", "archived"];

function DraftsSection({ id, drafts, queryClient, post, updatePost }: {
  id: string; drafts: any[] | undefined; queryClient: any; post: any; updatePost: any;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [generatingTags, setGeneratingTags] = useState(false);

  const updateDraft = useMutation({
    mutationFn: ({ draftId, content }: { draftId: string; content: string }) =>
      api.drafts.update(draftId, { contentMarkdown: content }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["drafts", id] }); setEditId(null); },
  });

  const deleteDraft = useMutation({
    mutationFn: (draftId: string) => api.drafts.delete(draftId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["drafts", id] }),
  });

  const generateTags = async () => {
    setGeneratingTags(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: "hashtags",
          variables: {
            title: post.title || "",
            goal: post.goal || "",
            hook: post.hook || "",
            keyMessage: post.keyMessage || "",
            cta: post.cta || "",
            rubric: post.rubricName || "",
            contentType: post.contentTypeName || "пост",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const tags = data.content.trim();
      setEditContent((prev) => prev + (prev ? "\n\n" : "") + tags);
    } finally {
      setGeneratingTags(false);
    }
  };

  const isCarousel = post?.contentTypeCode === "carousel";
  const activeId = post?.versionCurrentId;

  const autoStages = new Set(["carousel", "caption"]);
  const autoDrafts = isCarousel && drafts ? drafts.filter((d: any) => autoStages.has(d.stage)) : [];
  const manualDrafts = isCarousel && drafts ? drafts.filter((d: any) => !autoStages.has(d.stage)) : (drafts || []);

  function slideCount(d: any): number {
    try {
      const src = d.contentJson || d.contentMarkdown;
      if (!src) return 0;
      const p = typeof src === "string" ? JSON.parse(src) : src;
      return p?.slides?.length || 0;
    } catch { return 0; }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Черновики</span>
        {!isCarousel && (
          <button className="btn btn-primary" onClick={() =>
            api.drafts.create({ postItemId: id, stage: "caption", contentMarkdown: "" })
              .then(() => queryClient.invalidateQueries({ queryKey: ["drafts", id] }))
          }>
            + Черновик
          </button>
        )}
      </div>

      {(!drafts || drafts.length === 0) ? (
        <div className="text-dim text-sm">Пока нет черновиков</div>
      ) : (
        <div className="flex flex-col gap-4">
          {isCarousel && autoDrafts.length > 0 && (
            <>
              <p className="text-xs text-dim" style={{ margin: 0 }}>
                Слайды и подпись сохраняются автоматически. Оба активны и передаются в Публикацию.
              </p>
              {autoDrafts.map((d: any) => {
                const isCaption = d.stage === "caption";
                const slides = slideCount(d);
                const label = isCaption ? "Подпись" : "Слайды карусели";
                const info = isCaption
                  ? `${d.contentMarkdown?.length || 0} знаков`
                  : `${slides} слайдов`;
                return (
                  <div key={d.id} style={{
                    padding: 14, background: "var(--bg-hover)", borderRadius: 8,
                    border: "2px solid var(--accent)",
                  }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="tag" style={{ background: "var(--accent)", color: "#fff" }}>{label}</span>
                        <span className="text-xs" style={{ color: "var(--accent)", fontWeight: 600 }}>✓ Активно</span>
                        <span className="text-xs text-dim">{info}</span>
                        {d.riskScore != null && (
                          <span className="tag" style={{
                            background: d.riskScore > 0.6 ? "var(--red)" : d.riskScore > 0.3 ? "var(--orange, #e68a2e)" : "var(--green, #2e7d32)",
                            color: "#fff", fontSize: 10
                          }}>
                            {d.riskScore > 0.6 ? "⚠ Высокий риск" : d.riskScore > 0.3 ? "⚡ Средний риск" : "✓ Низкий риск"}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 8px", color: "var(--red)" }}
                          onClick={() => { if (confirm("Удалить черновик?")) deleteDraft.mutate(d.id); }}>
                          🗑
                        </button>
                      </div>
                    </div>
                    {isCaption && (
                      <div
                        style={{ fontSize: 13, whiteSpace: "pre-wrap", cursor: "pointer", marginTop: 8 }}
                        onClick={() => { setEditId(d.id); setEditContent(d.contentMarkdown || ""); }}
                      >
                        {d.contentMarkdown ? (
                          d.contentMarkdown.length > 200
                            ? d.contentMarkdown.slice(0, 200) + "..."
                            : d.contentMarkdown
                        ) : (
                          <span className="text-dim">Пустой черновик — нажмите чтобы редактировать</span>
                        )}
                      </div>
                    )}
                    {(() => {
                      const facts = typeof d.usedBrandFacts === 'string' ? safeJsonParse(d.usedBrandFacts) : d.usedBrandFacts;
                      return Array.isArray(facts) && facts.length > 0 ? (
                        <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-dim)" }}>
                          <span style={{ fontWeight: 600 }}>🧠 Факты бренда:</span>{' '}
                          {facts.join(", ")}
                        </div>
                      ) : null;
                    })()}
                    {d.explanation && !isCaption && (
                      <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-dim)", fontStyle: "italic" }}>
                        {d.explanation}
                      </div>
                    )}
                  </div>
                );
              })}
              {manualDrafts.length > 0 && (
                <>
                  <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                  <p className="text-xs text-dim" style={{ margin: 0 }}>Другие черновики</p>
                </>
              )}
            </>
          )}

          {manualDrafts.map((d: any) => {
            const isActive = d.id === activeId;
            return (
            <div key={d.id} style={{
              padding: 14, background: "var(--bg-hover)", borderRadius: 8,
              border: isActive ? "2px solid var(--accent)" : "2px solid transparent",
            }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="tag" style={{ background: isActive ? "var(--accent)" : undefined, color: isActive ? "#fff" : undefined }}>{d.stage}</span>
                  {isActive && <span className="text-xs" style={{ color: "var(--accent)", fontWeight: 600 }}>✓ Основной</span>}
                  {d.riskScore != null && (
                    <span className="tag" style={{
                      background: d.riskScore > 0.6 ? "var(--red)" : d.riskScore > 0.3 ? "var(--orange, #e68a2e)" : "var(--green, #2e7d32)",
                      color: "#fff", fontSize: 10
                    }}>
                      {d.riskScore > 0.6 ? "⚠ Высокий риск" : d.riskScore > 0.3 ? "⚡ Средний риск" : "✓ Низкий риск"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {d.modelName && <span className="text-xs text-dim">{d.modelName}</span>}
                  {!isActive && (
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }}
                      onClick={() => updatePost.mutate({ versionCurrentId: d.id })}>
                      Сделать основным
                    </button>
                  )}
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 8px", color: "var(--red)" }}
                    onClick={() => { if (confirm("Удалить черновик?")) deleteDraft.mutate(d.id); }}>
                    🗑
                  </button>
                </div>
              </div>
              {editId === d.id ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    className="input"
                    rows={6}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                  />
                  <div className="text-xs text-dim">
                    Markdown: **жирный**, *курсив*, #теги
                  </div>
                  <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                    <button className="btn btn-primary" style={{ fontSize: 12 }}
                      onClick={() => updateDraft.mutate({ draftId: d.id, content: editContent })}>
                      💾 Сохранить
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 12 }}
                      disabled={generatingTags}
                      onClick={generateTags}>
                      {generatingTags ? "⏳" : ""} Тэги
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 12 }}
                      onClick={() => setEditId(null)}>
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{ fontSize: 13, whiteSpace: "pre-wrap", cursor: "pointer" }}
                  onClick={() => { setEditId(d.id); setEditContent(d.contentMarkdown || ""); }}
                >
                  {d.contentMarkdown || <span className="text-dim">Пустой черновик — нажмите чтобы редактировать</span>}
                </div>
              )}
              {(() => {
                const facts = typeof d.usedBrandFacts === 'string' ? safeJsonParse(d.usedBrandFacts) : d.usedBrandFacts;
                return Array.isArray(facts) && facts.length > 0 ? (
                  <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-dim)" }}>
                    <span style={{ fontWeight: 600 }}>🧠 Факты бренда:</span>{' '}
                    {facts.join(", ")}
                  </div>
                ) : null;
              })()}
              {d.explanation && (
                <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-dim)", fontStyle: "italic" }}>
                  {d.explanation}
                </div>
              )}
            </div>
          );
          })}
        </div>
      )}
    </div>
  );
}

const REVIEW_LABELS: Record<string, string> = {
  none: "Не начато",
  internal_review: "Внутреннее согласование",
  client_review: "Согласование с клиентом",
  approved: "Утверждено",
};

const REVIEW_COLORS: Record<string, string> = {
  none: "var(--dim)",
  internal_review: "var(--orange, #e68a2e)",
  client_review: "var(--accent)",
  approved: "var(--green)",
};

const RISK_LABELS: Record<string, string> = {
  "high": "Высокий",
  "medium": "Средний",
  "low": "Низкий",
};

function PostTypeSelector({ post, updatePost }: { post: any; updatePost: any }) {
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<any>(null);

  const types = [
    { value: "advertising", label: "Реклама", desc: "Прямая реклама, применяются все правила 38-ФЗ" },
    { value: "sponsored", label: "Спонсорская интеграция", desc: "Платное размещение, те же требования" },
    { value: "personal", label: "Личный блог", desc: "Не реклама, правила не применяются" },
    { value: "educational", label: "Образование", desc: "Базовые правила" },
    { value: "informational", label: "Новости / Инфо", desc: "Базовые правила" },
    { value: "other", label: "Другое", desc: "Не реклама" },
  ];

  const handleSuggest = async () => {
    setSuggesting(true);
    try {
      const textToCheck = [post.title, post.hook, post.keyMessage].filter(Boolean).join("\n");
      if (!textToCheck) return;
      const res = await api.compliance.suggestPostType(textToCheck, post.title);
      setSuggestion(res);
    } finally {
      setSuggesting(false);
    }
  };

  const applySuggestion = () => {
    if (suggestion?.postType) {
      updatePost.mutate({ postType: suggestion.postType });
      setSuggestion(null);
    }
  };

  return (
    <div>
      <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Тип поста</label>
      <div className="flex gap-2">
        <select
          className="input"
          value={post.postType || ""}
          onChange={(e) => updatePost.mutate({ postType: e.target.value || null })}
          style={{ flex: 1 }}
        >
          <option value="">Не выбран</option>
          {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button className="btn btn-ghost" style={{ fontSize: 12, flexShrink: 0 }} onClick={handleSuggest} disabled={suggesting}>
          {suggesting ? "..." : "✨ AI"}
        </button>
      </div>
      {post.postType && (
        <div className="text-xs text-dim" style={{ marginTop: 2 }}>
          {types.find(t => t.value === post.postType)?.desc}
        </div>
      )}
      {suggestion && (
        <div style={{ marginTop: 6, padding: "6px 10px", background: "var(--bg-hover)", borderRadius: 8, fontSize: 12 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
            <span>AI: <strong>{types.find(t => t.value === suggestion.postType)?.label || suggestion.postType}</strong></span>
          </div>
          <div className="text-xs text-dim" style={{ marginBottom: 4 }}>{suggestion.reason}</div>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={applySuggestion}>
            Применить
          </button>
        </div>
      )}
    </div>
  );
}

function AgeRatingSelector({ post, updatePost }: { post: any; updatePost: any }) {
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<any>(null);

  const ratings = ["0+", "6+", "12+", "16+", "18+"];

  const handleSuggest = async () => {
    if (!post.versionCurrentId) return;
    setSuggesting(true);
    try {
      const drafts = await api.drafts.listByPost(post.id);
      const activeDraft = drafts?.find((d: any) => d.id === post.versionCurrentId) || drafts?.[0];
      if (activeDraft?.contentMarkdown) {
        const res = await api.compliance.suggestAgeRating(activeDraft.contentMarkdown);
        setSuggestion(res);
      }
    } finally {
      setSuggesting(false);
    }
  };

  const applySuggestion = () => {
    if (suggestion?.ageRating) {
      updatePost.mutate({ ageRating: suggestion.ageRating });
      setSuggestion(null);
    }
  };

  return (
    <div>
      <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Возрастная категория</label>
      <div className="flex gap-2">
        <select
          className="input"
          value={post.ageRating || ""}
          onChange={(e) => updatePost.mutate({ ageRating: e.target.value || null })}
          style={{ flex: 1 }}
        >
          <option value="">Не выбрана</option>
          {ratings.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button className="btn btn-ghost" style={{ fontSize: 12, flexShrink: 0 }} onClick={handleSuggest} disabled={suggesting}>
          {suggesting ? "..." : "✨ AI"}
        </button>
      </div>
      {suggestion && (
        <div style={{ marginTop: 6, padding: "6px 10px", background: "var(--bg-hover)", borderRadius: 8, fontSize: 12 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
            <span>AI: <strong>{suggestion.ageRating}</strong></span>
          </div>
          <div className="text-xs text-dim" style={{ marginBottom: 4 }}>{suggestion.reason}</div>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={applySuggestion}>
            Применить
          </button>
        </div>
      )}
    </div>
  );
}

function ComplianceBlock({ postId, draftId, post }: { postId: string; draftId: string | null; post: any }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runCheck = useCallback(async () => {
    if (!draftId && !postId) return;
    setChecking(true);
    try {
      const res = await api.compliance.checkPost(postId, draftId || undefined);
      setResult(res);
    } finally {
      setChecking(false);
    }
  }, [postId, draftId]);

  useEffect(() => { if (postId) runCheck(); }, [postId, runCheck]);

  if (!postId) return null;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Риски публикации</span>
        <div className="flex items-center gap-2">
          {post?.postType && (
            <span className="tag" style={{ fontSize: 10, background: "var(--bg-hover)", color: "var(--fg)" }}>
              {post.postType === "advertising" ? "Реклама" :
               post.postType === "sponsored" ? "Спонсорское" :
               post.postType === "personal" ? "Личное" :
               post.postType === "educational" ? "Обучение" :
               post.postType === "informational" ? "Инфо" : post.postType}
            </span>
          )}
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={runCheck} disabled={checking}>
            {checking ? "Проверка..." : "🔄 Проверить заново"}
          </button>
        </div>
      </div>
      {result ? (
        <div className="flex flex-col gap-3">
          <ComplianceBadge
            riskScore={result.riskScore}
            riskLevel={result.riskLevel}
            violations={result.violations}
          />
          {result.riskScore > 0 && (
            <div style={{ marginTop: 8 }}>
              <span className="text-xs text-dim">
                💡 Отредактируйте текст на вкладке «Черновики» и вернитесь для повторной проверки
              </span>
            </div>
          )}
        </div>
      ) : checking ? (
        <div className="text-dim text-sm">Проверка...</div>
      ) : (
        <div className="text-dim text-sm">Нажмите «Проверить», чтобы просканировать пост на риски</div>
      )}
    </div>
  );
}

function ReviewStep({ id, post, queryClient, lockAndNext }: {
  id: string; post: any; queryClient: any; lockAndNext: () => void;
}) {
  const [actorName, setActorName] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  const { data: events, refetch: refetchEvents } = useQuery({
    queryKey: ["review-events", id],
    queryFn: () => api.reviewEvents.listByPost(id),
    enabled: !!id,
  });

  const { data: drafts } = useQuery({
    queryKey: ["drafts", id],
    queryFn: () => api.drafts.listByPost(id),
    enabled: !!id,
  });

  const activeDraftId = post?.versionCurrentId || (drafts && drafts.length > 0 ? drafts[0]?.id : null);

  const changeStatus = async (newStatus: string) => {
    setSavingStatus(true);
    try {
      await api.reviewEvents.reviewStatus(id, newStatus, actorName || undefined);
      queryClient.invalidateQueries({ queryKey: ["post", id] });
      await refetchEvents();
    } finally {
      setSavingStatus(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="card">
        <div className="card-header">
          <span className="card-title">Согласование</span>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Статус согласования</label>
            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              {Object.entries(REVIEW_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  className="btn btn-sm"
                  disabled={savingStatus}
                  onClick={() => changeStatus(key)}
                  style={{
                    background: post.reviewStatus === key ? REVIEW_COLORS[key] : undefined,
                    color: post.reviewStatus === key ? "#fff" : undefined,
                    borderColor: REVIEW_COLORS[key],
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Кто согласует</label>
            <input
              className="input"
              placeholder="Имя или роль"
              value={actorName}
              onChange={(e) => setActorName(e.target.value)}
              style={{ maxWidth: 300 }}
            />
          </div>
        </div>
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={lockAndNext}>
            Зафиксировать и далее →
          </button>
        </div>
      </div>

      <ComplianceBlock postId={id} draftId={activeDraftId} post={post} />

      <div className="card">
        <div className="card-header">
          <span className="card-title">История изменений</span>
          <span className="text-xs text-dim">{events?.length || 0} событий</span>
        </div>
        {(events && events.length > 0) ? (
          <div className="flex flex-col gap-3">
            {events.map((e: any) => {
              const isStatusChange = e.eventType === "status_change";
              const isFieldChange = e.eventType === "field_change";
              let desc = "";
              if (isStatusChange && e.payload) {
                const from = e.payload.from ? (REVIEW_LABELS[e.payload.from] || e.payload.from) : "—";
                const to = REVIEW_LABELS[e.payload.to] || e.payload.to;
                desc = `Статус изменён: ${from} → ${to}`;
              } else if (isFieldChange && e.payload) {
                desc = `Поле «${e.payload.field}» изменено`;
              } else {
                desc = e.eventType;
              }
              return (
                <div key={e.id} className="flex items-start gap-3 text-sm" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", marginTop: 5, flexShrink: 0,
                    background: isStatusChange ? "var(--accent)" : "var(--dim)",
                  }} />
                  <div style={{ flex: 1 }}>
                    <div>{desc}</div>
                    <div className="text-xs text-dim" style={{ marginTop: 2 }}>
                      {new Date(e.createdAt).toLocaleString("ru-RU")}
                      {e.actorName && ` · ${e.actorName}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-dim text-sm">История пока пуста</div>
        )}
      </div>
    </div>
  );
}

export default function PostCardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState<Step>("meta");
  const [locked, setLocked] = useState<Set<Step>>(new Set());
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const { data: post, isLoading } = useQuery({
    queryKey: ["post", id],
    queryFn: () => api.posts.get(id!),
    enabled: !!id,
  });

  const { data: drafts } = useQuery({
    queryKey: ["drafts", id],
    queryFn: () => api.drafts.listByPost(id!),
    enabled: !!id,
  });

  const { data: assets } = useQuery({
    queryKey: ["assets", id],
    queryFn: () => api.assets.listByPost(id!),
    enabled: !!id,
  });

  const { data: pipeline } = useQuery({
    queryKey: ["pipeline", id],
    queryFn: () => api.pipeline.listByPost(id!),
    enabled: !!id,
  });

  const { data: postAnalytics, refetch: refetchPostAnalytics } = useQuery({
    queryKey: ["postAnalytics", id],
    queryFn: () => api.analytics.getPostAnalytics(id!),
    enabled: !!id,
  });

  const recomputePostAnalytics = useMutation({
    mutationFn: () => api.analytics.recomputePost(id!),
    onSuccess: () => refetchPostAnalytics(),
  });

  const [showManualMetrics, setShowManualMetrics] = useState(false);
  const [manualMetrics, setManualMetrics] = useState({ likes: "", comments: "", reach: "", impressions: "", saves: "" });
  const submitManualMetrics = useMutation({
    mutationFn: (data: Record<string, string>) => {
      const body: Record<string, number | null> = {};
      for (const [k, v] of Object.entries(data)) {
        body[k] = v ? Number(v) : null;
      }
      return fetch(`/api/analytics/post/${id}/manual-metrics`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).then(r => r.json());
    },
    onSuccess: () => { refetchPostAnalytics(); setShowManualMetrics(false); },
  });

  const [suggestData, setSuggestData] = useState<any>(null);
  const suggestMutation = useMutation({
    mutationFn: () => api.analytics.postSuggest(id!),
    onSuccess: (data) => setSuggestData(data),
  });

  const updatePost = useMutation({
    mutationFn: (data: any) => api.posts.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post", id] });
      queryClient.invalidateQueries({ queryKey: ["drafts", id] });
    },
  });

  const deletePost = useMutation({
    mutationFn: () => api.posts.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      navigate("/calendar");
    },
    onError: () => alert("Не удалось удалить пост. Возможно, есть связанные данные."),
  });

const contentTabRef = useRef<ContentTabHandle>(null);
  const [lastSavedStep, setLastSavedStep] = useState<Step | null>(null);
  const [generatingField, setGeneratingField] = useState<string | null>(null);
  const prevStepRef = useRef<Step | null>(null);

  useEffect(() => {
    if (currentStep === "content" && !contentTabRef.current?.isDirty?.()) {
      setLastSavedStep("content");
    }
  }, [currentStep]);

  const generateField = async (field: string) => {
    if (!id) return;
    setGeneratingField(field);
    try {
      const prompt = GEN_PROMPTS[field]?.(post);
      if (!prompt) return;
      const res = await fetch("/api/generate/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, systemPrompt: "Ты — копирайтер. Отвечай коротко, без пояснений, без кавычек." }),
      });
      const data = await res.json();
      if (data.content) updatePost.mutate({ [field]: data.content.trim() });
    } finally {
      setGeneratingField(null);
    }
  };

  const saveCurrentStep = async () => {
    setSaveStatus("saving");
    try {
      if (prevStepRef.current === "content" && contentTabRef.current) {
        await contentTabRef.current.saveDraft();
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["post", id] }),
        queryClient.invalidateQueries({ queryKey: ["drafts", id] }),
        queryClient.invalidateQueries({ queryKey: ["assets", id] }),
      ]);
      setSaveStatus("saved");
      setLastSavedStep(currentStep);
    } catch {
      setSaveStatus("error");
    }
  };

  // Auto-save when leaving the content step
  useEffect(() => {
    if (prevStepRef.current === "content" && currentStep !== "content") {
      saveCurrentStep();
    }
    prevStepRef.current = currentStep;
  }, [currentStep]);

  const lockAndNext = async () => {
    try {
      if (currentStep === "content" && contentTabRef.current) {
        const savedDraftId = await contentTabRef.current.saveDraft();
        if (savedDraftId && (post.contentTypeCode === "carousel" || post.contentTypeCode === "post")) {
          updatePost.mutate({ versionCurrentId: savedDraftId });
        }
      }
      const steps: Step[] = ["meta", "content", "drafts", "review", "publication"];
      const idx = steps.indexOf(currentStep);
      if (idx < steps.length - 1) {
        setLocked((prev) => new Set(prev).add(currentStep));
        setCurrentStep(steps[idx + 1]);
      }
      if (post) {
        const statusOrder = ["idea", "planned", "draft", "generated", "editing", "ready", "scheduled", "published", "archived"];
        const stepTarget: Record<Step, string> = {
          meta: "draft",
          content: "generated",
          drafts: "editing",
          review: "ready",
          publication: "ready",
        };
        const currentStatusIdx = statusOrder.indexOf(post.status);
        const targetStatusIdx = statusOrder.indexOf(stepTarget[currentStep]);
        if (currentStatusIdx >= 0 && currentStatusIdx < targetStatusIdx) {
          updatePost.mutate({ status: stepTarget[currentStep] });
        }
      }
    } catch {}
  };

  const isStepDone = (key: Step) => {
    if (locked.has(key)) return true;
    if (!post) return false;
    if (key === "meta") return !!(post.goal || post.hook || post.keyMessage || post.cta);
    if (key === "content") return drafts && drafts.length > 0;
    if (key === "drafts") return true;
    if (key === "review") return post.reviewStatus === "approved";
    if (key === "publication") return !!(post.scheduledDate || post.status === "published" || post.status === "scheduled" || post.status === "ready");
    return false;
  };

  const canAccess = (key: Step) => {
    const steps: Step[] = ["meta", "content", "drafts", "publication"];
    const currentIdx = steps.indexOf(currentStep);
    const targetIdx = steps.indexOf(key);
    if (targetIdx <= currentIdx) return true;
    for (let i = currentIdx; i < targetIdx; i++) {
      if (!locked.has(steps[i]) && !isStepDone(steps[i])) return false;
    }
    return true;
  };

  const steps: { key: Step; label: string }[] = [
    { key: "meta", label: "Метаданные" },
    { key: "content", label: "Контент" },
    { key: "drafts", label: "Черновики" },
    { key: "review", label: "Согласование" },
    { key: "publication", label: "Публикация" },
  ];

  if (isLoading) return <div className="text-dim">Загрузка...</div>;
  if (!post) return <div className="text-dim">Пост не найден</div>;

  const contentTypeCode = post.contentTypeCode || "post";
  const stepIdx = steps.findIndex((s) => s.key === currentStep);

  return (
    <div style={{ overflowX: "hidden", maxWidth: "100%" }}>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>← Назад</button>
            <h2>{post.title}</h2>
            <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
              <span className={`tag ${statusColors[post.status]}`}>
                {statusLabels[post.status]}
              </span>
              {post.rubricName && (
                <span className="flex items-center gap-1 text-sm">
                  <span className="rubric-dot" style={{ background: post.rubricColor }} />
                  {post.rubricName}
                </span>
              )}
              {post.contentTypeName && <span className="text-dim text-sm">{post.contentTypeName}</span>}
            </div>
          </div>
          <button className="btn btn-danger" onClick={() => { if (confirm("Удалить пост?")) deletePost.mutate(); }}>Удалить</button>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex gap-0" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 8, marginBottom: 16 }}>
        {steps.map((s, i) => {
          const done = isStepDone(s.key);
          const active = currentStep === s.key;
          const accessible = canAccess(s.key);
          return (
            <div
              key={s.key}
              onClick={() => accessible && setCurrentStep(s.key)}
              style={{
                flex: 1, textAlign: "center", padding: "8px 12px", fontSize: 13,
                fontWeight: active ? 700 : done ? 500 : 400,
                color: active ? "var(--accent)" : done ? "var(--fg)" : "var(--dim)",
                borderBottom: active ? "2px solid var(--accent)" : done ? "2px solid var(--border)" : "2px solid transparent",
                cursor: accessible ? "pointer" : "default",
                opacity: accessible && !active ? 0.8 : 1,
                transition: "all 0.15s",
              }}
            >
              {done && !active && "✓ "}{s.label}
            </div>
          );
        })}
      </div>

      {/* Save status indicator */}
      {(() => {
        const onContent = currentStep === "content";
        const isDirty = onContent && contentTabRef.current?.isDirty?.();
        const wasSaved = lastSavedStep === currentStep;
        if (onContent && !isDirty && !wasSaved) {
          setTimeout(() => setLastSavedStep(currentStep), 0);
        }
        const showSaved = !isDirty && (onContent ? lastSavedStep === currentStep : true);
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            {showSaved ? (
              <span className="text-xs" style={{ color: "var(--green)" }}>Сохранено</span>
            ) : (
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 12px" }} onClick={saveCurrentStep}>
                    {saveStatus === "saving" ? "⏳ Сохранение..." : saveStatus === "error" ? "❌ Ошибка" : "Сохранить"}
              </button>
            )}
          </div>
        );
      })()}

      {/* Post Insight Panel — always visible */}
      <div className="flex items-center gap-3" style={{ marginBottom: 12, padding: "10px 16px", background: "var(--bg-hover)", borderRadius: 8 }}>
        <BarChart3 size={16} style={{ color: "var(--accent)" }} />
        <span className="text-sm" style={{ fontWeight: 600 }}>Метрики поста</span>
        {(() => {
          const platformType = postAnalytics?.platformType;
          const allowedMetrics = platformType ? SUPPORTED_OWN_METRICS[platformType] : null;
          const showMetric = (name: string) => !allowedMetrics || allowedMetrics.includes(name);

          if (!postAnalytics) {
            return <span className="text-sm text-dim" style={{ flex: 1 }}>Нет данных. Нажмите "Обновить", чтобы рассчитать.</span>;
          }

          return (
            <div className="flex gap-4 text-sm" style={{ flex: 1, flexWrap: "wrap" }}>
              {showMetric("engagement_rate") && postAnalytics.engagementRate != null && (
                <span>
                  ER: <strong>{(postAnalytics.engagementRate * 100).toFixed(1)}%</strong>
                  <span className="tag" style={{
                    marginLeft: 4, fontSize: 10,
                    background: postAnalytics.classification === "hit" ? "var(--green)" : postAnalytics.classification === "underperforming" ? "var(--red)" : "var(--accent)",
                    color: "#fff",
                  }}>
                    {postAnalytics.classification === "hit" ? "↑ Выше" : postAnalytics.classification === "underperforming" ? "↓ Ниже" : "→ Средний"}
                  </span>
                </span>
              )}
              {showMetric("reach") && postAnalytics.reach != null && <span>Охват: <strong>{postAnalytics.reach.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}</strong></span>}
              {showMetric("impressions") && postAnalytics.impressions != null && <span>Показы: <strong>{postAnalytics.impressions.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}</strong></span>}
              {showMetric("comments") && postAnalytics.comments != null && <span>Комм.: <strong>{postAnalytics.comments}</strong></span>}
              {showMetric("saves") && postAnalytics.saves != null && <span>Сохр.: <strong>{postAnalytics.saves}</strong></span>}
              {postAnalytics.rubricMedianEngagementRate != null && (
                <span className="text-xs text-dim">Медиана рубрики: {(postAnalytics.rubricMedianEngagementRate * 100).toFixed(1)}%</span>
              )}
              {postAnalytics.platformMedianEngagementRate != null && (
                <span className="text-xs text-dim">Медиана площадки: {(postAnalytics.platformMedianEngagementRate * 100).toFixed(1)}%</span>
              )}
            </div>
          );
        })()}
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px", flexShrink: 0 }}
          onClick={() => recomputePostAnalytics.mutate()} disabled={recomputePostAnalytics.isPending}>
          <RefreshCw size={14} /> {recomputePostAnalytics.isPending ? "..." : "Обновить"}
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px", flexShrink: 0 }}
          onClick={() => suggestMutation.mutate()} disabled={suggestMutation.isPending}>
          💡 {suggestMutation.isPending ? "..." : "Идеи"}
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px", flexShrink: 0 }}
          onClick={() => setShowManualMetrics(!showManualMetrics)}>
          <Pencil size={14} /> Ручной ввод
        </button>
      </div>

      {showManualMetrics && (() => {
        const platformType = postAnalytics?.platformType;
        const allowedMetrics = platformType ? SUPPORTED_OWN_METRICS[platformType] : ["likes","comments","reach","impressions","saves"];
        const manualFields = ["likes","comments","reach","impressions","saves"].filter(f => allowedMetrics.includes(f));

        return (
          <div className="card mb-4">
            <div className="card-header">
              <span className="card-title">Ручной ввод метрик</span>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowManualMetrics(false)}>Отмена</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(manualFields.length, 5)}, 1fr)`, gap: 12 }}>
              {manualFields.map(f => (
                <div key={f}>
                  <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>
                    {f === "likes" ? "Лайки" : f === "comments" ? "Комментарии" : f === "reach" ? "Охват" : f === "impressions" ? "Показы" : "Сохранения"}
                  </label>
                  <input className="input" type="number" min="0" placeholder="0"
                    value={manualMetrics[f as keyof typeof manualMetrics]}
                    onChange={(e) => setManualMetrics(prev => ({ ...prev, [f]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-primary" style={{ fontSize: 13 }}
                onClick={() => submitManualMetrics.mutate(manualMetrics)} disabled={submitManualMetrics.isPending}>
                {submitManualMetrics.isPending ? "..." : "Сохранить метрики"}
              </button>
            </div>
          </div>
        );
      })()}

      {suggestData && (
        <div className="card mb-6">
          <div className="card-header">
            <span className="card-title flex items-center gap-2">💡 Рекомендации по посту</span>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setSuggestData(null)}>Закрыть</button>
          </div>
          <div className="flex flex-col gap-3">
            {suggestData.suggestions.map((s: any, i: number) => (
              <div key={i} style={{ padding: "10px 14px", background: "var(--bg-hover)", borderRadius: 8 }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                  <span className="tag" style={{
                    background: s.type === "hook" ? "var(--cyan, #0891b2)" : s.type === "cta" ? "var(--accent)" : s.type === "format" ? "var(--green, #2e7d32)" : "var(--orange, #e68a2e)",
                    color: "#fff", fontSize: 10,
                  }}>{s.type || "content"}</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{s.title}</span>
                </div>
                <div className="text-sm text-dim">{s.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meta step */}
      {currentStep === "meta" && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Метаданные</span>
            <span className="text-xs text-dim">Нажмите ✨ для генерации поля на основе контекста</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Название</label>
                <input className="input" value={post.title} onChange={(e) => updatePost.mutate({ title: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Цель</label>
                <div className="flex gap-2">
                  <input className="input" value={post.goal || ""} onChange={(e) => updatePost.mutate({ goal: e.target.value })} style={{ flex: 1 }} />
                  <button className="btn btn-ghost" style={{ flexShrink: 0, fontSize: 16, padding: "4px 8px" }} onClick={() => generateField("goal")} disabled={generatingField === "goal"}>{generatingField === "goal" ? "..." : "✨"}</button>
                </div>
              </div>
              <div>
                <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Хук</label>
                <div className="flex gap-2" style={{ alignItems: "flex-start" }}>
                  <textarea className="input" rows={3} value={post.hook || ""} onChange={(e) => updatePost.mutate({ hook: e.target.value })} style={{ flex: 1 }} />
                  <button className="btn btn-ghost" style={{ flexShrink: 0, fontSize: 16, padding: "4px 8px" }} onClick={() => generateField("hook")} disabled={generatingField === "hook"}>{generatingField === "hook" ? "..." : "✨"}</button>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Ключевое сообщение</label>
                <div className="flex gap-2" style={{ alignItems: "flex-start" }}>
                  <textarea className="input" rows={3} value={post.keyMessage || ""} onChange={(e) => updatePost.mutate({ keyMessage: e.target.value })} style={{ flex: 1 }} />
                  <button className="btn btn-ghost" style={{ flexShrink: 0, fontSize: 16, padding: "4px 8px" }} onClick={() => generateField("keyMessage")} disabled={generatingField === "keyMessage"}>{generatingField === "keyMessage" ? "..." : "✨"}</button>
                </div>
              </div>
              <div>
                <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>CTA</label>
                <div className="flex gap-2">
                  <input className="input" value={post.cta || ""} onChange={(e) => updatePost.mutate({ cta: e.target.value })} style={{ flex: 1 }} />
                  <button className="btn btn-ghost" style={{ flexShrink: 0, fontSize: 16, padding: "4px 8px" }} onClick={() => generateField("cta")} disabled={generatingField === "cta"}>{generatingField === "cta" ? "..." : "✨"}</button>
                </div>
              </div>
            </div>
          </div>

          {/* Compliance metadata section */}
          <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <span className="text-sm" style={{ fontWeight: 600, marginBottom: 12, display: "block" }}>Compliance</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <PostTypeSelector post={post} updatePost={updatePost} />
              <AgeRatingSelector post={post} updatePost={updatePost} />
              <div className="flex items-center gap-3" style={{ paddingTop: 6 }}>
                <label className="switch" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={!!post.isAdvertisingMarked}
                    onChange={(e) => updatePost.mutate({ isAdvertisingMarked: e.target.checked ? 1 : 0 })}
                  />
                  <span className="slider round" />
                </label>
                <div>
                  <div className="text-sm">Маркировка «Реклама»</div>
                  <div className="text-xs text-dim">Пост содержит пометку «Реклама»</div>
                </div>
              </div>
              <div>
                <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Рекламодатель</label>
                <input className="input" value={post.advertiserInfo || ""} onChange={(e) => updatePost.mutate({ advertiserInfo: e.target.value })} placeholder="ООО Ромашка / ИНН 1234567890" />
              </div>
              <div>
                <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Токен ЕРИР (ОРД)</label>
                <input className="input" value={post.ordToken || ""} onChange={(e) => updatePost.mutate({ ordToken: e.target.value })} placeholder="erid:..." />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-primary" onClick={lockAndNext}>
              Зафиксировать и далее →
            </button>
          </div>
        </div>
      )}

      {/* Content tab — always mounted so state persists across steps */}
      <div style={{ display: currentStep === "content" ? "block" : "none" }}>
        <div className="card">
          {(contentTypeCode === "carousel") ? (
            <CarouselTab ref={contentTabRef} post={post} postId={id!} queryClient={queryClient} />
          ) : (contentTypeCode === "reel") ? (
            <ReelTab ref={contentTabRef} post={post} postId={id!} />
          ) : (contentTypeCode === "stories") ? (
            <StoriesTab ref={contentTabRef} post={post} postId={id!} />
          ) : (
            <PostTab ref={contentTabRef} post={post} postId={id!} queryClient={queryClient} />
          )}
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-primary" onClick={lockAndNext}>
              Зафиксировать и далее →
            </button>
          </div>
        </div>
      </div>

      {/* Drafts step */}
      {currentStep === "drafts" && (
        <div>
          <DraftsSection id={id!} drafts={drafts} queryClient={queryClient} post={post} updatePost={updatePost} />
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-primary" onClick={lockAndNext}>
              Зафиксировать и далее →
            </button>
          </div>
        </div>
      )}

      {/* Review step */}
      {currentStep === "review" && (
        <ReviewStep id={id!} post={post} queryClient={queryClient} lockAndNext={lockAndNext} />
      )}

      {/* Publication step */}
      {currentStep === "publication" && (
        <div>
          {(() => {
            const isAd = post.postType === "advertising" || post.postType === "sponsored";
            const missingMarking = isAd && !post.isAdvertisingMarked;
            const missingAdvertiser = isAd && !post.advertiserInfo;
            const hasIssues = missingMarking || missingAdvertiser;
            return hasIssues ? (
              <div className="card" style={{ borderLeft: "3px solid var(--orange)", marginBottom: 16 }}>
                <div className="text-sm" style={{ fontWeight: 600, marginBottom: 8 }}>⚠️ Проблемы перед публикацией</div>
                <div className="flex flex-col gap-2">
                  {missingMarking && (
                    <div className="text-xs" style={{ color: "var(--orange)" }}>
                      {`Пост помечен как «${post.postType === "advertising" ? "Реклама" : "Спонсорская интеграция"}», но не содержит пометку «Реклама». Отметьте чекбокс на вкладке «Метаданные».`}
                    </div>
                  )}
                  {missingAdvertiser && (
                    <div className="text-xs" style={{ color: "var(--orange)" }}>
                      Не указан рекламодатель. Заполните поле в метаданных поста.
                    </div>
                  )}
                </div>
              </div>
            ) : null;
          })()}
          <PublicationTab post={post} updatePost={updatePost} assets={assets} pipeline={pipeline} drafts={drafts} />
          <div style={{ marginTop: 16, display: "flex", justifyContent: "center", gap: 12 }}>
            {(() => {
              const targetStatus = post.scheduledDate ? "scheduled" : "ready";
              const alreadyThere = post.status === targetStatus;
              return (
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 16, padding: "10px 32px" }}
                  onClick={() => updatePost.mutate({ status: targetStatus })}
                  disabled={alreadyThere}
                >
                  {alreadyThere
                    ? "Пост готов к публикации"
                    : post.scheduledDate
                      ? "Отправить в очередь"
                      : "Пометить готовым к публикации"}
                </button>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
