import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { useState } from "react";
import { getStoredProjectId } from "../lib/project";

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

function relativeDate(dateStr: string): { label: string; color: string } {
  if (!dateStr) return { label: "Дата не назначена", color: "var(--dim)" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { label: `Просрочено на ${-diff} дн.`, color: "var(--red)" };
  if (diff === 0) return { label: "Сегодня!", color: "var(--yellow)" };
  if (diff === 1) return { label: "Завтра", color: "var(--orange)" };
  if (diff <= 7) return { label: `Через ${diff} дн.`, color: "var(--text)" };
  return { label: dateStr, color: "var(--dim)" };
}

export default function QueuePage() {
  const queryClient = useQueryClient();
  const [inlineDatePostId, setInlineDatePostId] = useState<string | null>(null);
  const projectId = getStoredProjectId();

  function listParams(status: string) {
    const params: Record<string, string> = { status };
    if (projectId) params.projectId = projectId;
    return params;
  }

  const { data: readyPosts } = useQuery({
    queryKey: ["posts", "ready", projectId],
    queryFn: () => api.posts.list(listParams("ready")),
  });

  const { data: scheduledPosts } = useQuery({
    queryKey: ["posts", "scheduled", projectId],
    queryFn: () => api.posts.list(listParams("scheduled")),
  });

  const { data: publishedPosts } = useQuery({
    queryKey: ["posts", "published", projectId],
    queryFn: () => api.posts.list(listParams("published")),
  });

  const { data: platforms } = useQuery({
    queryKey: ["platforms", projectId],
    queryFn: () => api.platforms.listByProject(projectId!),
    enabled: !!projectId,
  });

  const platformsById = new Map(platforms?.map((p: any) => [p.id, p]) || []);

  const updatePost = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.posts.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posts"] }),
  });

  const readyCount = readyPosts?.length || 0;
  const scheduledCount = scheduledPosts?.length || 0;
  const publishedCount = publishedPosts?.length || 0;

  const todayStr = new Date().toISOString().slice(0, 10);
  const overdue = (scheduledPosts || []).filter((p: any) => p.scheduledDate && p.scheduledDate < todayStr).length;
  const dueToday = (scheduledPosts || []).filter((p: any) => p.scheduledDate === todayStr).length;

  return (
    <div>
      <div className="page-header">
        <h2>📋 Публикации</h2>
        <p>Управление публикациями контента</p>
        <div className="flex items-center gap-3" style={{ marginTop: 12, flexWrap: "wrap" }}>
          <span>📦 {readyCount} готово</span>
          <span style={{ color: "var(--dim)" }}>·</span>
          <span>📅 {scheduledCount} запланировано</span>
          <span style={{ color: "var(--dim)" }}>·</span>
          <span>✅ {publishedCount} опубликовано</span>
          {(dueToday > 0 || overdue > 0) && (
            <>
              <span style={{ color: "var(--dim)" }}>·</span>
              {dueToday > 0 && <span style={{ color: "var(--yellow)" }}>🟡 Сегодня: {dueToday}</span>}
              {overdue > 0 && <span style={{ color: "var(--red)" }}>🔴 Просрочено: {overdue}</span>}
            </>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {/* Колонка: К публикации */}
        <div className="card" style={{ minHeight: 400 }}>
          <div className="card-header">
            <span className="card-title">📦 К публикации</span>
            <span className="text-dim text-sm">{readyCount}</span>
          </div>
          <div className="flex flex-col gap-2">
            {(readyPosts || []).map((post: any) => (
              <QueueCard key={post.id} post={post} platform={platformsById.get(post.platformId)}>
                <div className="flex items-center gap-2">
                  <span className={`tag ${statusColors[post.status]}`}>{statusLabels[post.status]}</span>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {post.scheduledDate ? (
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 8px", color: "var(--accent)" }}
                      onClick={() => updatePost.mutate({ id: post.id, data: { status: "scheduled" } })}>
                      📦 В очередь
                    </button>
                  ) : inlineDatePostId === post.id ? (
                    <input
                      className="input"
                      type="date"
                      autoFocus
                      style={{ width: 150, fontSize: 12 }}
                      onBlur={() => setInlineDatePostId(null)}
                      onChange={(e) => {
                        if (e.target.value) {
                          updatePost.mutate({ id: post.id, data: { scheduledDate: e.target.value, status: "scheduled" } });
                        }
                        setInlineDatePostId(null);
                      }}
                    />
                  ) : (
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }}
                      onClick={() => setInlineDatePostId(post.id)}>
                      📅 Назначить дату
                    </button>
                  )}
                </div>
              </QueueCard>
            ))}
            {readyCount === 0 && (
              <div className="text-dim text-sm" style={{ padding: 20, textAlign: "center" }}>Нет готовых постов</div>
            )}
          </div>
        </div>

        {/* Колонка: Запланировано */}
        <div className="card" style={{ minHeight: 400 }}>
          <div className="card-header">
            <span className="card-title">📅 Запланировано</span>
            <span className="text-dim text-sm">{scheduledCount}</span>
          </div>
          <div className="flex flex-col gap-2">
            {(scheduledPosts || []).map((post: any) => {
              const rd = relativeDate(post.scheduledDate);
              return (
                <QueueCard key={post.id} post={post} platform={platformsById.get(post.platformId)}>
                  <div className="flex items-center gap-2">
                    <span className={`tag ${statusColors[post.status]}`}>{statusLabels[post.status]}</span>
                    <span className="text-xs" style={{ color: rd.color, fontWeight: rd.color === "var(--red)" ? 600 : 400 }}>
                      {rd.label}
                    </span>
                  </div>
                  <div className="flex gap-1" style={{ flexShrink: 0 }}>
                    {post.scheduledDate <= todayStr && (
                      <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 8px", color: "var(--green)" }}
                        onClick={() => updatePost.mutate({ id: post.id, data: { status: "published" } })}>
                        ✅ Опубликовать
                      </button>
                    )}
                    {inlineDatePostId === post.id ? (
                      <input
                        className="input"
                        type="date"
                        autoFocus
                        style={{ width: 150, fontSize: 12 }}
                        onBlur={() => setInlineDatePostId(null)}
                        onChange={(e) => {
                          if (e.target.value) {
                            updatePost.mutate({ id: post.id, data: { scheduledDate: e.target.value } });
                          }
                          setInlineDatePostId(null);
                        }}
                      />
                    ) : (
                      <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }}
                        onClick={() => setInlineDatePostId(post.id)}>
                        📅 Перенести
                      </button>
                    )}
                  </div>
                </QueueCard>
              );
            })}
            {scheduledCount === 0 && (
              <div className="text-dim text-sm" style={{ padding: 20, textAlign: "center" }}>Нет запланированных постов</div>
            )}
          </div>
        </div>

        {/* Колонка: Опубликовано */}
        <div className="card" style={{ minHeight: 400 }}>
          <div className="card-header">
            <span className="card-title">✅ Опубликовано</span>
            <span className="text-dim text-sm">{publishedCount}</span>
          </div>
          <div className="flex flex-col gap-2">
            {(publishedPosts || []).map((post: any) => (
              <QueueCard key={post.id} post={post} platform={platformsById.get(post.platformId)}>
                <div className="flex items-center gap-2">
                  <span className={`tag ${statusColors[post.status]}`}>{statusLabels[post.status]}</span>
                </div>
              </QueueCard>
            ))}
            {publishedCount === 0 && (
              <div className="text-dim text-sm" style={{ padding: 20, textAlign: "center" }}>Нет опубликованных постов</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QueueCard({ post, platform, children }: {
  post: any;
  platform: any;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      padding: "12px 14px", background: "var(--bg-hover)", borderRadius: 8,
      borderLeft: `3px solid ${post.rubricColor || "var(--border)"}`,
    }}>
      <div className="flex items-center justify-between mb-4" style={{ flexWrap: "wrap", gap: 4 }}>
        {children}
      </div>
      <Link to={`/posts/${post.id}`} style={{ textDecoration: "none", color: "var(--text)" }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{post.title}</div>
      </Link>
      <div className="flex items-center gap-2 text-xs text-dim" style={{ flexWrap: "wrap" }}>
        {platform && (
          <>
            <span>{platform.name}</span>
            <span>·</span>
          </>
        )}
        <span className="rubric-dot" style={{ background: post.rubricColor }} />
        {post.rubricName || "—"}
        <span>·</span>
        {post.contentTypeName || "—"}
        {post.scheduledDate && (
          <><span>·</span>{post.scheduledDate}</>
        )}
      </div>
    </div>
  );
}
