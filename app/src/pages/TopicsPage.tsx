import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getStoredProjectId, getStoredPlatformId } from "../lib/project";
import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const STATUS_LABELS: Record<string, string> = {
  published: "Опубликовано",
  scheduled: "Запланировано",
  ready: "Готово",
  editing: "Редактируется",
  generated: "Сгенерировано",
  draft: "Черновик",
  planned: "Запланирован",
  idea: "Идея",
  archived: "Архив",
};
const CONTENT_TYPE_ICONS: Record<string, string> = { carousel: "🎠", post: "📝", reel: "🎬", stories: "📸" };
const STATUS_COLORS: Record<string, string> = {
  published: "var(--green)", scheduled: "var(--cyan)", ready: "var(--green)",
  editing: "var(--orange)", draft: "var(--yellow)", generated: "var(--green)",
  planned: "var(--text-dim)", idea: "var(--text-dim)", archived: "var(--dim)",
};
const PRIORITY_CYCLE = [3, 2, 1];

function priorityLabel(p: number | null | undefined): string {
  const v = p || 0;
  if (v >= 3) return "🔥";
  if (v === 2) return "💡";
  return "⚪";
}

function nextPriority(p: number | null | undefined): number {
  const v = p || 0;
  if (v >= 3) return 1;
  if (v === 2) return 3;
  return 2;
}

function relativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)} дн. назад`;
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Завтра";
  return dateStr.slice(5);
}

export default function TopicsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const projectId = getStoredProjectId() || "";
  const platformId = getStoredPlatformId() || undefined;
  const editRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [rubricFilter, setRubricFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "used" | "unused">("all");
  const [sortBy, setSortBy] = useState<"priority" | "title" | "posts" | "lastPost">("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedRubrics, setExpandedRubrics] = useState<Set<string>>(new Set());
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [editDescValue, setEditDescValue] = useState("");
  const [showGenerate, setShowGenerate] = useState(false);
  const [genRubricId, setGenRubricId] = useState<string | null>(null);
  const [showUnrubric, setShowUnrubric] = useState(false);

  // ── Queries ──
  const { data: rubrics } = useQuery({
    queryKey: ["rubrics", projectId],
    queryFn: () => api.rubrics.list(projectId),
    enabled: !!projectId,
  });
  const { data: topics } = useQuery({
    queryKey: ["topics", projectId],
    queryFn: () => api.topics.list(projectId),
    enabled: !!projectId,
  });
  const { data: allPosts } = useQuery({
    queryKey: ["posts", "all", projectId],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (projectId) params.projectId = projectId;
      return api.posts.list(params);
    },
    enabled: !!projectId,
  });
  const { data: funnels } = useQuery({
    queryKey: ["funnels"],
    queryFn: () => api.funnels.list(),
  });

  // ── Mutations ──
  const updateTopic = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.topics.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["topics", projectId] }); },
  });
  const deleteTopic = useMutation({
    mutationFn: (id: string) => api.topics.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["topics", projectId] }),
  });
  const bulkUpdateTopics = useMutation({
    mutationFn: ({ ids, data }: { ids: string[]; data: any }) => api.topics.bulkUpdate(ids, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topics", projectId] });
      setSelectedTopicIds(new Set());
    },
  });
  const createPost = useMutation({
    mutationFn: async (topic: any) => {
      try {
        const post = await api.posts.create({
          projectId, platformId: platformId || null,
          title: topic.title, topicId: topic.id,
          rubricId: topic.rubricId || null, status: "idea",
        });
        return post;
      } catch (err: any) {
        if (err.status === 409) {
          return { id: err.body?.existingPostId, existing: true };
        }
        throw err;
      }
    },
    onSuccess: (post) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      navigate(`/posts/${post.id}`);
    },
  });
  const bulkCreatePosts = useMutation({
    mutationFn: (topicIds: string[]) =>
      api.posts.bulkFromTopics({ projectId, platformId, topicIds }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      setSelectedTopicIds(new Set());
      const skippedCount = result.skipped?.length || 0;
      if (skippedCount > 0) {
        alert(`Создано: ${result.count}, пропущено (уже есть пост): ${skippedCount}`);
      }
      if (result.posts?.length === 1) navigate(`/posts/${result.posts[0].id}`);
    },
  });
  const suggestTopics = useMutation({
    mutationFn: async () => {
      const rubric = rubrics?.find((r: any) => r.id === genRubricId);
      const result = await api.generate.suggestTopics({
        projectId, platformId,
        rubricId: rubric?.id, rubricName: rubric?.name, rubricDescription: rubric?.description,
      });
      if (!result?.length) return;
      for (const item of result) {
        await api.topics.create({
          projectId, platformId: platformId || null,
          rubricId: genRubricId, title: item.title,
          description: item.description || "", source: "ai_suggested",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topics", projectId] });
      setShowGenerate(false); setGenRubricId(null);
    },
  });

  // ── Data transformation ──
  const rubricsById = useMemo(() => new Map(rubrics?.map((r: any) => [r.id, r]) || []), [rubrics]);
  const funnelsById = useMemo(() => new Map(funnels?.map((f: any) => [f.id, f]) || []), [funnels]);

  // Stats per topic
  const topicStatsMap = useMemo(() => {
    const m = new Map<string, { count: number; lastDate: string | null; published: number; inProgress: number; planned: number; contentTypes: Record<string, number>; funnelNames: Set<string>; funnelIds: Set<string> }>();
    (allPosts || []).forEach((p: any) => {
      if (!p.topicId) return;
      if (!m.has(p.topicId)) m.set(p.topicId, { count: 0, lastDate: null, published: 0, inProgress: 0, planned: 0, contentTypes: {}, funnelNames: new Set(), funnelIds: new Set() });
      const s = m.get(p.topicId)!;
      s.count++;
      if (p.status === "published") s.published++;
      else if (["draft", "generated", "editing", "ready", "scheduled"].includes(p.status)) s.inProgress++;
      else if (["idea", "planned"].includes(p.status)) s.planned++;
      const ct = p.contentTypeCode || p.contentTypeName;
      if (ct) s.contentTypes[ct] = (s.contentTypes[ct] || 0) + 1;
      if (p.scheduledDate && (!s.lastDate || p.scheduledDate > s.lastDate)) s.lastDate = p.scheduledDate;
      if (p.funnelName) s.funnelNames.add(p.funnelName);
      if (p.funnelId) s.funnelIds.add(p.funnelId);
    });
    return m;
  }, [allPosts]);

  // Build rubric groups
  const { rubricGroups, unrubicTopics, unrubicPosts } = useMemo(() => {
    const groups: Array<{
      rubric: any; topics: any[]; orphanedPosts: any[];
      topicCount: number; postCount: number; usedTopicCount: number; funnelPostCount: number;
    }> = [];
    const topicsByRubric = new Map<string, any[]>();
    const postsByRubric = new Map<string, any[]>();

    (topics || []).forEach((t: any) => { const k = t.rubricId || "__n__"; if (!topicsByRubric.has(k)) topicsByRubric.set(k, []); topicsByRubric.get(k)!.push(t); });
    (allPosts || []).forEach((p: any) => { const k = p.rubricId || "__n__"; if (!postsByRubric.has(k)) postsByRubric.set(k, []); postsByRubric.get(k)!.push(p); });

    (rubrics || []).forEach((r: any) => {
      const rt = topicsByRubric.get(r.id) || [];
      const rp = postsByRubric.get(r.id) || [];
      const usedIds = new Set(rp.filter((p: any) => p.topicId).map((p: any) => p.topicId));
      groups.push({
        rubric: r, topics: rt, orphanedPosts: rp.filter((p: any) => !p.topicId),
        topicCount: rt.length, postCount: rp.length,
        usedTopicCount: rt.filter((t: any) => usedIds.has(t.id)).length,
        funnelPostCount: rp.filter((p: any) => p.funnelId).length,
      });
    });

    return {
      rubricGroups: groups,
      unrubicTopics: topicsByRubric.get("__n__") || [],
      unrubicPosts: postsByRubric.get("__n__") || [],
    };
  }, [rubrics, topics, allPosts]);

  // Funnel distribution stats
  const funnelDistrib = useMemo(() => {
    const fd = new Map<string, { postCount: number; rubricNames: Set<string> }>();
    (allPosts || []).forEach((p: any) => {
      if (!p.funnelId || !p.funnelName) return;
      if (!fd.has(p.funnelId)) fd.set(p.funnelId, { postCount: 0, rubricNames: new Set() });
      const d = fd.get(p.funnelId)!;
      d.postCount++;
      if (p.rubricName) d.rubricNames.add(p.rubricName);
    });
    return fd;
  }, [allPosts]);

  // ── Search + filter logic ──
  const searchLower = search.toLowerCase();
  const matchesSearch = (t: any) =>
    !searchLower ||
    (t.title || "").toLowerCase().includes(searchLower) ||
    (t.description || "").toLowerCase().includes(searchLower) ||
    (t.painPoint || "").toLowerCase().includes(searchLower) ||
    (t.promise || "").toLowerCase().includes(searchLower);

  const matchesStatus = (t: any, stats: any) => {
    if (statusFilter === "used") return stats && stats.count > 0;
    if (statusFilter === "unused") return !stats || stats.count === 0;
    return true;
  };

  // ── Handlers ──
  const toggleRubric = (id: string) => {
    setExpandedRubrics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleTopic = (id: string) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const startEdit = (topic: any) => {
    setEditingTopicId(topic.id);
    setEditTitleValue(topic.title || "");
    setEditDescValue(topic.description || "");
    setTimeout(() => editRef.current?.focus(), 50);
  };

  const saveEdit = (id: string) => {
    if (editTitleValue.trim()) {
      updateTopic.mutate({ id, data: { title: editTitleValue.trim(), description: editDescValue.trim() } });
    }
    setEditingTopicId(null);
  };

  const cancelEdit = () => setEditingTopicId(null);

  const cyclePriority = (topic: any) => {
    const newP = nextPriority(topic.priority);
    updateTopic.mutate({ id: topic.id, data: { priority: newP } });
  };

  const toggleSelect = (id: string) => {
    setSelectedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = (ids: string[]) => {
    setSelectedTopicIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const clearSelection = () => setSelectedTopicIds(new Set());

  // ── Computed counts ──
  const totalTopics = topics?.length || 0;
  const totalPosts = allPosts?.length || 0;
  const publishedPosts = allPosts?.filter((p: any) => p.status === "published").length || 0;
  const usedTopics = topics?.filter((t: any) => topicStatsMap.has(t.id)).length || 0;
  const unusedTopics = totalTopics - usedTopics;
  const funnelActive = funnels?.filter((f: any) => f.active).length || 0;

  // ── Render helpers ──
  const renderPostRow = (post: any) => (
    <div key={post.id} className="post-row" onClick={() => navigate(`/posts/${post.id}`)}>
      <div className="post-row-left">
        <span className="post-row-icon">{CONTENT_TYPE_ICONS[post.contentTypeCode] || "📄"}</span>
        <span className="post-row-title">{post.title}</span>
        {post.funnelName && (
          <span className="funnel-badge" style={{ background: (post.funnelColor || "#6366f1") + "20", color: post.funnelColor || "var(--accent)" }}>
            🎯 {post.funnelName}
          </span>
        )}
      </div>
      <div className="post-row-right">
        <span className="post-status-dot" style={{ background: STATUS_COLORS[post.status] || "var(--dim)" }} />
        <span className="text-xs" style={{ color: STATUS_COLORS[post.status] || "var(--text-dim)" }}>
          {STATUS_LABELS[post.status] || post.status}
        </span>
        <span className="post-row-arrow">→</span>
      </div>
    </div>
  );

  const renderTopicRow = (topic: any) => {
    const stats = topicStatsMap.get(topic.id);
    const isUnused = !stats || stats.count === 0;
    const isExpanded = expandedTopics.has(topic.id);
    const isSelected = selectedTopicIds.has(topic.id);
    const isEditing = editingTopicId === topic.id;
    const postsForTopic = allPosts?.filter((p: any) => p.topicId === topic.id) || [];
    const ctEntries = stats ? Object.entries(stats.contentTypes).sort((a: any, b: any) => b[1] - a[1]) : [];
    const fNames = stats ? [...stats.funnelNames] : [];

    return (
      <div key={topic.id} className={`topic-row ${isUnused ? "unused" : ""} ${isSelected ? "selected" : ""}`}>
        <div className="topic-row-main">
          <div className="topic-row-check">
            <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(topic.id)} />
          </div>
          <div className="topic-row-priority" onClick={(e) => { e.stopPropagation(); cyclePriority(topic); }} title="Изменить приоритет">
            {priorityLabel(topic.priority)}
          </div>
          <div className="topic-row-content" style={{ flex: 1, minWidth: 0 }}>
            {isEditing ? (
              <div className="topic-row-edit">
                <input className="input inline-edit-input" ref={editRef} value={editTitleValue}
                  onChange={(e) => setEditTitleValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(topic.id); if (e.key === "Escape") cancelEdit(); }}
                  onBlur={() => saveEdit(topic.id)} placeholder="Название темы" />
                <input className="input inline-edit-input" style={{ marginTop: 4, fontSize: 12 }} value={editDescValue}
                  onChange={(e) => setEditDescValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(topic.id); }}
                  placeholder="Описание (необязательно)" />
              </div>
            ) : (
              <>
                <div className="topic-row-title" onClick={() => startEdit(topic)}>
                  {topic.title}
                  {topic.description && <span className="topic-row-desc">{topic.description}</span>}
                </div>
                <div className="topic-row-meta">
                  {topic.painPoint && <span className="topic-meta-item">🎯 {topic.painPoint}</span>}
                  {topic.promise && <span className="topic-meta-item">✨ {topic.promise}</span>}
                  {topic.audienceSegment && <span className="topic-meta-item">👤 {topic.audienceSegment}</span>}
                </div>
                {stats && stats.count > 0 && (
                  <div className="topic-row-stats">
                    {stats.published > 0 && <span className="stat-badge" style={{ color: "var(--green)" }}>✅ {stats.published}</span>}
                    {stats.inProgress > 0 && <span className="stat-badge" style={{ color: "var(--yellow)" }}>✏️ {stats.inProgress}</span>}
                    {stats.planned > 0 && <span className="stat-badge text-dim">💡 {stats.planned}</span>}
                    {ctEntries.map(([ct, c]: any) => (
                      <span key={ct} className="stat-badge-tag">{CONTENT_TYPE_ICONS[ct] || "📄"} {c}</span>
                    ))}
                    <span className="stat-badge text-dim">· Всего {stats.count}</span>
                    {stats.lastDate && <span className="stat-badge text-dim">· {relativeDate(stats.lastDate)}</span>}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="topic-row-actions">
            {isUnused ? (
              <button className="btn btn-primary topic-create-btn" onClick={() => createPost.mutate(topic)} disabled={createPost.isPending}>
                Создать пост
              </button>
            ) : (
              <button className="btn btn-ghost topic-create-btn-sm" onClick={() => createPost.mutate(topic)} disabled={createPost.isPending}>
                +
              </button>
            )}
            {!isEditing && (
              <div className="topic-row-menu">
                <button className="btn btn-ghost topic-menu-btn" onClick={() => startEdit(topic)} title="Редактировать">ред</button>
                <button className="btn btn-ghost topic-menu-btn" onClick={() => { if (confirm('Удалить тему?')) deleteTopic.mutate(topic.id); }} title="Удалить">уд</button>
              </div>
            )}
          </div>
        </div>
        {stats && stats.count > 0 && (
          <div className="topic-row-expand" onClick={() => toggleTopic(topic.id)}>
            <span className="expand-icon">{isExpanded ? "▾" : "▸"}</span>
            <span className="text-xs text-dim">{stats.count} {stats.count === 1 ? "пост" : "постов"}</span>
            {fNames.length > 0 && (
              <div className="topic-funnel-tags">
                {fNames.map((fn: string) => (
                  <span key={fn} className="funnel-tag-mini">🎯 {fn}</span>
                ))}
              </div>
            )}
          </div>
        )}
        {isExpanded && stats && stats.count > 0 && (
          <div className="topic-row-posts">
            {postsForTopic.map(renderPostRow)}
          </div>
        )}
      </div>
    );
  };

  const renderRubricSection = (rg: typeof rubricGroups[0]) => {
    const isExpanded = expandedRubrics.has(rg.rubric.id);
    const usedPct = rg.topicCount > 0 ? Math.round((rg.usedTopicCount / rg.topicCount) * 100) : 0;
    const filteredTopics = rg.topics.filter((t: any) => {
      const stats = topicStatsMap.get(t.id);
      return matchesSearch(t) && matchesStatus(t, stats);
    });

    if (filteredTopics.length === 0 && rg.orphanedPosts.length === 0) return null;
    if (rubricFilter && rg.rubric.id !== rubricFilter) return null;

    const sortedTopics = [...filteredTopics].sort((a: any, b: any) => {
      const sa = topicStatsMap.get(a.id);
      const sb = topicStatsMap.get(b.id);
      let cmp = 0;
      if (sortBy === "priority") cmp = (b.priority || 0) - (a.priority || 0);
      else if (sortBy === "title") cmp = (a.title || "").localeCompare(b.title || "");
      else if (sortBy === "posts") cmp = ((sa?.count || 0) - (sb?.count || 0));
      else if (sortBy === "lastPost") cmp = ((sa?.lastDate || "") < (sb?.lastDate || "") ? -1 : 1);
      return sortDir === "desc" ? -cmp : cmp;
    });

    return (
      <div key={rg.rubric.id} className="rubric-section">
        <div className="rubric-header" onClick={() => toggleRubric(rg.rubric.id)}>
          <div className="rubric-header-left">
            <span className="expand-icon">{isExpanded ? "▾" : "▸"}</span>
            <span className="rubric-dot-large" style={{ background: rg.rubric.color || "#6366f1" }} />
            <span className="rubric-name">{rg.rubric.name}</span>
            <span className="rubric-stats">
              {rg.topicCount} {rg.topicCount === 1 ? "тема" : "тем"} · {rg.postCount} {rg.postCount === 1 ? "пост" : "постов"}
            </span>
            {rg.funnelPostCount > 0 && (
              <span className="rubric-funnel-count">🎯 {rg.funnelPostCount}</span>
            )}
          </div>
          <div className="rubric-header-right">
            {rg.topicCount > 0 && (
              <div className="rubric-progress-bar">
                <div className="rubric-progress-fill" style={{ width: `${usedPct}%`, background: rg.rubric.color || "#6366f1" }} />
              </div>
            )}
            <button className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); startEdit({ id: `new-${rg.rubric.id}`, rubricId: rg.rubric.id, title: "", description: "" }); }} title="Добавить тему">+</button>
            <button className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); setShowGenerate(true); setGenRubricId(rg.rubric.id); }} title="Сгенерировать темы">AI</button>
          </div>
        </div>
        {isExpanded && (
          <div className="rubric-content">
            {sortedTopics.length === 0 && rg.orphanedPosts.length === 0 && (
              <div className="rubric-empty">Нет тем для отображения</div>
            )}
            {sortedTopics.map(renderTopicRow)}
            {rg.orphanedPosts.length > 0 && (
              <div className="orphaned-section">
                <div className="orphaned-header text-xs text-dim">Посты без темы ({rg.orphanedPosts.length})</div>
                {rg.orphanedPosts.map(renderPostRow)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Main render ──
  return (
    <div className="topics-page">
      <div className="page-header">
        <h2>Библиотека контента</h2>
        <p>{totalPosts} постов · {usedTopics} тем в работе · {unusedTopics} свободно · {publishedPosts} опубликовано · {rubrics?.length || 0} рубрик</p>
      </div>

      {/* Rubric Health Bar */}
      <div className="rubric-health-bar">
        {rubricGroups.map((rg) => {
          const usedPct = rg.topicCount > 0 ? Math.round((rg.usedTopicCount / rg.topicCount) * 100) : 0;
          return (
            <div key={rg.rubric.id} className={`rubric-health-card ${rubricFilter === rg.rubric.id ? "active" : ""}`}
              onClick={() => setRubricFilter(rubricFilter === rg.rubric.id ? null : rg.rubric.id)}>
              <div className="rubric-health-top">
                <span className="rubric-dot-small" style={{ background: rg.rubric.color }} />
                <span className="rubric-health-name">{rg.rubric.name}</span>
              </div>
              <div className="rubric-health-bar-track">
                <div className="rubric-health-bar-fill" style={{ width: `${usedPct}%`, background: rg.rubric.color }} />
              </div>
              <div className="rubric-health-bottom">
                <span>{rg.postCount} постов</span>
                <span className="text-dim">{rg.usedTopicCount}/{rg.topicCount} тем</span>
              </div>
            </div>
          );
        })}
        {/* Unrubric'd card */}
        {(unrubicPosts.length > 0 || unrubicTopics.length > 0) && (
          <div className={`rubric-health-card ${rubricFilter === "__n__" ? "active" : ""}`}
            onClick={() => setRubricFilter(rubricFilter === "__n__" ? null : "__n__")}>
            <div className="rubric-health-top">
              <span className="rubric-dot-small" style={{ background: "var(--dim)" }} />
              <span className="rubric-health-name">Без рубрики</span>
            </div>
            <div className="rubric-health-bottom">
              <span>{unrubicPosts.length} постов</span>
              <span className="text-dim">{unrubicTopics.length} тем</span>
            </div>
          </div>
        )}
      </div>

      {/* Funnel Summary Row */}
      {funnelDistrib.size > 0 && (
        <div className="funnel-summary-row">
          <span className="funnel-summary-label">🎯 Воронки:</span>
          {[...funnelDistrib.entries()].map(([fid, fd]) => {
            const funnel = funnelsById.get(fid);
            return (
              <span key={fid} className="funnel-summary-item">
                <span style={{ color: funnel?.color || "var(--accent)", fontWeight: 600 }}>{funnel?.name || fd.rubricNames.values().next().value || "—"}</span>
                <span className="text-dim">{fd.postCount} {fd.postCount === 1 ? "пост" : "постов"} · {fd.rubricNames.size} {fd.rubricNames.size === 1 ? "рубрика" : "рубрик"}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input className="input search-input" placeholder="Поиск по темам..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input filter-select" value={rubricFilter || ""} onChange={(e) => setRubricFilter(e.target.value || null)}>
            <option value="">🏷 Все рубрики</option>
            {rubrics?.map((r: any) => <option key={r.id} value={r.id} style={{ borderLeft: `3px solid ${r.color}` }}>{r.name}</option>)}
            {(unrubicPosts.length > 0 || unrubicTopics.length > 0) && <option value="__n__">Без рубрики</option>}
          </select>
          <select className="input filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="all">📊 Все темы</option>
            <option value="used">Использованные</option>
            <option value="unused">⚪ Свободные</option>
          </select>
          <select className="input filter-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
            <option value="priority">⇅ Приоритет</option>
            <option value="title">⇅ Название</option>
            <option value="posts">⇅ Посты</option>
            <option value="lastPost">⇅ Дата</option>
          </select>
          <button className="btn btn-ghost btn-xs" onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}>
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
        </div>
        <div className="filter-bar-right">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowGenerate(!showGenerate)}>
            {showGenerate ? "✕ Отмена" : "Создать темы AI"}
          </button>
        </div>
      </div>

      {/* Generate panel */}
      {showGenerate && (
        <div className="generate-panel">
          <span className="text-xs text-dim">Рубрика:</span>
          <select className="input filter-select" value={genRubricId || ""} onChange={(e) => setGenRubricId(e.target.value || null)}>
            <option value="">— выберите рубрику —</option>
            {(rubrics || []).map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => suggestTopics.mutate()}
            disabled={!genRubricId || suggestTopics.isPending}>
            {suggestTopics.isPending ? "⏳ Генерация..." : "Сгенерировать"}
          </button>
        </div>
      )}

      {/* Content Table */}
      <div className="content-table">
        {rubricGroups.length === 0 && unrubicTopics.length === 0 && unrubicPosts.length === 0 && (
          <div className="empty-state">Нет контента для отображения</div>
        )}

        {rubricGroups.map(renderRubricSection)}

        {/* Unrubric'd section */}
        {(unrubicTopics.length > 0 || unrubicPosts.length > 0) && (!rubricFilter || rubricFilter === "__n__") && (
          <div className="rubric-section">
            <div className="rubric-header" onClick={() => setShowUnrubric(!showUnrubric)}>
              <div className="rubric-header-left">
                <span className="expand-icon">{showUnrubric ? "▾" : "▸"}</span>
                <span className="rubric-dot-large" style={{ background: "var(--dim)" }} />
                <span className="rubric-name">Без рубрики</span>
                <span className="rubric-stats">{unrubicPosts.length} постов · {unrubicTopics.length} тем</span>
              </div>
            </div>
            {showUnrubric && (
              <div className="rubric-content">
                {unrubicTopics.map((t: any) => renderTopicRow(t))}
                {unrubicPosts.length > 0 && (
                  <div className="orphaned-section">
                    <div className="orphaned-header text-xs text-dim">Посты без рубрики ({unrubicPosts.length})</div>
                    {unrubicPosts.map(renderPostRow)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedTopicIds.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-bar-count">☑ Выбрано: {selectedTopicIds.size} {selectedTopicIds.size === 1 ? "тема" : "тем"}</span>
          <div className="bulk-bar-actions">
            <button className="btn btn-primary btn-sm" onClick={() => bulkCreatePosts.mutate([...selectedTopicIds])}
              disabled={bulkCreatePosts.isPending}>
              Создать посты ({selectedTopicIds.size})
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              const newRubric = prompt("ID рубрики для назначения:");
              if (newRubric) bulkUpdateTopics.mutate({ ids: [...selectedTopicIds], data: { rubricId: newRubric } });
            }}>
              🏷 Сменить рубрику
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              if (confirm(`Архивировать ${selectedTopicIds.size} тем?`))
                bulkUpdateTopics.mutate({ ids: [...selectedTopicIds], data: { status: "archived" } });
            }}>
              📦 Архивировать
            </button>
            <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} onClick={() => {
              if (confirm(`Удалить ${selectedTopicIds.size} тем?`))
                selectedTopicIds.forEach((id) => deleteTopic.mutate(id));
            }}>
              Удалить
            </button>
            <button className="btn btn-ghost btn-sm" onClick={clearSelection}>✕ Отменить</button>
          </div>
        </div>
      )}
    </div>
  );
}
