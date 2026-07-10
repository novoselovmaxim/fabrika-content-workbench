import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  FileText, Sparkles, Library, Calendar,
  Edit3, Send, BarChart3, TrendingUp, CheckCircle, Lightbulb,
} from "lucide-react";
import { api } from "../lib/api";
import { getStoredProjectId } from "../lib/project";
import { PLATFORM_COLORS } from "../lib/constants";

const statusLabels: Record<string, string> = {
  idea: "Идея", planned: "Запланирован", draft: "Черновик",
  generated: "Сгенерирован", editing: "Редактируется", ready: "Готов",
  scheduled: "В очереди", published: "Опубликован", archived: "Архив",
};

const statusColors: Record<string, string> = {
  idea: "#9ca3af", planned: "#fbbf24", draft: "#f97316",
  generated: "#a78bfa", editing: "#06b6d4", ready: "#22c55e",
  scheduled: "#3b82f6", published: "#10b981", archived: "#6b7280",
};

const funnelOrder = ["idea", "planned", "draft", "generated", "editing", "ready", "scheduled", "published"];
const kpiStatuses: { key: string; label: string; icon: any; match: (s: string) => boolean }[] = [
  { key: "all", label: "Всего", icon: FileText, match: () => false },
  { key: "editing", label: "В работе", icon: Edit3, match: (s: string) => s === "editing" || s === "generated" },
  { key: "ready", label: "Готово", icon: CheckCircle, match: (s: string) => s === "ready" },
  { key: "scheduled", label: "В очереди", icon: Send, match: (s: string) => s === "scheduled" },
  { key: "published", label: "Опубликовано", icon: TrendingUp, match: (s: string) => s === "published" },
];

function useInView(ref: React.RefObject<Element | null>, options?: IntersectionObserverInit) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); observer.disconnect(); }
    }, options);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, options]);
  return inView;
}

function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    setDisplay(0);
    const duration = 1200;
    const start = performance.now();
    let frame: number;
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.floor(eased * value));
      if (t < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [inView, value]);

  return <span ref={ref} className="dash-count">{display.toLocaleString()}{suffix}</span>;
}

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <motion.div className="dash-kpi" variants={itemVariants}>
      <div className="dash-kpi-icon" style={{ color }}>
        <Icon size={18} />
      </div>
      <div className="dash-kpi-body">
        <span className="dash-kpi-label">{label}</span>
        <span className="dash-kpi-value" style={{ color }}>
          <AnimatedCounter value={value} />
        </span>
      </div>
    </motion.div>
  );
}

function StatusDot({ status }: { status: string }) {
  return <span className="dash-dot" style={{ background: statusColors[status] || "#666" }} />;
}

