import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useState } from "react";
import { getStoredProjectId } from "../lib/project";
import PlatformMetrics from "../components/PlatformMetrics";
import { PLATFORM_COLORS } from "../lib/constants";
import { Lightbulb } from "lucide-react";

const statusLabels: Record<string, string> = {
  idea: "Идея", planned: "Запланирован", draft: "Черновик",
  generated: "Сгенерирован", editing: "Редактируется", ready: "Готов",
  scheduled: "В очереди", published: "Опубликован", archived: "Архив",
};

const PLATFORM_LABELS: Record<string, string> = {
  telegram: "Telegram",
  youtube: "YouTube",
  vk: "ВКонтакте",
};

export default function AnalyticsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("content");
  const projectId = getStoredProjectId();

  const { data: stats } = useQuery({
    queryKey: ["dashboard", projectId],
    queryFn: () => api.dashboard.stats(projectId ? `?projectId=${projectId}` : undefined),
    enabled: !!projectId,
  });

  const { data: allPosts } = useQuery({
    queryKey: ["posts", "all", projectId],
    queryFn: () => api.posts.list(projectId ? { projectId } : {}),
    enabled: !!projectId,
  });

  const { data: igStatus } = useQuery({
    queryKey: ["instagram", "status"],
    queryFn: () => fetch("/api/instagram/status").then((r) => r.json()),
  });

  const { data: igAccount } = useQuery({
    queryKey: ["instagram", "account"],
    queryFn: () => fetch("/api/instagram/account-insights").then((r) => r.json()),
    enabled: !!(igStatus as any)?.configured,
    refetchInterval: 60000,
  });

  const { data: igMedia } = useQuery({
    queryKey: ["instagram", "media"],
    queryFn: () => fetch("/api/instagram/media?limit=12").then((r) => r.json()),
    enabled: !!(igStatus as any)?.configured,
  });

  const { data: connectedPlatforms } = useQuery({
    queryKey: ["metrics", "platforms"],
    queryFn: () => api.metrics.listPlatforms(),
  });

  const { data: insights, refetch: refetchInsights } = useQuery({
    queryKey: ["insights", projectId],
    queryFn: () => api.analytics.listInsights(projectId!),
    enabled: !!projectId,
  });

  const recomputeInsights = useMutation({
    mutationFn: () => api.analytics.recomputeInsights(projectId!),
    onSuccess: () => refetchInsights(),
  });

  const rubricStats = new Map<string, { count: number; name: string; color: string }>();
  (allPosts || []).forEach((p: any) => {
    const key = p.rubricName || "Без рубрики";
    if (!rubricStats.has(key)) rubricStats.set(key, { count: 0, name: key, color: p.rubricColor || "#6366f1" });
    rubricStats.get(key)!.count++;
  });

  const typeStats = new Map<string, number>();
  (allPosts || []).forEach((p: any) => {
    const key = p.contentTypeName || "Неизвестно";
    typeStats.set(key, (typeStats.get(key) || 0) + 1);
  });

  const totalPosts = (allPosts || []).length;
  const maxRubric = Math.max(...Array.from(rubricStats.values()).map((r) => r.count), 1);
  const maxType = Math.max(...Array.from(typeStats.values()), 1);

  const platforms = (connectedPlatforms || []) as { platform: string; identifier: string; id: string }[];
  const hasIG = !!(igStatus as any)?.configured;

  const tabs: { key: string; label: string; color?: string }[] = [
    { key: "content", label: "Контент" },
    { key: "insights", label: "Insights" },
  ];
  if (hasIG) tabs.push({ key: "instagram", label: "Instagram" });
  for (const p of platforms) {
    tabs.push({ key: p.platform, label: PLATFORM_LABELS[p.platform] || p.platform, color: PLATFORM_COLORS[p.platform] });
  }

  if (activeTab !== "content" && activeTab !== "instagram" && !platforms.find(p => p.platform === activeTab)) {
    setActiveTab("content");
  }

  return (
    <div>
      <div className="page-header">
        <h2>Аналитика</h2>
        <p>Обзор контента и метрики площадок</p>
      </div>

      <div className="flex gap-2 mb-6" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 8, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`btn btn-sm ${activeTab === t.key ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setActiveTab(t.key)}
            style={activeTab === t.key && t.color ? { background: t.color } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "content" && (
        <>
          <div className="card mb-6">
            <div className="card-header">
              <span className="card-title">Распределение по статусам</span>
            </div>
            <div style={{ display: "flex", gap: 4, height: 32, borderRadius: 8, overflow: "hidden" }}>
              {stats?.postsByStatus?.map((s: any) => {
                const pct = (s.count / totalPosts) * 100;
                return (
                  <div
                    key={s.status}
                    title={`${statusLabels[s.status] || s.status}: ${s.count}`}
                    style={{
                      width: `${pct}%`,
                      minWidth: pct > 0 ? 20 : 0,
                      background: "var(--accent)",
                      opacity: 0.3 + (s.count / totalPosts) * 0.7,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      color: "white",
                      fontWeight: 600,
                    }}
                  >
                    {s.count}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4" style={{ marginTop: 12, flexWrap: "wrap" }}>
              {stats?.postsByStatus?.map((s: any) => (
                <div key={s.status} className="flex items-center gap-2 text-xs">
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: "var(--accent)", opacity: 0.5 }} />
                  {statusLabels[s.status] || s.status}: {s.count}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="card">
              <div className="card-header">
                <span className="card-title">По рубрикам</span>
              </div>
              <div className="flex flex-col gap-3">
                {Array.from(rubricStats.values())
                  .sort((a, b) => b.count - a.count)
                  .map((r) => (
                    <div key={r.name}>
                      <div className="flex items-center justify-between text-sm" style={{ marginBottom: 4 }}>
                        <span className="flex items-center gap-2">
                          <span className="rubric-dot" style={{ background: r.color }} />
                          {r.name}
                        </span>
                        <span className="text-dim">{r.count}</span>
                      </div>
                      <div style={{ height: 6, background: "var(--bg-hover)", borderRadius: 3 }}>
                        <div style={{ height: "100%", width: `${(r.count / maxRubric) * 100}%`, background: r.color, borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">По типам контента</span>
              </div>
              <div className="flex flex-col gap-3">
                {Array.from(typeStats.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <div key={type}>
                      <div className="flex items-center justify-between text-sm" style={{ marginBottom: 4 }}>
                        <span>{type}</span>
                        <span className="text-dim">{count} ({Math.round((count / totalPosts) * 100)}%)</span>
                      </div>
                      <div style={{ height: 6, background: "var(--bg-hover)", borderRadius: 3 }}>
                        <div style={{ height: "100%", width: `${(count / maxType) * 100}%`, background: "var(--accent)", borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header">
              <span className="card-title">Все посты ({totalPosts})</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Название</th>
                  <th>Рубрика</th>
                  <th>Тип</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {(allPosts || [])
                  .sort((a: any, b: any) => (a.scheduledDate || "").localeCompare(b.scheduledDate || ""))
                  .map((post: any) => (
                    <tr key={post.id}>
                      <td className="font-mono text-dim">{post.scheduledDate || "—"}</td>
                      <td>{post.title}</td>
                      <td>
                        <span className="flex items-center gap-2">
                          <span className="rubric-dot" style={{ background: post.rubricColor }} />
                          {post.rubricName || "—"}
                        </span>
                      </td>
                      <td className="text-dim">{post.contentTypeName || "—"}</td>
                      <td><span className={`tag tag-${post.status}`}>{statusLabels[post.status]}</span></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === "instagram" && (
        <>
          {hasIG ? (
            <>
              {igAccount && (
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-label">Охват (reach)</div>
                    <div className="stat-value">{(igAccount as any).reach?.toLocaleString() || "—"}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Показы (impressions)</div>
                    <div className="stat-value">{(igAccount as any).impressions?.toLocaleString() || "—"}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Просмотры профиля</div>
                    <div className="stat-value">{(igAccount as any).profileViews?.toLocaleString() || "—"}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Подписчики</div>
                    <div className="stat-value">{(igAccount as any).followerCount?.toLocaleString() || "—"}</div>
                  </div>
                </div>
              )}

              <div className="card">
                <div className="card-header">
                  <span className="card-title">Недавние публикации ({(igMedia as any)?.length || 0})</span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Тип</th>
                      <th>Описание</th>
                      <th>Дата</th>
                      <th>Лайки</th>
                      <th>Комментарии</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(igMedia as any[])?.map((m: any) => (
                      <tr key={m.id}>
                        <td>
                          <span className={`tag ${m.mediaType === "VIDEO" ? "tag-generated" : m.mediaType === "CAROUSEL_ALBUM" ? "tag-planned" : "tag-draft"}`}>
                            {m.mediaType}
                          </span>
                        </td>
                        <td className="text-dim" style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.caption?.slice(0, 100) || "—"}
                        </td>
                        <td className="font-mono text-xs">{new Date(m.timestamp).toLocaleDateString()}</td>
                        <td>{m.likeCount ?? "—"}</td>
                        <td>{m.commentsCount ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="card" style={{ textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
              <h3 style={{ marginBottom: 8 }}>Instagram не подключен</h3>
              <p className="text-dim text-sm" style={{ maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
                Для просмотра Instagram-аналитики настройте подключение в разделе Settings.
                Вам понадобятся Instagram Account ID и Access Token профессионального аккаунта.
              </p>
            </div>
          )}
        </>
      )}

      {activeTab === "insights" && (
        <div>
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <h3>Insights и рекомендации</h3>
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => recomputeInsights.mutate()} disabled={recomputeInsights.isPending}>
              {recomputeInsights.isPending ? "Пересчёт..." : "🔄 Пересчитать"}
            </button>
          </div>
          {insights && insights.length > 0 ? (
            <div className="flex flex-col gap-3">
              {insights.map((ins: any) => (
                <div key={ins.id} className="card">
                  <div className="card-header">
                    <span className="card-title flex items-center gap-2">
                      <Lightbulb size={14} />
                      {ins.payload?.title || ins.insightType}
                    </span>
                    <span className="text-xs text-dim">{new Date(ins.generatedAt).toLocaleString("ru-RU")}</span>
                  </div>
                  {ins.payload?.description && <div className="text-sm text-dim" style={{ marginBottom: 8 }}>{ins.payload.description}</div>}
                  {ins.payload?.items && (
                    <div className="flex flex-col gap-2">
                      {ins.payload.items.map((item: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-sm" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                          <span className="flex items-center gap-2">
                            {item.name && <span className="rubric-dot" style={{ background: item.color || "var(--accent)" }} />}
                            {item.name || item.contentTypeId || "—"}
                          </span>
                          <span className="text-dim">{item.count || item.avgMetric?.toFixed(1) || "—"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {ins.payload?.missing && ins.payload.missing.length > 0 && (
                    <div className="text-sm" style={{ marginTop: 8 }}>
                      <span style={{ color: "var(--red)" }}>Нет контента на этапах:</span>
                      <div className="flex gap-1 flex-wrap" style={{ marginTop: 4 }}>
                        {ins.payload.missing.map((s: string, i: number) => (
                          <span key={i} className="tag tag-draft">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {ins.payload?.stages && (
                    <div className="flex gap-1 flex-wrap" style={{ marginTop: 8 }}>
                      <span className="text-xs text-dim">Покрытие воронки:</span>
                      {ins.payload.stages.map((s: string, i: number) => {
                        const isCovered = ins.payload.covered?.includes(s);
                        return (
                          <span key={i} className="tag" style={{ background: isCovered ? "var(--green)" : "var(--red)", color: "#fff", fontSize: 10 }}>
                            {isCovered ? "✓" : "✗"} {s}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ textAlign: "center", padding: 40 }}>
              <p className="text-dim text-sm">Пока нет инсайтов. Нажмите «Пересчитать», чтобы сгенерировать рекомендации.</p>
            </div>
          )}
        </div>
      )}

      {activeTab !== "content" && activeTab !== "instagram" && activeTab !== "insights" && (
        (() => {
          const p = platforms.find(p => p.platform === activeTab);
          return p ? <PlatformMetrics platform={p.platform} identifier={p.identifier} /> : null;
        })()
      )}
    </div>
  );
}
