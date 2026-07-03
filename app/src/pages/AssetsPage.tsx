import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getStoredProjectId } from "../lib/project";
import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const STATUS_LABELS: Record<string, string> = {
  ready: "Готово", published: "Опубликовано", scheduled: "Запланировано",
};
const STATUS_STYLES: Record<string, string> = {
  ready: "var(--green)", published: "var(--cyan)", scheduled: "var(--yellow)",
};

function relativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Завтра";
  if (diff < 0) return `${Math.abs(diff)} дн. назад`;
  return dateStr.slice(5);
}

export default function AssetsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectId = getStoredProjectId() || "";

  const [search, setSearch] = useState("");
  const [filterRubric, setFilterRubric] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);

  const { data: rubrics } = useQuery({
    queryKey: ["rubrics", projectId],
    queryFn: () => api.rubrics.list(projectId),
    enabled: !!projectId,
  });

  const { data: posts, isLoading } = useQuery({
    queryKey: ["posts", "mediateka", projectId],
    queryFn: () => api.posts.list({ projectId, statuses: "ready,published,scheduled" }),
    enabled: !!projectId,
  });

  const promoteToScheduled = useMutation({
    mutationFn: (post: any) =>
      api.posts.update(post.id, { status: "scheduled", scheduledDate: post.scheduledDate || new Date().toISOString().split("T")[0] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts", "mediateka"] });
    },
  });

  const publishPost = useMutation({
    mutationFn: (post: any) =>
      api.posts.update(post.id, { status: "published", scheduledDate: post.scheduledDate || new Date().toISOString().split("T")[0] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts", "mediateka"] });
    },
  });

  const filteredPosts = useMemo(() => {
    if (!posts) return [];
    const q = search.toLowerCase();
    return posts.filter((p: any) => {
      if (q && !(p.title || "").toLowerCase().includes(q)) return false;
      if (filterRubric && p.rubricId !== filterRubric) return false;
      if (filterType && p.contentTypeCode !== filterType) return false;
      return true;
    });
  }, [posts, search, filterRubric, filterType]);

  const totalReady = posts?.filter((p: any) => p.status === "ready").length || 0;
  const totalPublished = posts?.filter((p: any) => p.status === "published").length || 0;
  const totalScheduled = posts?.filter((p: any) => p.status === "scheduled").length || 0;

  const copyText = async (post: any) => {
    const parts = [
      `📌 ${post.title}`,
      post.hook ? `🪝 ${post.hook}` : "",
      post.keyMessage ? `💡 ${post.keyMessage}` : "",
      post.goal ? `🎯 ${post.goal}` : "",
      post.cta ? `📢 ${post.cta}` : "",
    ].filter(Boolean);
    await navigator.clipboard.writeText(parts.join("\n"));
  };

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const downloadAssets = useCallback(async (post: any) => {
    setDownloadingId(post.id);
    try {
      const assets = await api.assets.listByPost(post.id);
      const images = assets.filter((a: any) => a.type === "image" && a.sourceUrl);
      if (images.length === 0) return;

      const slug = (post.title || "post").slice(0, 30).replace(/[^a-zA-Zа-яА-Я0-9-_]/g, "_").toLowerCase();
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const ext = img.sourceUrl.split(".").pop() || "png";
        const filename = `${slug}-${i + 1}.${ext}`;

        const anchor = document.createElement("a");
        anchor.href = img.sourceUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);

        await new Promise((r) => setTimeout(r, 200));
      }
    } finally {
      setDownloadingId(null);
    }
  }, []);

  if (isLoading) return <div className="page"><p>Загрузка...</p></div>;

  return (
    <div>
      <div className="page-header">
        <h2>Медиатека — готовый контент</h2>
        <p>{totalReady} готово · {totalScheduled} запланировано · {totalPublished} опубликовано</p>
      </div>

      <div className="med-filter-bar">
        <div className="filter-group">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input className="input med-search" placeholder="Поиск по названию..." value={search}
              onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input med-select" value={filterRubric || ""} onChange={(e) => setFilterRubric(e.target.value || null)}>
            <option value="">Все рубрики</option>
            {(rubrics || []).map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select className="input med-select" value={filterType || ""} onChange={(e) => setFilterType(e.target.value || null)}>
            <option value="">Все типы</option>
            <option value="post">Пост</option>
            <option value="carousel">Карусель</option>
            <option value="reel">Reel</option>
            <option value="stories">Stories</option>
          </select>
        </div>
      </div>

      {(!filteredPosts || filteredPosts.length === 0) && (
        <div className="med-empty">
          {search || filterRubric || filterType ? "Нет постов под фильтры" : "Нет готового контента"}
        </div>
      )}

      {filteredPosts.length > 0 && (
        <div className="med-table-wrap">
          <table className="med-table">
            <thead>
              <tr>
                <th>Статус</th>
                <th>Название</th>
                <th>Рубрика</th>
                <th>Тип</th>
                <th>Дата</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredPosts.map((post: any) => {
                const rubric = rubrics?.find((r: any) => r.id === post.rubricId);
                return (
                  <tr key={post.id} className="med-row" onClick={() => navigate(`/posts/${post.id}`)}>
                    <td>
                      <span className="med-status-dot" style={{ background: STATUS_STYLES[post.status] || "var(--text-dim)" }} />
                      <span className="med-status-label">{STATUS_LABELS[post.status] || post.status}</span>
                    </td>
                    <td className="med-title-cell">{post.title}</td>
                    <td className="text-dim">
                      {rubric ? <span className="med-rubric" style={{ borderLeftColor: rubric.color }}>{rubric.name}</span> : "—"}
                    </td>
                    <td className="text-dim">{post.contentTypeName || post.contentTypeCode || "—"}</td>
                    <td className="text-dim">{post.status === "published" ? relativeDate(post.scheduledDate) : "—"}</td>
                    <td className="med-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-xs" onClick={() => navigate(`/posts/${post.id}`)} title="Открыть">откр</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => downloadAssets(post)} title="Скачать картинки">
                        {downloadingId === post.id ? "⏳" : "скач"}
                      </button>
                      <button className="btn btn-ghost btn-xs" onClick={() => copyText(post)} title="Копировать текст">копия</button>
                      {post.status === "ready" && (
                        <>
                          <button className="btn btn-ghost btn-xs" onClick={() => publishPost.mutate(post)} title="Опубликовать">опубл</button>
                          <button className="btn btn-ghost btn-xs med-promote-btn" onClick={() => promoteToScheduled.mutate(post)} title="В публикацию">в публ</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