function ContentFunnel({ data, total }: { data: { status: string; count: number }[]; total: number }) {
  const sorted = funnelOrder
    .map((s) => ({ status: s, count: data.find((d) => d.status === s)?.count || 0 }))
    .filter((d) => d.count > 0);
  const maxCount = Math.max(...sorted.map((d) => d.count), 1);

  return (
    <motion.div className="dash-card" variants={itemVariants}>
      <h3 className="dash-card-title">Воронка контента</h3>
      <div className="dash-funnel">
        {sorted.map((d) => (
          <div key={d.status} className="dash-funnel-row">
            <div className="dash-funnel-head">
              <StatusDot status={d.status} />
              <span className="dash-funnel-label">{statusLabels[d.status]}</span>
            </div>
            <div className="dash-funnel-bar-track">
              <div
                className="dash-funnel-bar"
                style={{
                  width: `${(d.count / maxCount) * 100}%`,
                  background: statusColors[d.status] || "#666",
                }}
              />
            </div>
            <div className="dash-funnel-meta">
              <span className="dash-funnel-count">{d.count}</span>
              <span className="dash-funnel-pct">{total > 0 ? Math.round((d.count / total) * 100) : 0}%</span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function RubricDonut({ data }: { data: { name: string; color: string; count: number }[] }) {
  const chartData = data.filter((d) => d.count > 0);
  if (chartData.length === 0) {
    return (
      <motion.div className="dash-card" variants={itemVariants}>
        <h3 className="dash-card-title">По рубрикам</h3>
        <div className="dash-empty-chart">Нет данных</div>
      </motion.div>
    );
  }

  const total = chartData.reduce((a, d) => a + d.count, 0);

  return (
    <motion.div className="dash-card" variants={itemVariants}>
      <h3 className="dash-card-title">По рубрикам</h3>
      <div className="dash-donut-wrap">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="count"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              stroke="none"
            >
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.color || "#6366f1"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: 8, fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              }}
              formatter={(_: any, name: string) => [_, name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="dash-donut-legend">
          {chartData.slice(0, 6).map((d) => (
            <div key={d.name} className="dash-legend-item">
              <span className="dash-legend-dot" style={{ background: d.color }} />
              <span className="dash-legend-name">{d.name}</span>
              <span className="dash-legend-count">{d.count}</span>
              <span className="dash-legend-pct">{Math.round((d.count / total) * 100)}%</span>
            </div>
          ))}
          {chartData.length > 6 && (
            <div className="dash-legend-more">+{chartData.length - 6} ещё</div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function WeekCalendar({ days, onDayClick }: { days: { day: string; date: string; count: number; posts: any[] }[]; onDayClick?: (date: string) => void }) {
  const today = new Date().toISOString().split("T")[0];

  return (
    <motion.div className="dash-card" variants={itemVariants}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 className="dash-card-title" style={{ margin: 0 }}>Ближайшие публикации</h3>
      </div>
      <div className="dash-week">
        {days.map((d) => (
          <div
            key={d.date}
            className={`dash-week-day ${d.date === today ? "is-today" : ""} ${d.count > 0 ? "has-posts" : ""}`}
            onClick={() => onDayClick?.(d.date)}
          >
            <span className="dash-week-dayname">{d.day}</span>
            <span className="dash-week-date">{d.date.split("-").pop()}</span>
            {d.count > 0 ? (
              <span className="dash-week-badge">{d.count}</span>
            ) : (
              <span className="dash-week-none">—</span>
            )}
          </div>
        ))}
      </div>
      <div className="dash-upcoming">
        {days.some((d) => d.posts.length > 0) ? (
          days
            .filter((d) => d.posts.length > 0)
            .flatMap((d) => d.posts)
            .slice(0, 5)
            .map((p) => (
              <a key={p.id} href={`/posts/${p.id}`} className="dash-upcoming-row">
                <span className="dash-upcoming-date">
                  {new Date(p.scheduledDate + (p.scheduledTime ? `T${p.scheduledTime}` : "")).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                  {p.scheduledTime ? ` ${p.scheduledTime.slice(0, 5)}` : ""}
                </span>
                <span className="dash-upcoming-title">{p.title}</span>
                <span className="dash-upcoming-type">{p.contentTypeName || ""}</span>
              </a>
            ))
        ) : (
          <div className="dash-empty-sm">Нет запланированных публикаций</div>
        )}
      </div>
    </motion.div>
  );
}

function RecentActivity({ items }: { items: { postId: string; title: string; status: string; updatedAt: string }[] }) {
  const navigate = useNavigate();

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "только что";
    if (mins < 60) return `${mins} мин назад`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} ч назад`;
    const days = Math.floor(hours / 24);
    return `${days} д назад`;
  }

  return (
    <motion.div className="dash-card" variants={itemVariants}>
      <h3 className="dash-card-title">Последние изменения</h3>
      {items.length === 0 ? (
        <div className="dash-empty-sm">Нет активности</div>
      ) : (
        <div className="dash-activity">
          {items.map((item) => (
            <div key={item.postId} className="dash-activity-row" onClick={() => navigate(`/posts/${item.postId}`)}>
              <div className="dash-activity-icon">
                <StatusDot status={item.status} />
              </div>
              <div className="dash-activity-body">
                <span className="dash-activity-title">{item.title}</span>
                <span className="dash-activity-meta">
                  <span className="tag" style={{ background: `${statusColors[item.status] || "#666"}20`, color: statusColors[item.status] || "#666", fontSize: 10, padding: "0 6px", borderRadius: 4 }}>
                    {statusLabels[item.status] || item.status}
                  </span>
                  <span className="dash-activity-time">{timeAgo(item.updatedAt)}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function QuickActions() {
  const navigate = useNavigate();
  const actions = [
    { label: "Создать пост", icon: FileText, desc: "Новый пост из темы", onClick: () => navigate("/topics") },
    { label: "Сгенерировать", icon: Sparkles, desc: "AI-генерация контента", onClick: () => navigate("/topics") },
    { label: "Библиотека", icon: Library, desc: "Все темы и рубрики", onClick: () => navigate("/topics") },
    { label: "Календарь", icon: Calendar, desc: "Расписание публикаций", onClick: () => navigate("/calendar") },
  ];

  return (
    <motion.div className="dash-card" variants={itemVariants}>
      <h3 className="dash-card-title">Быстрые действия</h3>
      <div className="dash-actions">
        {actions.map((a) => (
          <button key={a.label} className="dash-action-btn" onClick={a.onClick}>
            <a.icon size={18} />
            <div className="dash-action-text">
              <span className="dash-action-label">{a.label}</span>
              <span className="dash-action-desc">{a.desc}</span>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

function EmptyState({ projectId }: { projectId: string | null | undefined }) {
  const navigate = useNavigate();

  return (
    <motion.div className="dash-empty" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
      <div className="dash-empty-icon">
        <BarChart3 size={48} />
      </div>
      <h2>Дашборд пока пуст</h2>
      <p>Создайте первый пост, чтобы увидеть статистику и аналитику</p>
      <div className="dash-empty-actions">
        <button className="btn btn-primary" onClick={() => navigate("/topics")}>
          <FileText size={16} /> Создать пост
        </button>
        {projectId && (
          <button className="btn btn-ghost" onClick={() => navigate("/strategy")}>
            <Sparkles size={16} /> Настроить стратегию
          </button>
        )}
      </div>
    </motion.div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dash-page">
      <div className="dash-header">
        <div className="skeleton" style={{ width: 160, height: 28 }} />
        <div className="skeleton" style={{ width: 200, height: 32, borderRadius: 8 }} />
      </div>
      <div className="dash-kpi-row">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="dash-kpi"><div className="skeleton" style={{ width: "100%", height: 72 }} /></div>
        ))}
      </div>
    </div>
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<"week" | "month" | "all">("all");
  const projectId = getStoredProjectId();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", projectId, period],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      if (period !== "all") params.set("period", period);
      return api.dashboard.stats(`?${params.toString()}`);
    },
    refetchInterval: 30_000,
  });

  const { data: insights } = useQuery({
    queryKey: ["insights", projectId],
    queryFn: () => api.analytics.listInsights(projectId!),
    enabled: !!projectId,
  });

  const recomputeInsights = useMutation({
    mutationFn: () => api.analytics.recomputeInsights(projectId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["insights", projectId] }),
  });

  if (isLoading) return <DashboardSkeleton />;

  if (!isLoading && !isError && data && data.totalPosts === 0) {
    return <EmptyState projectId={projectId} />;
  }

  const totalPosts = data?.totalPosts || 0;
  const postsByStatus: { status: string; count: number }[] = data?.postsByStatus || [];

  const kpiValues = kpiStatuses.map((k) => {
    if (k.key === "all") return { ...k, value: totalPosts };
    const value = postsByStatus
      .filter((s) => k.match(s.status))
      .reduce((a, s) => a + s.count, 0);
    return { ...k, value };
  });

  const postsByRubric = data?.postsByRubric || [];

  return (
    <motion.div
      className="dash-page"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Дашборд</h1>
          <p className="dash-subtitle">Оперативная картина дня</p>
        </div>
        <div className="period-switcher">
          {(["all", "month", "week"] as const).map((p) => (
            <button
              key={p}
              className={`period-btn ${period === p ? "is-active" : ""}`}
              onClick={() => setPeriod(p)}
            >
              {p === "all" ? "Всё время" : p === "month" ? "Месяц" : "Неделя"}
            </button>
          ))}
        </div>
      </div>

      <div className="dash-kpi-row">
        {kpiValues.map((k) => (
          <KpiCard key={k.key} label={k.label} value={k.value} icon={k.icon} color={statusColors[k.key === "all" ? "published" : k.key] || "#6366f1"} />
        ))}
      </div>

      <div className="dash-grid-2">
        <ContentFunnel data={postsByStatus} total={totalPosts} />
        <RubricDonut data={postsByRubric} />
      </div>

      {insights && insights.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Рекомендации</span>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => recomputeInsights.mutate()} disabled={recomputeInsights.isPending}>
              {recomputeInsights.isPending ? "Расчёт..." : "🔄 Пересчитать"}
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {insights.map((ins: any) => (
              <div key={ins.id} style={{ padding: 12, background: "var(--bg-hover)", borderRadius: 10 }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                  <Lightbulb size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{ins.payload?.title || ins.insightType}</span>
                </div>
                {ins.payload?.description && (
                  <div className="text-xs text-dim" style={{ marginBottom: 6 }}>{ins.payload.description}</div>
                )}
                {ins.payload?.items && (
                  <div className="flex flex-col gap-1">
                    {ins.payload.items.map((item: any, i: number) => (
                      <div key={i} className="text-xs" style={{ color: "var(--text)", padding: "2px 0" }}>
                        {item.name && <span className="rubric-dot" style={{ background: item.color || "var(--accent)" }} />}
                        {item.name || item.contentTypeId || item.avgMetric?.toFixed(1)}
                      </div>
                    ))}
                  </div>
                )}
                {ins.payload?.missing && ins.payload.missing.length > 0 && (
                  <div className="text-xs" style={{ marginTop: 4 }}>
                    <span style={{ color: "var(--red)" }}>Нет контента: {ins.payload.missing.join(", ")}</span>
                  </div>
                )}
                <Link to="/analytics" className="text-xs" style={{ color: "var(--accent)", marginTop: 6, display: "inline-block" }}>
                  Подробнее →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <WeekCalendar days={data?.weekDistribution || []} />

      <div className="dash-grid-2">
        <RecentActivity items={data?.recentActivity || []} />
        <QuickActions />
      </div>
    </motion.div>
  );
}
