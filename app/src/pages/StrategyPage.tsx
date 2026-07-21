import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PLATFORM_OPTIONS, PLATFORM_COLORS } from "../lib/constants";
import { getStoredProjectId, getStoredPlatformId, setStoredPlatformId } from "../lib/project";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import ChatPanel from "../components/ChatPanel";

const SAVE_KEY = "strategy-wizard-state";

function loadSaved<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(`${SAVE_KEY}_${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

const STEPS = [
  { key: "onboarding", label: "Онбординг" },
  { key: "strategy", label: "Стратегия" },
  { key: "funnels", label: "Воронки" },
  { key: "plan", label: "Контент-план" },
];
// Old steps kept for reference but removed from array
const STYLE_OPTIONS = ["Бережный", "Мотивационный", "Экспертный", "Дружеский", "Ироничный"];

function DateBadge({ date }: { date: string }) {
  const day = date?.slice(-2) || "?";
  return (
    <span className="tag" style={{ fontSize: 11, fontWeight: 600, fontFamily: "monospace", background: "var(--accent)", color: "white", minWidth: 36, textAlign: "center" }}>
      {day}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string; label: string }> = {
    idea: { bg: "#f1f5f9", text: "#64748b", label: "идея" },
    planned: { bg: "#dbeafe", text: "#1e40af", label: "план" },
    scheduled: { bg: "#ccfbf1", text: "#0f766e", label: "запланирован" },
    in_progress: { bg: "#fef3c7", text: "#92400e", label: "в работе" },
    review: { bg: "#f3e8ff", text: "#7c3aed", label: "ревью" },
    ready: { bg: "#dcfce7", text: "#166534", label: "готово" },
    published: { bg: "#065f46", text: "#a7f3d0", label: "опубл." },
    failed: { bg: "#fee2e2", text: "#991b1b", label: "ошибка" },
  };
  const c = colors[status] || { bg: "var(--bg-hover)", text: "var(--text-dim)", label: status };
  return <span className="tag" style={{ fontSize: 10, background: c.bg, color: c.text }}>{c.label}</span>;
}

function PlannedPosts({ projectId, platformId, queryClient, posts: externalPosts }: { projectId?: string; platformId?: string; queryClient: any; posts?: any[] }) {
  const { data: posts, isLoading } = useQuery({
    queryKey: ["planned-posts", projectId, platformId],
    queryFn: () => api.posts.list({ projectId: projectId!, platformId: platformId!, status: "planned" }),
    enabled: !!projectId && !!platformId && !externalPosts,
  });

  const displayPosts = externalPosts ?? posts;

  if (!projectId || !platformId) return <div className="text-sm text-dim" style={{ padding: 12 }}>Выберите проект и площадку для просмотра постов.</div>;
  if (isLoading && !externalPosts) return <div className="text-sm text-dim" style={{ padding: 12 }}>⏳ Загрузка запланированных постов...</div>;
  if (!displayPosts || displayPosts.length === 0) {
    return <div className="text-sm text-dim" style={{ padding: 12 }}>Пока нет запланированных постов. Нажми «➕ Следующая неделя» чтобы создать.</div>;
  }

  const byWeek = new Map<string, any[]>();
  for (const p of displayPosts) {
    if (!p.scheduledDate) continue;
    const d = new Date(p.scheduledDate + "T12:00:00Z");
    const day = d.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setUTCDate(d.getUTCDate() - diff);
    const weekKey = d.toISOString().split("T")[0];
    if (!byWeek.has(weekKey)) byWeek.set(weekKey, []);
    byWeek.get(weekKey)!.push(p);
  }

  const weeks = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="flex flex-col gap-4">
      {weeks.map(([weekStart, weekPosts]) => {
        const weekEnd = new Date(weekStart + "T12:00:00Z");
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
        const label = `${weekStart} — ${weekEnd.toISOString().split("T")[0]}`;
        return (
          <div key={weekStart} style={{ padding: 12, background: "var(--bg-hover)", borderRadius: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "var(--accent)" }}>
              {label}
              <span className="text-xs text-dim" style={{ marginLeft: 8, fontWeight: 400 }}>({weekPosts.length} постов)</span>
            </div>
            {weekPosts.map((post: any) => (
              <Link key={post.id} to={`/posts/${post.id}`} className="flex items-center justify-between gap-3" style={{ padding: "8px 4px", borderBottom: "1px solid var(--border)", textDecoration: "none", color: "inherit", cursor: "pointer" }}>
                <div className="flex items-center gap-3" style={{ minWidth: 0, flex: 1 }}>
                  <DateBadge date={post.scheduledDate} />
                  <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{post.title}</span>
                  {post.rubricName && <span className="text-xs text-dim">{post.rubricName}</span>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="tag tag-planned" style={{ fontSize: 10 }}>{post.contentTypeCode || post.contentTypeName?.slice(0, 4) || "post"}</span>
                  <StatusBadge status={post.status || "planned"} />
                </div>
              </Link>
            ))}
          </div>
        );
      })}
      <div className="text-xs text-dim" style={{ marginTop: 4 }}>Всего: {displayPosts.length} запланированных постов</div>
    </div>
  );
}

export default function StrategyPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const urlPlatformId = searchParams.get("platformId");
  const [step, setStep] = useState(() => loadSaved("step", 0));
  const [showChat, setShowChat] = useState(false);

  const [projectId, setProjectId] = useState<string | null>(() => getStoredProjectId() || null);
  const [platforms, setPlatforms] = useState<string[]>(() => loadSaved("platforms", []));
  const [currentPlatformId, setCurrentPlatformId] = useState<string | null>(() => urlPlatformId || loadSaved("currentPlatformId", null) || getStoredPlatformId() || null);
  const [platformMap, setPlatformMap] = useState<Record<string, { id: string; type: string; name: string }>>(() => loadSaved("platformMap", {}));

  // Sync URL platformId → state and storedPlatformId
  useEffect(() => {
    if (urlPlatformId && urlPlatformId !== currentPlatformId) {
      setCurrentPlatformId(urlPlatformId);
      setStoredPlatformId(urlPlatformId);
    }
  }, [urlPlatformId]);

  // Validate stored projectId / platformIds against live data (clean up stale sessionStorage)
  const { data: allProjects } = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });
  useEffect(() => {
    if (!allProjects) return;
    if (projectId) {
      const exists = allProjects.some((p: any) => p.id === projectId);
      if (!exists) {
        setProjectId(null);
        try { sessionStorage.removeItem(`${SAVE_KEY}_projectId`); } catch {}
      }
    }
    if (Object.keys(platformMap).length > 0) {
      const knownPids = new Set(Object.values(platformMap).map((p: any) => p.id));
      if (currentPlatformId && !knownPids.has(currentPlatformId)) {
        setCurrentPlatformId(null);
        try { sessionStorage.removeItem(`${SAVE_KEY}_currentPlatformId`); } catch {}
      }
    }
  }, [allProjects, platformMap]);

  // Per-platform data
  const [perPlatform, setPerPlatform] = useState<Record<string, { ideas: string[]; blocks: any[]; rubrics: any[]; topics: any[]; selectedFunnelId: string | null }>>(() => loadSaved("perPlatform", {}));

  // Extract JSON from AI response (handles markdown blocks and surrounding text)
  function extractJSON(text: string): string {
    // Try markdown code block first
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) return codeBlock[1].trim();
    // Try to find { ... } or [ ... ] JSON in text
    const jsonBlock = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonBlock) return jsonBlock[1].trim();
    return text.trim();
  }

  // Error state for user-visible messages
  const [error, setError] = useState<string | null>(null);

  // Load project data
  const { data: currentProject } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.projects.get(projectId!),
    enabled: !!projectId,
  });

  // Load existing blocks from DB on mount
  const { data: savedBlocks } = useQuery({
    queryKey: ["strategy-blocks", projectId, currentPlatformId],
    queryFn: () => api.strategy.listByProject(projectId!, currentPlatformId!),
    enabled: !!projectId && !!currentPlatformId,
  });

  // Load existing rubrics from DB
  const { data: savedRubrics } = useQuery({
    queryKey: ["rubrics", projectId, currentPlatformId],
    queryFn: () => api.rubrics.list(projectId!, currentPlatformId!),
    enabled: !!projectId && !!currentPlatformId,
  });

  // Load existing topics from DB
  const { data: savedTopics } = useQuery({
    queryKey: ["topics", projectId, currentPlatformId],
    queryFn: () => api.topics.list(projectId!, currentPlatformId!),
    enabled: !!projectId && !!currentPlatformId,
  });

  // Merge DB data into per-platform state on first load (when local state is empty)
  useEffect(() => {
    if (!currentPlatformId) return;
    const prev = perPlatform[currentPlatformId];
    const needsBlocks = savedBlocks && savedBlocks.length > 0 && (!prev || prev.blocks.length === 0);
    const needsRubrics = savedRubrics && savedRubrics.length > 0 && (!prev || prev.rubrics.length === 0);
    const needsTopics = savedTopics && savedTopics.length > 0 && (!prev || prev.topics.length === 0);

    if (needsBlocks || needsRubrics || needsTopics) {
      setPerPlatform((p) => ({
        ...p,
        [currentPlatformId]: {
          ideas: p[currentPlatformId]?.ideas || [],
          blocks: needsBlocks ? (savedBlocks?.map((b: any) => ({ ...b, content: b.content || b.aiContent })) || []) : (p[currentPlatformId]?.blocks || []),
          rubrics: needsRubrics ? savedRubrics : (p[currentPlatformId]?.rubrics || []),
          topics: needsTopics ? savedTopics : (p[currentPlatformId]?.topics || []),
          selectedFunnelId: p[currentPlatformId]?.selectedFunnelId || dbPlatforms?.find((pl: any) => pl.id === currentPlatformId)?.currentFunnelId || null,
        },
      }));
    }
  }, [savedBlocks, savedRubrics, savedTopics, currentPlatformId]);

  // Wizard form state
  const [form, setForm] = useState(() => loadSaved("form", {
    name: "",
    niche: "",
    audience: "",
    pains: "",
    style: "",
    tone: "",
  }));

  const [aiImporting, setAiImporting] = useState(false);

  const [chatContext, setChatContext] = useState(() => loadSaved("chatContext", STEPS[0].key));

  // Active funnel tab for content plan step
  const [activeFunnelId, setActiveFunnelId] = useState<string | null>(null);
  const [existingPostCount, setExistingPostCount] = useState(0);
  const [pendingFunnelId, setPendingFunnelId] = useState<string | null>(null);

  // Derived current platform data
  const currentPlatform = currentPlatformId ? platformMap[currentPlatformId] : null;
  const currentData = currentPlatformId ? perPlatform[currentPlatformId] : null;
  const ideas = currentData?.ideas || [];
  const strategyBlocks = currentData?.blocks || [];
  const rubrics = currentData?.rubrics || [];
  const topics = currentData?.topics || [];
  const currentFunnelId = currentData?.selectedFunnelId || null;

  // Load funnels
  const { data: allFunnels } = useQuery({
    queryKey: ["funnels"],
    queryFn: () => api.funnels.list(),
  });

  // Load posts for funnel filtering (all statuses)
  const { data: posts } = useQuery({
    queryKey: ["platform-posts", projectId, currentPlatformId],
    queryFn: () => api.posts.list({ projectId: projectId!, platformId: currentPlatformId! }),
    enabled: !!projectId && !!currentPlatformId,
  });

  // Load free content posts (no funnel)
  const { data: freePosts } = useQuery({
    queryKey: ["free-posts", projectId, currentPlatformId],
    queryFn: () => api.posts.list({ projectId: projectId!, platformId: currentPlatformId!, excludeFunnel: "true" }),
    enabled: !!projectId && !!currentPlatformId,
  });

  const [recommendedFunnels, setRecommendedFunnels] = useState<any[]>([]);
  const [recommendLoading, setRecommendLoading] = useState(false);

  const getRecommendedFunnels = async () => {
    if (!projectId || !currentPlatformId || !allFunnels) return;
    setRecommendedFunnels([]);
    setRecommendLoading(true);
    try {
      const res = await api.chat.send({
        projectId,
        platformId: currentPlatformId,
        sessionId: "funnel-recommender",
        content: JSON.stringify({ action: "recommend_funnels", funnels: allFunnels }),
        contextStep: "funnels",
      });
      const content = extractJSON(res.assistantMessage?.content || res.content);
      const parsed = JSON.parse(content);
      setRecommendedFunnels(parsed.recommendations || []);
      if (currentPlatformId) {
        api.platforms.update(currentPlatformId, { funnelRecommendations: JSON.stringify(parsed.recommendations || []) });
      }
    } catch (e) {
      console.error("Failed to recommend funnels", e);
    } finally {
      setRecommendLoading(false);
    }
  };

  useEffect(() => {
    if (STEPS[step]?.key === "funnels" && !recommendLoading) {
      const platform = dbPlatforms?.find((pl: any) => pl.id === currentPlatformId);
      if (platform?.funnelRecommendations) {
        try { setRecommendedFunnels(JSON.parse(platform.funnelRecommendations)); return; } catch (e) {} 
      }
      if (recommendedFunnels.length === 0) {
        getRecommendedFunnels();
      }
    }
  }, [step, currentPlatformId]);

  // Reset active funnel tab when leaving content plan step or platform changes
  useEffect(() => {
    if (step !== 3 || !currentPlatformId) {
      setActiveFunnelId(null);
    }
  }, [step, currentPlatformId]);

  // Auto-save wizard state
  useEffect(() => { try { sessionStorage.setItem(`${SAVE_KEY}_step`, JSON.stringify(step)); } catch {} }, [step]);
  useEffect(() => { try { sessionStorage.setItem(`${SAVE_KEY}_projectId`, JSON.stringify(projectId)); } catch {} }, [projectId]);
  useEffect(() => { try { sessionStorage.setItem(`${SAVE_KEY}_platforms`, JSON.stringify(platforms)); } catch {} }, [platforms]);
  useEffect(() => { try { sessionStorage.setItem(`${SAVE_KEY}_currentPlatformId`, JSON.stringify(currentPlatformId)); } catch {} }, [currentPlatformId]);
  useEffect(() => { try { sessionStorage.setItem(`${SAVE_KEY}_platformMap`, JSON.stringify(platformMap)); } catch {} }, [platformMap]);
  useEffect(() => { try { sessionStorage.setItem(`${SAVE_KEY}_perPlatform`, JSON.stringify(perPlatform)); } catch {} }, [perPlatform]);
  useEffect(() => { try { sessionStorage.setItem(`${SAVE_KEY}_form`, JSON.stringify(form)); } catch {} }, [form]);
  useEffect(() => { try { sessionStorage.setItem(`${SAVE_KEY}_chatContext`, JSON.stringify(chatContext)); } catch {} }, [chatContext]);

  // Fetch platforms from DB once projectId is set
  const { data: dbPlatforms, refetch: refetchPlatforms } = useQuery({
    queryKey: ["platforms", projectId],
    queryFn: () => api.platforms.listByProject(projectId!),
    enabled: !!projectId,
  });

  // Re-fetch platforms when entering the page or project changes
  useEffect(() => {
    if (projectId) refetchPlatforms();
  }, [projectId, step]);

  useEffect(() => {
    if (dbPlatforms) {
      const map: Record<string, { id: string; type: string; name: string }> = {};
      for (const p of dbPlatforms) map[p.id] = p;
      setPlatformMap(map);
      setPlatforms(dbPlatforms.map((p: any) => p.type));
      
      // Sync URL platformId or set default
      if (urlPlatformId && map[urlPlatformId]) {
        setCurrentPlatformId(urlPlatformId);
      } else if (!currentPlatformId || !map[currentPlatformId]) {
        if (dbPlatforms.length > 0) {
          setCurrentPlatformId(dbPlatforms[0].id);
          setStoredPlatformId(dbPlatforms[0].id);
        }
      }
    }
  }, [dbPlatforms, urlPlatformId]);

  // Save per-platform data helper
  const updatePlatformData = (platformId: string, updater: (prev: any) => any) => {
    setPerPlatform((prev) => ({
      ...prev,
      [platformId]: updater(prev[platformId] || { ideas: [], blocks: [], rubrics: [], topics: [], selectedFunnelId: null }),
    }));
  };

  // Create project
  const ensureProject = async (): Promise<string> => {
    if (projectId) return projectId;
    const project = await createProject.mutateAsync();
    setProjectId(project.id);
    return project.id;
  };

  const createProject = useMutation({
    mutationFn: async () => {
      const project = await api.projects.create({
        name: form.name || form.niche || "Новый проект",
        niche: form.niche,
        audience: form.audience,
        pains: form.pains,
        style: form.style,
        tone: form.tone,
      });
      for (const p of platforms) {
        await api.platforms.create({
          projectId: project.id,
          type: p,
          name: PLATFORM_OPTIONS.find((o) => o.value === p)?.label || p,
        });
      }
      return project;
    },
    onSuccess: (project) => {
      setProjectId(project.id);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["platforms", project.id] });
    },
  });

  // Generate with AI
  const generateContent = useMutation({
    mutationFn: async (params: { action: string; data?: any }) => {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId!,
          platformId: currentPlatformId || undefined,
          sessionId: `wizard-${step}`,
          content: JSON.stringify({
            action: params.action,
            ...params.data,
            form,
            platformType: currentPlatform?.type || "",
            platformName: currentPlatform?.name || "",
          }),
          contextStep: STEPS[step].key,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Ошибка сервера (${res.status})`);
      }
      return res.json();
    },
    onSuccess: async (data) => {
      try {
        const content = extractJSON(data.assistantMessage?.content || data.content);
        const parsed = JSON.parse(content);
        if (!currentPlatformId || !projectId) return;

        // Persist blocks to DB and merge DB ids back into original data
        if (parsed.blocks && Array.isArray(parsed.blocks)) {
          const result = await api.strategy.bulkCreate({
            projectId,
            platformId: currentPlatformId,
            blocks: parsed.blocks,
          });
          // Merge DB ids back — DB stores content as aiContent, keep original content field
          parsed.blocks = parsed.blocks.map((b: any, idx: number) => ({
            ...b,
            id: result.blocks[idx]?.id,
          }));
        }

        // Persist rubrics to DB and merge DB ids back into original data
        if (parsed.rubrics && Array.isArray(parsed.rubrics)) {
          const result = await api.rubrics.bulkCreate({
            projectId,
            platformId: currentPlatformId,
            rubrics: parsed.rubrics,
          });
          // Merge DB ids back — DB doesn't store percent/types, so keep AI values
          parsed.rubrics = parsed.rubrics.map((r: any, idx: number) => ({
            ...r,
            id: result.rubrics[idx]?.id,
          }));
        }

        // Persist topics to DB and merge DB ids back into original data
        if (parsed.topics && Array.isArray(parsed.topics)) {
          const result = await api.topics.bulkCreate({
            projectId,
            platformId: currentPlatformId,
            topics: parsed.topics,
          });
          parsed.topics = parsed.topics.map((t: any, idx: number) => ({
            ...t,
            id: result.topics[idx]?.id,
          }));
        }

        // Update local state with DB records (now with IDs)
        updatePlatformData(currentPlatformId, (prev: any) => ({
          ...prev,
          ideas: parsed.ideas || prev.ideas,
          blocks: parsed.blocks || prev.blocks,
          rubrics: parsed.rubrics || prev.rubrics,
          topics: parsed.topics || prev.topics,
        }));
      } catch (err: any) {
        setError(err?.message || "Ошибка обработки ответа AI. Попробуйте ещё раз.");
      }
    },
  });

  const updateOnboarding = useMutation({
    mutationFn: async () => {
      const pid = await ensureProject();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: pid,
          sessionId: `wizard-${step}`,
          content: JSON.stringify({ action: "update_onboarding" }),
          contextStep: "onboarding",
        }),
      });
      return res.json();
    },
    onSuccess: async (data) => {
      try {
        const content = extractJSON(data.assistantMessage?.content || data.content);
        const parsed = JSON.parse(content);
        const next = { ...form };
        if (parsed.name) next.name = parsed.name;
        if (parsed.niche) next.niche = parsed.niche;
        if (parsed.audience) next.audience = parsed.audience;
        if (parsed.pains) next.pains = parsed.pains;
        if (parsed.style) next.style = parsed.style;
        if (parsed.tone) next.tone = parsed.tone;
        setForm(next);
        if (projectId) {
          await api.projects.update(projectId, {
            name: parsed.name,
            niche: parsed.niche,
            audience: parsed.audience,
            pains: parsed.pains,
            style: parsed.style,
            tone: parsed.tone,
          });
          queryClient.invalidateQueries({ queryKey: ["projects"] });
        }
      } catch (err: any) {
        setError("Не удалось применить обновление: " + err.message);
      }
    },
  });

  const nextStep = async () => {
    if (step === 0 && !projectId) {
      try {
        const project = await createProject.mutateAsync();
        setProjectId(project.id);
      } catch (err: any) {
        setError(err?.message || "Ошибка создания проекта");
        return;
      }
    }
    if (step < STEPS.length - 1) setStep(step + 1);
    setChatContext(STEPS[Math.min(step + 1, STEPS.length - 1)].key);
  };

  const prevStep = () => {
    if (step > 0) { setStep(step - 1); setChatContext(STEPS[step - 1].key); }
  };

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
          {STEPS.map((s, i) => (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                className={`btn ${i === step ? "btn-primary" : i < step ? "btn-ghost" : "btn-ghost"}`}
                onClick={() => { setStep(i); setChatContext(s.key); }}
                style={{
                  fontSize: 12, padding: "6px 12px",
                  opacity: i > step ? 0.4 : 1,
                }}
              >
                {s.label}
              </button>
              {i < STEPS.length - 1 && <div style={{ width: 16, height: 1, background: "var(--border)" }} />}
            </div>
          ))}
        </div>
        <div style={{ height: 3, background: "var(--bg-hover)", borderRadius: 2 }}>
          <div style={{
            height: "100%", width: `${((step + 1) / STEPS.length) * 100}%`,
            background: "var(--accent)", borderRadius: 2, transition: "width 0.3s",
          }} />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          padding: "10px 16px", background: "#fef2f2", color: "#dc2626",
          borderRadius: 8, marginBottom: 12, fontSize: 13,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>⚠️ {error}</span>
          <button className="btn btn-ghost" style={{ fontSize: 14, padding: "2px 8px" }} onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Step content */}
      <div className="card" style={{ minHeight: 400 }}>
        {/* Step 0: Onboarding */}
        {step === 0 && (
          <div>
            {currentProject?.onboardingComplete === 1 ? (
              <div>
                <h3 style={{ fontSize: 18, marginBottom: 20 }}>Данные распаковки проекта</h3>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                  {/* Basic Info */}
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: "var(--accent)" }}>Проект и Миссия</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div>
                        <div className="text-xs text-dim">Название</div>
                        <div style={{ fontWeight: 600 }}>{currentProject.name || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-dim">Ниша</div>
                        <div style={{ fontSize: 13 }}>{currentProject.niche || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-dim">Миссия</div>
                        <div style={{ fontSize: 13, lineHeight: "1.4" }}>{currentProject.mission || "—"}</div>
                      </div>
                    </div>
                  </div>

                  {/* Value Prop */}
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: "var(--accent)" }}>Ценностное предложение</div>
                    {currentProject.valueProp ? (() => {
                      try {
                        const v = JSON.parse(currentProject.valueProp);
                        return (
                          <div style={{ fontSize: 13, lineHeight: "1.5" }}>
                            <div style={{ background: "var(--bg-hover)", padding: 10, borderRadius: 8, borderLeft: "3px solid var(--accent)", marginBottom: 10 }}>
                              {v.formula}
                            </div>
                            <div className="text-xs text-dim">Задачи: {v.tasks?.length || 0}, Проблемы: {v.problems?.length || 0}</div>
                          </div>
                        );
                      } catch { return <div>Ошибка данных</div>; }
                    })() : "Не сгенерировано"}
                  </div>

                  {/* Audience */}
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: "var(--accent)" }}>👥 Целевая аудитория</div>
                    {currentProject.audience ? (() => {
                      try {
                        const a = JSON.parse(currentProject.audience);
                        const groups = a.groups || [];
                        return (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {groups.map((g: any, i: number) => (
                              <div key={i} style={{ background: "var(--bg-hover)", padding: "8px 12px", borderRadius: 8 }}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</div>
                                <div className="text-xs text-dim" style={{ marginTop: 2 }}>{g.summary?.slice(0, 80)}...</div>
                              </div>
                            ))}
                            <div className="text-xs text-dim" style={{ marginTop: 4 }}>Всего сегментов: {groups.length}</div>
                          </div>
                        );
                      } catch { return <div>Ошибка данных</div>; }
                    })() : "Не сформирована"}
                  </div>

                  {/* Journey */}
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: "var(--accent)" }}>🪜 Лестница Ханта</div>
                    {currentProject.customerJourney ? (() => {
                      try {
                        const j = JSON.parse(currentProject.customerJourney);
                        // Handle both old flat format and new grouped format
                        const isGrouped = Array.isArray(j) && j.length > 0 && j[0].stages;
                        if (isGrouped) {
                          return (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {j.map((g: any, i: number) => (
                                <div key={i} className="flex justify-between items-center" style={{ background: "var(--bg-hover)", padding: "8px 12px", borderRadius: 8 }}>
                                  <span style={{ fontSize: 13 }}>{g.groupName}</span>
                                  <span className="text-xs" style={{ background: "var(--accent)", color: "white", padding: "2px 6px", borderRadius: 10 }}>{g.stages?.length || 0} стадий</span>
                                </div>
                              ))}
                            </div>
                          );
                        }
                        return <div style={{ fontSize: 13 }}>Построено для {Array.isArray(j) ? j.length : 0} стадий</div>;
                      } catch { return <div>Ошибка данных</div>; }
                    })() : "Не построена"}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => navigate("/unpack")}>
                    ✏️ Вернуться в распаковку
                  </button>
                  <button className="btn btn-primary" style={{ fontSize: 14, padding: "10px 32px" }} onClick={nextStep}>
                    Далее: разработка стратегии →
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h3 style={{ fontSize: 18, marginBottom: 20 }}>Расскажите о проекте</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Название проекта</label>
                      <input className="input" placeholder="Название проекта" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Ниша / тематика</label>
                      <textarea className="input" rows={3} placeholder="Например: маркетинг, фитнес, кулинария, IT, психология" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Целевая аудитория</label>
                      <textarea className="input" rows={3} placeholder="Пол, возраст, интересы — опишите идеального подписчика" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Боли аудитории</label>
                      <textarea className="input" rows={3} placeholder="Что беспокоит, с чем приходят" value={form.pains} onChange={(e) => setForm({ ...form, pains: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Стиль общения</label>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {STYLE_OPTIONS.map((s) => (
                          <button
                            key={s}
                            className={`btn ${form.style === s ? "btn-primary" : "btn-ghost"}`}
                            style={{ fontSize: 12 }}
                            onClick={() => setForm({ ...form, style: s })}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Платформы для продвижения</label>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {PLATFORM_OPTIONS.map((p) => (
                          <button
                            key={p.value}
                            className={`btn ${platforms.includes(p.value) ? "btn-primary" : "btn-ghost"}`}
                            style={{ fontSize: 12 }}
                            onClick={() => {
                              setPlatforms(
                                platforms.includes(p.value)
                                  ? platforms.filter((x) => x !== p.value)
                                  : [...platforms, p.value]
                              );
                            }}
                          >
                            {platforms.includes(p.value) ? "✓ " : ""}{p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 13 }}
                    onClick={() => updateOnboarding.mutate()}
                    disabled={updateOnboarding.isPending}
                  >
                    {updateOnboarding.isPending ? "⏳ Анализ..." : "Обновить из базы знаний"}
                  </button>
                  <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => navigate("/unpack")}>
                    Открыть фабрику контента
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 1: Strategy */}
        {step === 1 && (
          <div>
            <h3 style={{ fontSize: 18, marginBottom: 12 }}>
              Стратегия продвижения
              {currentPlatform && (
                <span style={{
                  fontSize: 11, marginLeft: 8, verticalAlign: "middle",
                  background: `${PLATFORM_COLORS[currentPlatform.type] || "var(--accent)"}18`,
                  color: PLATFORM_COLORS[currentPlatform.type] || "var(--accent)",
                  border: `1px solid ${PLATFORM_COLORS[currentPlatform.type] || "var(--accent)"}30`,
                  borderRadius: 6, padding: "2px 10px", fontWeight: 500,
                }}>
                  {currentPlatform.name}
                </span>
              )}
            </h3>
            <p className="text-sm text-dim" style={{ marginBottom: 16 }}>
              Сгенерируйте стратегию с нуля или импортируйте готовую из файла.
            </p>
            <div className="flex gap-4 mb-4">
              <button className="btn btn-primary" onClick={() => generateContent.mutate({ action: "generate_strategy" })} disabled={generateContent.isPending}>
                {generateContent.isPending ? "Генерация..." : "Сгенерировать стратегию"}
              </button>
              <input
                type="file" accept=".txt,.md,.docx"
                style={{ display: "none" }}
                id="strategy-file-input"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const pid = await ensureProject();
                  const fd = new FormData();
                  fd.append("file", file);
                  fd.append("projectId", pid);
                  fd.append("platformId", currentPlatformId || "");
                  try {
                    const res = await fetch("/api/strategy/import", { method: "POST", body: fd });
                    const data = await res.json();
                    if (!res.ok) { setError(data.error || "Ошибка импорта"); return; }
                    if (data.blocks && currentPlatformId) {
                      updatePlatformData(currentPlatformId, (prev: any) => ({ ...prev, blocks: data.blocks }));
                    }
                  } catch (err: any) {
                    setError(err?.message || "Ошибка импорта файла");
                  }
                }}
              />
              <button className="btn btn-ghost" onClick={() => document.getElementById("strategy-file-input")?.click()}>
                📄 Импортировать файл
              </button>
              <input
                type="file" accept=".txt,.md,.docx,.pdf"
                style={{ display: "none" }}
                id="strategy-ai-input"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const pid = await ensureProject();
                  const fd = new FormData();
                  fd.append("file", file);
                  fd.append("projectId", pid);
                  fd.append("platformId", currentPlatformId || "");
                  setAiImporting(true);
                  try {
                    const data = await api.strategy.aiImport(fd);
                    if (data.error) { setError(data.error); return; }
                    if (data.blocks && currentPlatformId) {
                      const normalized = data.blocks.map((b: any) => ({ ...b, content: b.content || b.aiContent }));
                      updatePlatformData(currentPlatformId, (prev: any) => ({ ...prev, blocks: normalized }));
                    }
                  } catch (err: any) {
                    setError(err?.message || "Ошибка AI-импорта");
                  } finally {
                    setAiImporting(false);
                  }
                }}
              />
              <button
                className="btn btn-ghost"
                onClick={() => document.getElementById("strategy-ai-input")?.click()}
                disabled={aiImporting}
              >
                {aiImporting ? "⏳ AI анализирует..." : "AI-импорт"}
              </button>
            </div>
            {strategyBlocks.length > 0 ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={async () => {
                    let saved = 0, errors = 0;
                    for (const b of strategyBlocks) {
                      if (!b.id) continue;
                      try {
                        await api.strategy.update(b.id, { manualContent: b.content, approved: 1, platformId: currentPlatformId });
                        if (currentPlatformId) {
                          updatePlatformData(currentPlatformId, (prev: any) => ({
                            ...prev,
                            blocks: prev.blocks.map((x: any) => x.id === b.id ? { ...x, approved: 1 } : x),
                          }));
                        }
                        saved++;
                      } catch { errors++; }
                    }
                    if (errors) setError(`Сохранено ${saved}, ошибок ${errors}`);
                    else setError(null);
                  }}>💾 Сохранить все</button>
                  <span className="text-xs text-dim">{strategyBlocks.filter((b: any) => b.approved).length}/{strategyBlocks.length} сохранено</span>
                </div>
                {strategyBlocks.map((block: any, i: number) => (
                  <div key={i} style={{ padding: 14, background: "var(--bg-hover)", borderRadius: 8 }}>
                    <div className="flex items-center justify-between mb-4">
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{block.title || block.sectionKey}</span>
                      <div className="flex items-center gap-2">
                        {block.approved === 1 && <span title="Сохранено">✅</span>}
                        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => generateContent.mutate({ action: "regenerate_block", data: { blockIndex: i, blocks: strategyBlocks } })}>
                          🔄 Перегенерировать
                        </button>
                      </div>
                    </div>
                    <textarea
                      className="input" rows={6}
                      value={block.content || ""}
                      onChange={(e) => {
                        if (!currentPlatformId) return;
                        updatePlatformData(currentPlatformId, (prev: any) => {
                          const next = [...prev.blocks];
                          next[i] = { ...next[i], content: e.target.value };
                          return { ...prev, blocks: next };
                        });
                      }}
                      style={{ fontFamily: "inherit", fontSize: 13, lineHeight: 1.6 }}
                    />
                    <div className="flex items-center gap-4" style={{ marginTop: 8 }}>
                      <button className="btn btn-primary" style={{ fontSize: 11, padding: "4px 12px" }} onClick={async () => {
                        if (!block.id) {
                          setError("Сначала сгенерируйте стратегию и сохраните её кнопкой выше");
                          return;
                        }
                        try {
                          await api.strategy.update(block.id, { manualContent: block.content, approved: 1, platformId: currentPlatformId });
                          if (currentPlatformId) {
                            updatePlatformData(currentPlatformId, (prev: any) => ({
                              ...prev,
                              blocks: prev.blocks.map((x: any) => x.id === block.id ? { ...x, approved: 1 } : x),
                            }));
                          }
                          setError(null);
                        } catch (err: any) {
                          setError(err?.message || "Ошибка сохранения блока");
                        }
                      }}>💾 Сохранить блок</button>
                      <span className="text-xs text-dim">или редактируйте прямо в поле</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-dim" style={{ textAlign: "center", padding: 40 }}>
                Нажмите «Сгенерировать стратегию», импортируйте файл или напишите в чате
              </div>
            )}
          </div>
        )}

        {/* Step 2: Funnels */}
        {step === 2 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 style={{ fontSize: 18, marginBottom: 4 }}>Воронки продаж</h3>
                <p className="text-sm text-dim">Выберите системную воронку или свободный контент</p>
              </div>
              <button className="btn btn-ghost" onClick={() => navigate("/free-content")} style={{ fontSize: 13 }}>
                🌊 Свободный контент
              </button>
            </div>

            {recommendLoading && (
              <div className="card" style={{ padding: 16, marginBottom: 16, background: "rgba(99,102,241,0.05)", border: "1px dashed var(--accent)" }}>
                <div className="flex items-center gap-3">
                  <div className="spinner-sm" />
                  <span className="text-sm">AI анализирует проект и подбирает лучшие воронки...</span>
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {(allFunnels || []).map((f: any) => {
                const recommendation = recommendedFunnels.find((r) => r.id === f.id);
                const isSelected = currentFunnelId === f.id;
                
                return (
                  <div 
                    key={f.id} 
                    className="card"
                    onClick={() => {
                      if (!currentPlatformId) return;
                      updatePlatformData(currentPlatformId, (p) => ({ ...p, selectedFunnelId: f.id }));
                      api.platforms.update(currentPlatformId, { currentFunnelId: f.id });
                    }}
                    style={{ 
                      padding: 16, cursor: "pointer", position: "relative",
                      border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border)",
                      opacity: recommendLoading && !recommendation ? 0.6 : 1,
                      transition: "all 0.2s"
                    }}
                  >
                    {recommendation && (
                      <div style={{ 
                        position: "absolute", top: -10, right: 10, background: "#22c55e", 
                        color: "white", fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700 
                      }}>
                        РЕКОМЕНДОВАНО
                      </div>
                    )}
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: isSelected ? "var(--accent)" : "inherit" }}>{f.name}</div>
                    <div className="text-xs text-dim" style={{ lineHeight: 1.4, marginBottom: 8 }}>{f.description}</div>
                    {recommendation && (
                      <div style={{ fontSize: 11, color: "#22c55e", background: "rgba(34,197,94,0.1)", padding: "6px 8px", borderRadius: 4 }}>
                        💡 {recommendation.reason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3: Content plan */}
        {step === 3 && (
          <div>
            <h3 style={{ fontSize: 18, marginBottom: 12 }}>Контент‑план по неделям</h3>
            <p className="text-sm text-dim" style={{ marginBottom: 16 }}>
              {(() => {
                const fn = allFunnels?.find((f: any) => f.id === activeFunnelId)?.name;
                return fn ? `Генерация плана на основе воронки: ${fn}` : "Генерация свободного контента на основе стратегии";
              })()}
            </p>
            <div className="flex gap-4 mb-4">
              <button 
                className="btn btn-primary" 
                onClick={async () => {
                  setError(null);
                  const genFunnelId = allFunnels?.find((f: any) => f.id === activeFunnelId) ? activeFunnelId : null;

                  // Check if funnel already has planned posts
                  if (genFunnelId) {
                    try {
                      const check = await (await fetch(`/api/posts?projectId=${projectId}&platformId=${currentPlatformId}&funnelId=${genFunnelId}&status=planned`)).json();
                      if (Array.isArray(check) && check.length > 0) {
                        setExistingPostCount(check.length);
                        setPendingFunnelId(genFunnelId);
                        return; // show dialog instead
                      }
                    } catch {}
                  }

                  // No existing posts — generate directly
                  setAiImporting(true);
                  try {
                    const res = await fetch("/api/generate/week-plan", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ projectId, platformId: currentPlatformId, funnelId: genFunnelId, ideas, mode: "append" }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Ошибка генерации");
                    queryClient.invalidateQueries({ queryKey: ["posts"] });
                    queryClient.invalidateQueries({ queryKey: ["platform-posts"] });
                    queryClient.invalidateQueries({ queryKey: ["free-posts"] });
                    queryClient.invalidateQueries({ queryKey: ["funnel-posts"] });
                  } catch (err: any) {
                    setError(err?.message || "Ошибка генерации контент‑плана");
                  } finally { setAiImporting(false); }
                }}
                disabled={aiImporting}
              >
                {aiImporting ? "⏳ Генерация..." : "Сгенерировать план"}
              </button>
              <button className="btn btn-ghost" onClick={() => navigate("/calendar")}>
                Открыть календарь
              </button>
            </div>

            {/* Dialog для повторного использования воронки */}
            {pendingFunnelId && existingPostCount > 0 && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                <div style={{ background: "var(--bg)", borderRadius: 12, padding: 28, maxWidth: 440, width: "90%", boxShadow: "0 8px 40px rgba(0,0,0,0.3)" }}>
                  <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>Воронка уже используется</h3>
                  <p className="text-sm text-dim" style={{ marginBottom: 20 }}>
                    У воронки <strong>{allFunnels?.find((f: any) => f.id === pendingFunnelId)?.name}</strong> уже {existingPostCount} запланированных постов. Что делаем?
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button className="btn btn-primary" style={{ justifyContent: "center" }} onClick={async () => {
                      setAiImporting(true);
                      setPendingFunnelId(null);
                      try {
                        const res = await fetch("/api/generate/week-plan", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ projectId, platformId: currentPlatformId, funnelId: pendingFunnelId, ideas, mode: "append" }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || "Ошибка генерации");
                        queryClient.invalidateQueries({ queryKey: ["posts"] });
                        queryClient.invalidateQueries({ queryKey: ["platform-posts"] });
                        queryClient.invalidateQueries({ queryKey: ["free-posts"] });
                        queryClient.invalidateQueries({ queryKey: ["funnel-posts"] });
                      } catch (err: any) {
                        setError(err?.message || "Ошибка генерации контент‑плана");
                      } finally { setAiImporting(false); }
                    }} disabled={aiImporting}>
                      ➕ Добавить новую неделю
                    </button>
                    <button className="btn" style={{ justifyContent: "center", borderColor: "#e68a2e", color: "#e68a2e" }} onClick={async () => {
                      setAiImporting(true);
                      setPendingFunnelId(null);
                      try {
                        const res = await fetch("/api/generate/week-plan", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ projectId, platformId: currentPlatformId, funnelId: pendingFunnelId, ideas, mode: "replace" }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || "Ошибка генерации");
                        queryClient.invalidateQueries({ queryKey: ["posts"] });
                        queryClient.invalidateQueries({ queryKey: ["platform-posts"] });
                        queryClient.invalidateQueries({ queryKey: ["free-posts"] });
                        queryClient.invalidateQueries({ queryKey: ["funnel-posts"] });
                      } catch (err: any) {
                        setError(err?.message || "Ошибка генерации контент‑плана");
                      } finally { setAiImporting(false); }
                    }} disabled={aiImporting}>
                      🔄 Пересоздать план (удалить старые посты)
                    </button>
                    <button className="btn btn-ghost" style={{ justifyContent: "center" }} onClick={() => { setStep(2); setPendingFunnelId(null); }}>
                      ➕ Создать новую воронку
                    </button>
                    <button className="btn btn-ghost" style={{ justifyContent: "center", color: "var(--text-dim)" }} onClick={() => { setPendingFunnelId(null); setExistingPostCount(0); }}>
                      Отмена
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Вкладки воронок: выбранная в БД или с постами */}
            {(() => {
              const dbSelectedFunnelId = dbPlatforms?.find((pl: any) => pl.id === currentPlatformId)?.currentFunnelId || null;
              const filtered = (allFunnels || []).filter(f =>
                dbSelectedFunnelId === f.id ||
                posts?.some(p => p.funnelId === f.id)
              );
              if (!activeFunnelId && filtered.length > 0) {
                setActiveFunnelId(filtered[0].id);
              }
              return filtered.length === 0 ? null : (
                <>
                  <div className="flex gap-2 mb-3" style={{ overflowX: "auto", paddingBottom: 4 }}>
                    {filtered.map(f => (
                      <button
                        key={f.id}
                        className={`btn ${activeFunnelId === f.id ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => {
                          setActiveFunnelId(f.id);
                          if (currentPlatformId) {
                            updatePlatformData(currentPlatformId, (p: any) => ({ ...p, selectedFunnelId: f.id }));
                            api.platforms.update(currentPlatformId, { currentFunnelId: f.id });
                          }
                        }}
                        style={{ fontSize: 12, padding: "4px 8px", whiteSpace: "nowrap" }}
                      >
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: f.color || "var(--accent)", marginRight: 4 }} />
                        {f.name}
                      </button>
                    ))}
                  </div>
                  {filtered.map(f => (
                    activeFunnelId === f.id && (
                      <FunnelContent
                        key={f.id}
                        projectId={projectId!}
                        platformId={currentPlatformId!}
                        funnel={f}
                        queryClient={queryClient}
                      />
                    )
                  ))}
                </>
              );
            })()}

            {/* Свободный контент — посты без воронки */}
            {freePosts && freePosts.length > 0 && (
              <div className="card" style={{ marginTop: 16 }}>
                <div className="card-header">
                  <span className="card-title">🌊 Свободный контент</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-dim">{freePosts.length} постов</span>
                    <AttachFunnelButton
                      projectId={projectId!}
                      platformId={currentPlatformId!}
                      freePosts={freePosts}
                      allFunnels={allFunnels || []}
                      queryClient={queryClient}
                    />
                  </span>
                </div>
                <PlannedPosts projectId={projectId!} platformId={currentPlatformId!} queryClient={queryClient} posts={freePosts} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between" style={{ marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={prevStep} disabled={step === 0}>← Назад</button>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={async () => {
            if (!projectId) {
              const project = await createProject.mutateAsync();
              setProjectId(project.id);
            }
            setShowChat(!showChat);
          }}>
            {showChat ? "✕ Закрыть чат" : "💬 Открыть чат с AI"}
          </button>
          <button className="btn btn-primary" onClick={nextStep} disabled={(STEPS[step]?.key === "funnels" && !currentFunnelId) || step === STEPS.length - 1}>
            {step === STEPS.length - 1 ? "Завершено ✓" : "Далее →"}
          </button>
        </div>
      </div>

      {/* Chat panel */}
      {showChat && projectId && (
        <ChatPanel projectId={projectId} contextStep={chatContext} forceOpen={true}
          onClose={() => setShowChat(false)}
          pageContext={`Стратегия, шаг «${chatContext}»`} />
      )}
    </div>
  );
}

function FunnelContent({ projectId, platformId, funnel, queryClient }: { projectId: string; platformId: string; funnel: any; queryClient: any }) {
  const [isShifting, setIsShifting] = useState(false);
  const { data: posts } = useQuery({
    queryKey: ["funnel-posts", projectId, platformId, funnel.id],
    queryFn: () => api.posts.list({ projectId, platformId, funnelId: funnel.id }),
  });

  const handleShift = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    if (!newDate) return;
    setIsShifting(true);
    try {
      await fetch("/api/generate/shift-funnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, platformId, funnelId: funnel.id, startDate: newDate }),
      });
      queryClient.invalidateQueries({ queryKey: ["funnel-posts"] });
      queryClient.invalidateQueries({ queryKey: ["platform-posts"] });
      queryClient.invalidateQueries({ queryKey: ["free-posts"] });
    } catch (e) { console.error(e); }
    finally { setIsShifting(false); }
  };

  const sortedPosts = [...(posts || [])].sort((a, b) => (a.scheduledDate || "").localeCompare(b.scheduledDate || ""));
  const firstDate = sortedPosts.length > 0 ? sortedPosts[0].scheduledDate || "" : "";

  return (
    <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span style={{ width: 14, height: 14, borderRadius: 7, background: funnel.color || "var(--accent)", display: "inline-block" }} />
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{funnel.name}</h4>
          <span className="text-xs text-dim">{sortedPosts.length} постов</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-dim">Дата старта:</span>
          <input type="date" className="input" style={{ fontSize: 12, padding: "2px 8px" }} value={firstDate} onChange={handleShift} disabled={isShifting} />
          {isShifting && <span className="text-xs text-dim">⏳</span>}
        </div>
      </div>
      {sortedPosts.length > 0 ? (
        <div className="flex flex-col gap-1">
          {sortedPosts.map((p: any) => (
            <Link key={p.id} to={`/posts/${p.id}`} className="flex items-center justify-between gap-3" style={{
              padding: "8px 12px", textDecoration: "none", color: "inherit",
              background: "var(--bg-hover)", borderRadius: 6,
              borderLeft: `3px solid ${funnel.color || 'var(--accent)'}`,
            }}>
              <div className="flex items-center gap-3" style={{ minWidth: 0, flex: 1 }}>
                <DateBadge date={p.scheduledDate} />
                <span style={{ fontSize: 13, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="tag" style={{ fontSize: 10 }}>{p.contentTypeCode || (p.contentTypeName?.slice(0, 4)) || "post"}</span>
                <StatusBadge status={p.status || "planned"} />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-sm text-dim" style={{ padding: "20px 0", textAlign: "center" }}>
          ⚪ Нет постов в этой воронке. Нажми «➕ Генерировать план» чтобы создать.
        </div>
      )}
    </div>
  );
}

function AttachFunnelButton({ projectId, platformId, freePosts, allFunnels, queryClient }: {
  projectId: string; platformId: string; freePosts: any[]; allFunnels: any[]; queryClient: any;
}) {
  const [open, setOpen] = useState(false);
  const [attaching, setAttaching] = useState(false);

  const attach = async (funnelId: string) => {
    setAttaching(true);
    try {
      for (const post of freePosts) {
        await api.posts.update(post.id, { funnelId });
      }
      queryClient.invalidateQueries({ queryKey: ["platform-posts"] });
      queryClient.invalidateQueries({ queryKey: ["free-posts"] });
      queryClient.invalidateQueries({ queryKey: ["funnel-posts"] });
      setOpen(false);
    } catch (e) {
      console.error(e);
    } finally {
      setAttaching(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn btn-ghost"
        style={{ fontSize: 11, padding: "2px 10px" }}
        onClick={() => setOpen(!open)}
      >
        📎 Привязать к воронке
      </button>
      {open && (
        <div style={{
          position: "absolute", right: 0, top: "100%", zIndex: 10,
          background: "var(--card-bg)", border: "1px solid var(--border)",
          borderRadius: 8, padding: 4, minWidth: 220, marginTop: 4,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          <div className="text-xs text-dim" style={{ padding: "6px 8px" }}>
            Привязать {freePosts.length} {freePosts.length === 1 ? "пост" : "постов"} к воронке:
          </div>
          {allFunnels.filter((f: any) => f.active).map(f => (
            <button
              key={f.id}
              className="btn btn-ghost"
              style={{ fontSize: 12, width: "100%", justifyContent: "flex-start", padding: "6px 8px" }}
              onClick={() => attach(f.id)}
              disabled={attaching}
            >
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: f.color || "var(--accent)", marginRight: 8 }} />
              {f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
