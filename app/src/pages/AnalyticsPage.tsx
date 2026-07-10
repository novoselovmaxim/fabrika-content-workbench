import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useState } from "react";
import { getStoredProjectId } from "../lib/project";
import PlatformMetrics from "../components/PlatformMetrics";
import { PLATFORM_COLORS } from "../lib/constants";
import { Lightbulb, Target, Funnel, Plus, Trash2, RefreshCw, BarChart3, FileText } from "lucide-react";

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

const CLASSIFICATION_LABELS: Record<string, string> = {
  hit: "Хит",
  normal: "Средний",
  underperforming: "Низкий",
};

const CLASSIFICATION_COLORS: Record<string, string> = {
  hit: "var(--green, #2e7d32)",
  normal: "var(--accent)",
  underperforming: "var(--red)",
};

const GOAL_STATUS_LABELS: Record<string, string> = {
  ahead: "Опережает",
  on_track: "В норме",
  behind: "Отстаёт",
};

const GOAL_STATUS_COLORS: Record<string, string> = {
  ahead: "var(--green, #2e7d32)",
  on_track: "var(--accent)",
  behind: "var(--red)",
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

  const { data: projectPlatforms } = useQuery({
    queryKey: ["platforms", "project", projectId],
    queryFn: () => api.platforms.listByProject(projectId!),
    enabled: !!projectId,
  });

  const { data: insights, refetch: refetchInsights } = useQuery({
    queryKey: ["insights", projectId],
    queryFn: () => api.analytics.listInsights(projectId!),
    enabled: !!projectId,
  });

  const { data: funnels } = useQuery({
    queryKey: ["funnelsUsed", projectId],
    queryFn: () => api.funnels.listUsed(projectId!),
    enabled: !!projectId,
  });

  const { data: goals, refetch: refetchGoals } = useQuery({
    queryKey: ["goals", projectId],
    queryFn: () => api.analytics.getGoals(projectId!),
    enabled: !!projectId,
  });

  const { data: projectAnalytics, refetch: refetchProjectAnalytics } = useQuery({
    queryKey: ["projectAnalytics", projectId],
    queryFn: () => api.analytics.getProjectAnalytics(projectId!),
    enabled: !!projectId,
  });

  const { data: savedCompetitors } = useQuery({
    queryKey: ["saved-competitors", projectId],
    queryFn: () => api.competitors.getSaved(projectId!),
    enabled: !!projectId,
  });

  const recomputeInsights = useMutation({
    mutationFn: () => api.analytics.recomputeInsights(projectId!),
    onSuccess: () => refetchInsights(),
  });

  const evaluateGoalsMutation = useMutation({
    mutationFn: () => api.analytics.evaluateGoals(projectId!),
    onSuccess: () => refetchGoals(),
  });

  const deleteGoalMutation = useMutation({
    mutationFn: (id: string) => api.analytics.deleteGoal(id),
    onSuccess: () => refetchGoals(),
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

  const platforms = (projectPlatforms || []) as { type: string; name: string; id: string }[];

  const tabs: { key: string; label: string; color?: string }[] = [
    { key: "content", label: "Контент" },
    { key: "insights", label: "Insights" },
    { key: "goals", label: "Цели" },
    { key: "funnels", label: "Воронки" },
    { key: "competitors", label: "Конкуренты" },
  ];
  for (const p of platforms) {
    tabs.push({ key: p.type, label: p.name || PLATFORM_LABELS[p.type] || p.type, color: PLATFORM_COLORS[p.type] });
  }

  if (activeTab !== "content" && activeTab !== "insights" && activeTab !== "goals" && activeTab !== "funnels" && activeTab !== "competitors" && !platforms.find(p => p.type === activeTab)) {
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
                  <th>ER</th>
                </tr>
              </thead>
              <tbody>
                {(allPosts || [])
                  .sort((a: any, b: any) => (a.scheduledDate || "").localeCompare(b.scheduledDate || ""))
                  .map((post: any) => {
                    const pa = (projectAnalytics || []).find((a: any) => a.post_analytics?.postItemId === post.id);
                    const er = pa?.post_analytics?.engagementRate;
                    const cls = pa?.post_analytics?.classification;
                    return (
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
                        <td>
                          {er != null ? (
                            <span className="tag" style={{
                              background: cls === "hit" ? "var(--green, #2e7d32)" : cls === "underperforming" ? "var(--red)" : "var(--accent)",
                              color: "#fff", fontSize: 10,
                            }}>
                              {(er * 100).toFixed(1)}% {cls === "hit" ? "↑" : cls === "underperforming" ? "↓" : ""}
                            </span>
                          ) : (
                            <span className="text-dim">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === "goals" && <GoalsSection projectId={projectId!} goals={goals || []} onEvaluate={evaluateGoalsMutation} onDelete={(id) => deleteGoalMutation.mutate(id)} onCreated={() => refetchGoals()} />}

      {activeTab === "funnels" && <FunnelsSection funnels={funnels || []} />}

      {activeTab === "competitors" && <CompetitorsSection projectId={projectId!} competitors={savedCompetitors || []} />}

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

      {activeTab !== "content" && activeTab !== "insights" && activeTab !== "goals" && activeTab !== "funnels" && activeTab !== "competitors" && (
        (() => {
          const p = platforms.find(p => p.type === activeTab);
          return p ? <PlatformMetrics platform={p.type} identifier={p.name} /> : null;
        })()
      )}
    </div>
  );
}

function GoalsSection({ projectId, goals, onEvaluate, onDelete, onCreated }: {
  projectId: string; goals: any[]; onEvaluate: any; onDelete: (id: string) => void; onCreated: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [metricName, setMetricName] = useState("engagement_rate");
  const [targetValue, setTargetValue] = useState("");
  const [period, setPeriod] = useState("30d");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [reportPeriod, setReportPeriod] = useState("30d");
  const [reportData, setReportData] = useState<any>(null);

  const createMutation = useMutation({
    mutationFn: () => api.analytics.createGoal({
      projectId,
      metricName,
      targetValue: parseFloat(targetValue),
      period,
      deadlineDate: deadlineDate || undefined,
    }),
    onSuccess: () => {
      setShowForm(false);
      setTargetValue("");
      setDeadlineDate("");
      onCreated();
    },
  });

  const generateReport = useMutation({
    mutationFn: () => api.analytics.periodReport(projectId, reportPeriod),
    onSuccess: (data) => setReportData(data),
  });

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <h3 className="flex items-center gap-2"><Target size={18} /> Цели проекта</h3>
        <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
          <div className="flex items-center gap-1" style={{ fontSize: 12 }}>
            <select className="input" style={{ width: 90, fontSize: 11, padding: "4px 8px" }} value={reportPeriod} onChange={(e) => setReportPeriod(e.target.value)}>
              <option value="7d">7 дней</option>
              <option value="30d">30 дней</option>
              <option value="lifetime">Всё время</option>
            </select>
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => generateReport.mutate()} disabled={generateReport.isPending}>
              <FileText size={14} /> {generateReport.isPending ? "Генерация..." : "Отчёт"}
            </button>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => onEvaluate.mutate()} disabled={onEvaluate.isPending}>
            <RefreshCw size={14} /> {onEvaluate.isPending ? "Оценка..." : "Оценить статусы"}
          </button>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowForm(!showForm)}>
            <Plus size={14} /> {showForm ? "Отмена" : "Новая цель"}
          </button>
        </div>
      </div>

      {reportData && (
        <div className="card mb-6">
          <div className="card-header">
            <span className="card-title flex items-center gap-2"><FileText size={16} /> Отчёт по аналитике</span>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setReportData(null)}>Закрыть</button>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{reportData.fullReport}</div>
        </div>
      )}

      {showForm && (
        <div className="card mb-6">
          <div className="card-header">
            <span className="card-title">Новая цель</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Метрика</label>
              <select className="input" value={metricName} onChange={(e) => setMetricName(e.target.value)}>
                <option value="engagement_rate">Engagement Rate</option>
                <option value="reach">Reach</option>
                <option value="impressions">Impressions</option>
                <option value="likes">Likes</option>
                <option value="comments">Comments</option>
                <option value="saves">Saves</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Целевое значение</label>
              <input className="input" type="number" step="0.01" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Период</label>
              <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option value="day">День</option>
                <option value="7d">7 дней</option>
                <option value="30d">30 дней</option>
                <option value="lifetime">Всё время</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Дедлайн (опц.)</label>
              <input className="input" type="date" value={deadlineDate} onChange={(e) => setDeadlineDate(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => createMutation.mutate()} disabled={!targetValue || createMutation.isPending}>
              {createMutation.isPending ? "Создание..." : "Создать цель"}
            </button>
          </div>
        </div>
      )}

      {goals.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <Target size={32} style={{ color: "var(--text-dim)", marginBottom: 12, opacity: 0.5 }} />
          <p className="text-dim text-sm">Цели не заданы. Создайте первую цель для отслеживания метрик.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {goals.map((g: any) => (
            <div key={g.id} className="card">
              <div className="card-header">
                <div className="flex items-center gap-3">
                  <span className="card-title">{g.metricName}</span>
                  <span className="tag" style={{
                    background: GOAL_STATUS_COLORS[g.status] || "var(--accent)",
                    color: "#fff", fontSize: 10,
                  }}>
                    {GOAL_STATUS_LABELS[g.status] || g.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {g.lastEvaluatedAt && (
                    <span className="text-xs text-dim">Оценено: {new Date(g.lastEvaluatedAt).toLocaleString("ru-RU")}</span>
                  )}
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 8px", color: "var(--red)" }}
                    onClick={() => { if (confirm("Удалить цель?")) onDelete(g.id); }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-dim">Цель: </span>
                  <strong>{g.targetValue}</strong>
                </div>
                <div>
                  <span className="text-dim">Период: </span>
                  {g.period}
                </div>
                {g.deadlineDate && (
                  <div>
                    <span className="text-dim">Дедлайн: </span>
                    {new Date(g.deadlineDate).toLocaleDateString("ru-RU")}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FunnelsSection({ funnels }: { funnels: any[] }) {
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);

  const { data: funnelAnalytics, refetch } = useQuery({
    queryKey: ["funnelAnalytics", selectedFunnelId],
    queryFn: () => api.analytics.getFunnelAnalytics(selectedFunnelId!),
    enabled: !!selectedFunnelId,
  });

  const recomputeFunnel = useMutation({
    mutationFn: (funnelId: string) => api.analytics.recomputeFunnel(funnelId),
    onSuccess: () => refetch(),
  });

  const selectedFunnel = funnels.find((f: any) => f.id === selectedFunnelId);
  let stages: string[] = [];
  if (selectedFunnel?.stages) {
    try { stages = JSON.parse(selectedFunnel.stages); } catch { stages = []; }
  }

  const stageMap = new Map((funnelAnalytics || []).map((fa: any) => [fa.stageName, fa]));

  return (
    <div>
      <h3 className="flex items-center gap-2" style={{ marginBottom: 16 }}><Funnel size={18} /> Аналитика воронок</h3>

      <div className="flex gap-2" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        {funnels.map((f: any) => (
          <button
            key={f.id}
            className={`btn btn-sm ${selectedFunnelId === f.id ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setSelectedFunnelId(f.id)}
          >
            {f.name}
          </button>
        ))}
      </div>

      {!selectedFunnelId && (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <Funnel size={32} style={{ color: "var(--text-dim)", marginBottom: 12, opacity: 0.5 }} />
          <p className="text-dim text-sm">Выберите воронку для просмотра аналитики по этапам.</p>
        </div>
      )}

      {selectedFunnelId && selectedFunnel && (
        <div>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <h4>{selectedFunnel.name}</h4>
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => recomputeFunnel.mutate(selectedFunnelId)} disabled={recomputeFunnel.isPending}>
              <BarChart3 size={14} /> {recomputeFunnel.isPending ? "Расчёт..." : "Пересчитать"}
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {stages.map((stage, i) => {
              const sa = stageMap.get(stage);
              return (
                <div key={stage} className="card">
                  <div className="card-header">
                    <span className="card-title flex items-center gap-2">
                      <span style={{
                        width: 24, height: 24, borderRadius: "50%",
                        background: "var(--accent)", color: "#fff",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 700,
                      }}>{i + 1}</span>
                      {stage}
                    </span>
                    <span className="tag" style={{ background: sa ? "var(--accent)" : "var(--bg-hover)", color: sa ? "#fff" : "var(--text-dim)", fontSize: 10 }}>
                      {sa ? `${sa.postsCount} постов` : "Нет данных"}
                    </span>
                  </div>
                  {sa ? (
                    <div className="flex gap-4 text-sm" style={{ flexWrap: "wrap" }}>
                      {sa.avgReach != null && (
                        <div><span className="text-dim">Ср. охват: </span>{(sa.avgReach as number).toLocaleString("ru-RU", { maximumFractionDigits: 0 })}</div>
                      )}
                      {sa.avgEngagementRate != null && (
                        <div><span className="text-dim">Ср. ER: </span>{(sa.avgEngagementRate * 100).toFixed(1)}%</div>
                      )}
                      {sa.conversionToNextStage != null && i < stages.length - 1 && (
                        <div><span className="text-dim">Плотность → след. этап: </span>{(sa.conversionToNextStage * 100).toFixed(0)}%</div>
                      )}
                      {sa.computedAt && (
                        <div className="text-xs text-dim">Расчёт: {new Date(sa.computedAt).toLocaleString("ru-RU")}</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-dim">Нет постов на этом этапе</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CompetitorsSection({ projectId, competitors }: { projectId: string; competitors: any[] }) {
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: compAnalytics, refetch: refetchComp } = useQuery({
    queryKey: ["compAnalytics", selectedCompId],
    queryFn: () => api.analytics.getCompetitorAnalytics(selectedCompId!),
    enabled: !!selectedCompId,
  });

  const ingestMutation = useMutation({
    mutationFn: (id: string) => api.analytics.ingestCompetitor(id),
    onSuccess: () => refetchComp(),
  });

  const benchmarkMutation = useMutation({
    mutationFn: () => api.analytics.competitorBenchmark(projectId, selectedIds.length > 0 ? selectedIds : competitors.map((c: any) => c.id)),
    onSuccess: (data) => setAnalysis(data.analysis),
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <h3 className="flex items-center gap-2">🔄 Конкуренты</h3>
        <div className="flex gap-2">
          <button className="btn btn-primary" style={{ fontSize: 12 }}
            onClick={() => benchmarkMutation.mutate()} disabled={benchmarkMutation.isPending || competitors.length === 0}>
            {benchmarkMutation.isPending ? "Анализ..." : "📊 Сравнить выбранных"}
          </button>
        </div>
      </div>

      <p className="text-xs text-dim" style={{ marginBottom: 16, lineHeight: 1.5 }}>
        Для аккаунтов конкурентов доступны только публичные метрики (лайки, комментарии, частота публикаций).
        Reach и охват недоступны ни для одного инструмента, включая официальный API Instagram, для аккаунтов, которыми вы не владеете.
      </p>

      {analysis && (
        <div className="card mb-6">
          <div className="card-header">
            <span className="card-title">📊 Сравнительный анализ</span>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setAnalysis(null)}>Закрыть</button>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{analysis}</div>
        </div>
      )}

      {competitors.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <p className="text-dim text-sm">Нет сохранённых конкурентов. Добавьте их в разделе стратегии.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {competitors.map((comp: any) => (
            <div key={comp.id} className="card">
              <div className="card-header">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={selectedIds.includes(comp.id)}
                    onChange={() => toggleSelect(comp.id)} style={{ accentColor: "var(--accent)" }} />
                  <span className="card-title">{comp.name}</span>
                  <a href={comp.url} target="_blank" rel="noopener noreferrer" className="text-xs text-dim">{comp.url}</a>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost" style={{ fontSize: 11 }}
                    onClick={() => setSelectedCompId(selectedCompId === comp.id ? null : comp.id)}>
                    {selectedCompId === comp.id ? "Скрыть" : "Посты"}
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }}
                    onClick={() => ingestMutation.mutate(comp.id)} disabled={ingestMutation.isPending}>
                    {ingestMutation.isPending ? "..." : "🔄 Обновить метрики"}
                  </button>
                </div>
              </div>
              {selectedCompId === comp.id && (
                <div>
                  {compAnalytics && compAnalytics.length > 0 ? (
                    <table>
                      <thead>
                        <tr>
                          <th>Дата</th>
                          <th>Описание</th>
                          <th>Лайки</th>
                          <th>Комм.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compAnalytics.map((ca: any) => (
                          <tr key={ca.id}>
                            <td className="font-mono text-xs">{ca.postedAt ? new Date(ca.postedAt).toLocaleDateString("ru-RU") : "—"}</td>
                            <td className="text-dim" style={{ maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {ca.caption?.slice(0, 80) || "—"}
                            </td>
                            <td>{ca.likes ?? "—"}</td>
                            <td>{ca.comments ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-sm text-dim">Нет данных. Нажмите «Обновить метрики» для загрузки.</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
