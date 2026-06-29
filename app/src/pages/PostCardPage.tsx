import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useParams, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import CarouselTab from "../components/content-tabs/CarouselTab";
import PostTab, { type ContentTabHandle } from "../components/content-tabs/PostTab";
import ReelTab from "../components/content-tabs/ReelTab";
import StoriesTab from "../components/content-tabs/StoriesTab";
import PublicationTab from "../components/PublicationTab";

type Step = "meta" | "content" | "drafts" | "publication";

const GEN_PROMPTS: Record<string, (post: any) => string> = {
  goal: (p) => `Придумай цель для Instagram-поста.
Название: ${p.title}
Рубрика: ${p.rubricName || "без рубрики"}
Тип контента: ${p.contentTypeName || "пост"}
Тон: бережный, без агрессивной мотивации

Ответ — одной строкой, конкретная цель (что хотим получить от поста).`,

  hook: (p) => `Придумай хук (цепляющую первую фразу) для Instagram-поста.
Название: ${p.title}
Рубрика: ${p.rubricName || "без рубрики"}
Тип контента: ${p.contentTypeName || "пост"}
Цель: ${p.goal || "не указана"}
Тон: бережный, без агрессивной мотивации

Ответ — одной строкой, без кавычек.`,

  keyMessage: (p) => `Сформулируй ключевое сообщение для Instagram-поста.
Название: ${p.title}
Рубрика: ${p.rubricName || "без рубрики"}
Тип контента: ${p.contentTypeName || "пост"}
Цель: ${p.goal || "не указана"}
Хук: ${p.hook || "не указан"}
Тон: бережный, без агрессивной мотивации

Ответ — одной строкой, главная мысль, которую должен вынести читатель.`,

  cta: (p) => `Придумай CTA (призыв к действию) для Instagram-поста.
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
                      {generatingTags ? "⏳" : "🏷"} Тэги
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
            </div>
          );
          })}
        </div>
      )}
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
    if (currentStep === "content" && contentTabRef.current) {
      const savedDraftId = await contentTabRef.current.saveDraft();
      if (savedDraftId && (post.contentTypeCode === "carousel" || post.contentTypeCode === "post")) {
        updatePost.mutate({ versionCurrentId: savedDraftId });
      }
    }
    const steps: Step[] = ["meta", "content", "drafts", "publication"];
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
        publication: "ready",
      };
      const currentStatusIdx = statusOrder.indexOf(post.status);
      const targetStatusIdx = statusOrder.indexOf(stepTarget[currentStep]);
      if (currentStatusIdx >= 0 && currentStatusIdx < targetStatusIdx) {
        updatePost.mutate({ status: stepTarget[currentStep] });
      }
    }
  };

  const isStepDone = (key: Step) => {
    if (locked.has(key)) return true;
    if (!post) return false;
    if (key === "meta") return !!(post.goal || post.hook || post.keyMessage || post.cta);
    if (key === "content") return drafts && drafts.length > 0;
    if (key === "drafts") return true;
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

  const steps: { key: Step; label: string; icon: string }[] = [
    { key: "meta", label: "Метаданные", icon: "📋" },
    { key: "content", label: "Контент", icon: "✍️" },
    { key: "drafts", label: "Черновики", icon: "📄" },
    { key: "publication", label: "Публикация", icon: "🚀" },
  ];

  if (isLoading) return <div className="text-dim">Loading...</div>;
  if (!post) return <div className="text-dim">Post not found</div>;

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
              {done && !active && "✓ "}{s.icon} {s.label}
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
              <span className="text-xs" style={{ color: "var(--green)" }}>✅ Сохранено</span>
            ) : (
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 12px" }} onClick={saveCurrentStep}>
                {saveStatus === "saving" ? "⏳ Сохранение..." : saveStatus === "error" ? "❌ Ошибка" : "💾 Сохранить"}
              </button>
            )}
          </div>
        );
      })()}

      {/* Meta step */}
      {currentStep === "meta" && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Метаданные</span>
            <span className="text-xs text-dim">Нажмите ✨ чтобы сгенерировать поле на основе контекста</span>
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

      {/* Publication step */}
      {currentStep === "publication" && (
        <div>
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
                    ? "✅ Пост готов к публикации"
                    : post.scheduledDate
                      ? "📅 Отправить в очередь"
                      : "🚀 Пометить готовым к публикации"}
                </button>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
