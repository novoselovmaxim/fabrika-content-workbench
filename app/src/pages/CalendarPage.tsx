import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getStoredProjectId, getStoredPlatformId } from "../lib/project";
import { PLATFORM_COLORS } from "../lib/constants";
import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";

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

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Date[] = [];
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

const monthNames = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const dayNames = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

export default function CalendarPage() {
  const today = new Date();
  const navigate = useNavigate();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [draggedPostId, setDraggedPostId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const [filterProjectId, setFilterProjectId] = useState<string | undefined>(() => getStoredProjectId());
  const [filterPlatformId, setFilterPlatformId] = useState<string | undefined>();

  const { data: allProjects } = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });

  const platformQueryKey = filterProjectId ? ["platforms", filterProjectId] : null;
  const { data: projectPlatforms } = useQuery({
    queryKey: platformQueryKey!,
    queryFn: () => api.platforms.listByProject(filterProjectId!),
    enabled: !!filterProjectId,
  });

  const { data: posts } = useQuery({
    queryKey: ["posts", year, month, filterProjectId, filterPlatformId],
    queryFn: () => {
      const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const end = `${year}-${String(month + 1).padStart(2, "0")}-31`;
      return api.posts.list({
        startDate: start, endDate: end,
        ...(filterProjectId ? { projectId: filterProjectId } : {}),
        ...(filterPlatformId ? { platformId: filterPlatformId } : {}),
      });
    },
    enabled: true,
  });

  const movePost = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) => {
      const post = (posts || []).find((p: any) => p.id === id);
      const updates: any = { scheduledDate: date };
      if (post?.status === "ready") updates.status = "scheduled";
      return api.posts.update(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts", year, month, filterProjectId, filterPlatformId] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const deletePost = useMutation({
    mutationFn: (id: string) => api.posts.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts", year, month, filterProjectId, filterPlatformId] });
    },
  });

  const days = getMonthDays(year, month);
  const firstDayOfWeek = (days[0].getDay() + 6) % 7;

  const postsByDate = new Map<string, any[]>();
  (posts || []).forEach((p: any) => {
    if (!p.scheduledDate) return;
    if (!postsByDate.has(p.scheduledDate)) postsByDate.set(p.scheduledDate, []);
    postsByDate.get(p.scheduledDate)!.push(p);
  });

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const handleDragStart = useCallback((e: React.DragEvent, postId: string) => {
    setDraggedPostId(postId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", postId);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetDate: string) => {
    e.preventDefault();
    const postId = e.dataTransfer.getData("text/plain");
    if (postId) movePost.mutate({ id: postId, date: targetDate });
    setDraggedPostId(null);
  }, [movePost]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const formatDate = (year: number, month: number, day: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const handleDelete = (e: React.MouseEvent, postId: string, postTitle: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`Удалить пост «${postTitle.slice(0, 50)}»? Это удалит все черновики и файлы.`)) {
      setDeletingId(postId);
      deletePost.mutate(postId, {
        onSettled: () => setDeletingId(null),
      });
    }
  };

  return (
    <div style={{ width: "100%", overflow: "hidden" }}>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h2>Календарь</h2>
            <p>Календарь контента — перетащите пост на другую дату</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              className="input"
              value={filterProjectId || ""}
              onChange={(e) => { setFilterProjectId(e.target.value || undefined); setFilterPlatformId(undefined); }}
              style={{ fontSize: 13, fontWeight: 500, minWidth: 180 }}
            >
              <option value="">📋 Все проекты</option>
              {(allProjects || []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {!!filterProjectId && (
              <select
                className="input"
                value={filterPlatformId || ""}
                onChange={(e) => setFilterPlatformId(e.target.value || undefined)}
                style={{ fontSize: 13, fontWeight: 500, minWidth: 160 }}
              >
                <option value="">📱 Все площадки</option>
                {(projectPlatforms || []).map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            <div className="flex gap-2" style={{ alignItems: "center" }}>
              <button className="btn btn-ghost" onClick={prevMonth}>←</button>
              <span style={{ fontSize: 16, fontWeight: 600, minWidth: 150, textAlign: "center" }}>
                {monthNames[month]} {year}
              </span>
              <button className="btn btn-ghost" onClick={nextMonth}>→</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 0,
        background: "var(--border)", borderRadius: 12, overflow: "hidden",
        border: "1px solid var(--border)",
      }}>
        {dayNames.map((d, i) => (
          <div key={d} style={{
            padding: "10px 8px", fontSize: 12, color: "var(--text-dim)",
            fontWeight: 500, textTransform: "uppercase", background: "var(--bg-card)",
            textAlign: "center", borderBottom: "1px solid var(--border)",
            letterSpacing: "0.5px",
          }}>
            {d}
          </div>
        ))}
        {Array(firstDayOfWeek).fill(null).map((_, i) => (
          <div key={`empty-${i}`} style={{
            minHeight: 110, background: "var(--bg-card)", opacity: 0.3,
            borderRight: (i % 7 !== 6) ? "1px solid var(--border)" : "none",
            borderBottom: "1px solid var(--border)",
          }} />
        ))}
        {days.map((day) => {
          const dateStr = formatDate(year, month, day.getDate());
          const dayPosts = postsByDate.get(dateStr) || [];
          const isToday = dateStr === formatDate(today.getFullYear(), today.getMonth(), today.getDate());
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;

          return (
            <div
              key={dateStr}
              onDrop={(e) => handleDrop(e, dateStr)}
              onDragOver={handleDragOver}
              style={{
                minHeight: 110, maxHeight: 180,
                background: "var(--bg-card)",
                borderRight: "1px solid var(--border)",
                borderBottom: "1px solid var(--border)",
                padding: 6, transition: "background 0.15s, box-shadow 0.15s",
                position: "relative", display: "flex", flexDirection: "column",
                overflow: "hidden",
              }}
              onMouseEnter={(e) => {
                if (!isToday) e.currentTarget.style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (!isToday) e.currentTarget.style.background = "var(--bg-card)";
              }}
            >
              <div style={{
                fontSize: 13, color: isToday ? "var(--accent)" : isWeekend ? "var(--text-dim)" : "var(--text)",
                fontWeight: isToday ? 700 : 500,
                marginBottom: 4, padding: "0 2px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span>{day.getDate()}</span>
                {isToday && (
                  <span style={{
                    fontSize: 9, background: "var(--accent)", color: "white",
                    borderRadius: 4, padding: "1px 5px", fontWeight: 600,
                  }}>Сегодня</span>
                )}
                {dayPosts.length > 0 && !isToday && (
                  <span style={{
                    fontSize: 10, color: "var(--text-dim)", background: "var(--bg-hover)",
                    borderRadius: 8, padding: "0 5px", lineHeight: "16px",
                  }}>{dayPosts.length}</span>
                )}
              </div>
              <div style={{
                flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2,
                scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent",
              }}>
                {dayPosts.map((post: any) => {
                  const platformColor = post.platformType ? PLATFORM_COLORS[post.platformType] : null;
                  return (
                    <div
                      key={post.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, post.id)}
                      style={{
                        fontSize: 11, padding: "2px 5px", borderRadius: 4,
                        background: post.rubricColor ? post.rubricColor + "18" : "var(--bg-hover)",
                        color: post.rubricColor || "var(--text)",
                        cursor: "grab", userSelect: "none",
                        opacity: draggedPostId === post.id ? 0.35 : 1,
                        transition: "opacity 0.15s",
                        display: "flex", alignItems: "center", gap: 3,
                        flexShrink: 0,
                        position: "relative",
                      }}
                      onMouseEnter={(e) => {
                        const btn = e.currentTarget.querySelector(".delete-post-btn") as HTMLElement;
                        if (btn) btn.style.display = "flex";
                      }}
                      onMouseLeave={(e) => {
                        const btn = e.currentTarget.querySelector(".delete-post-btn") as HTMLElement;
                        if (btn) btn.style.display = "none";
                      }}
                    >
                      {platformColor && (
                        <span style={{
                          width: 6, height: 6, borderRadius: 3, flexShrink: 0,
                          background: platformColor,
                        }} title={post.platformName || ""} />
                      )}
                      <span className={`tag ${statusColors[post.status] || ""}`} style={{
                        fontSize: 8, padding: "1px 3px", lineHeight: "14px", flexShrink: 0,
                      }}>
                        {post.contentTypeName?.slice(0, 4) || "?"}
                      </span>
                      <Link to={`/posts/${post.id}`} style={{
                        textDecoration: "none", color: "inherit",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        minWidth: 0, flex: 1,
                      }}>
                        {post.title}
                      </Link>
                      <button
                        className="delete-post-btn"
                        onClick={(e) => handleDelete(e, post.id, post.title)}
                        style={{
                          display: "none",
                          border: "none", background: "transparent",
                          cursor: "pointer", padding: 2, borderRadius: 3,
                          color: "var(--red)", flexShrink: 0,
                          alignItems: "center", justifyContent: "center",
                          opacity: deletingId === post.id ? 0.4 : 1,
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
