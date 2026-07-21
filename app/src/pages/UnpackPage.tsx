import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getStoredProjectId, setStoredProjectId } from "../lib/project";
import { PLATFORM_OPTIONS, PLATFORM_COLORS } from "../lib/constants";
import { useNavigate } from "react-router-dom";
import BrandInterview from "../components/BrandInterview";

type OnboardingStepType =
  | "scenario"
  | "materials"
  | "competitors"
  | "audience"
  | "hant"
  | "value_prop"
  | "products"
  | "platforms"
  | "complete";

const STEPS: { key: OnboardingStepType; label: string; number: number }[] = [
  { key: "scenario", label: "Сценарий", number: 1 },
  { key: "materials", label: "Материалы", number: 2 },
  { key: "competitors", label: "Конкуренты", number: 3 },
  { key: "audience", label: "ЦА", number: 4 },
  { key: "hant", label: "Лестница Ханта", number: 5 },
  { key: "value_prop", label: "Ценность", number: 6 },
  { key: "products", label: "Продукты", number: 7 },
  { key: "platforms", label: "Площадки", number: 8 },
  { key: "complete", label: "Итог", number: 9 },
];

const HANT_STAGES = [
  { stage: 1, label: "Не знает о проблеме", temperature: "cold" },
  { stage: 2, label: "Осознаёт, ничего не делает", temperature: "cold" },
  { stage: 3, label: "Ищет решение", temperature: "warm" },
  { stage: 4, label: "Выбирает среди решений", temperature: "warm" },
  { stage: 5, label: "Выбирает поставщика", temperature: "warm" },
  { stage: 6, label: "Сомневается в себе", temperature: "hot" },
  { stage: 7, label: "Пробный период", temperature: "hot" },
  { stage: 8, label: "Оплата и пользование", temperature: "retained" },
  { stage: 9, label: "Повторные взаимодействия", temperature: "retained" },
];

const SAVE_KEY = "unpack-wizard-state";

export default function UnpackPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState<string | null>(() => {
    try { return getStoredProjectId() || null; } catch { return null; }
  });
  const [stepIdx, setStepIdx] = useState(() => {
    try { return parseInt(sessionStorage.getItem(`${SAVE_KEY}_step`) || "0"); } catch { return 0; }
  });
  const [scenario, setScenario] = useState<string | null>(() => {
    try { return sessionStorage.getItem(`${SAVE_KEY}_scenario`) || null; } catch { return null; }
  });
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [error]);

  const step = STEPS[stepIdx]?.key || "scenario";

  useEffect(() => {
    try { sessionStorage.setItem(`${SAVE_KEY}_step`, String(stepIdx)); } catch {}
  }, [stepIdx]);
  useEffect(() => {
    if (scenario) try { sessionStorage.setItem(`${SAVE_KEY}_scenario`, scenario); } catch {}
  }, [scenario]);

  const { data: allProjects } = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });

  function clearWizardState() {
    setUnpackKnowledgeCount(0);
    setImportIdentifier("");
    setImportResult(null);
    setImportError(null);
    setImportDescription("");
    setGeneratedKeywords([]);
    setKeywordsEditMode(false);
    setKeywordsEdits({});
    const keys = [
      "unpackKnowledgeCount", "importIdentifier", "importResult",
      "importError", "importDescription", "generatedKeywords",
      "keywordsEditMode", "keywordsEdits",
    ];
    for (const k of keys) {
      try { sessionStorage.removeItem(`${SAVE_KEY}_${k}`); } catch {}
    }
  }

  const createProject = useMutation({
    mutationFn: () => api.projects.create({ name: "Новый проект" }),
    onSuccess: (project) => {
      clearWizardState();
      setProjectId(project.id);
      setStoredProjectId(project.id);
    },
  });

  const ensureProject = async (): Promise<string> => {
    if (projectId) {
      if (allProjects) {
        if (allProjects.some((p: any) => p.id === projectId)) return projectId;
        setProjectId(null);
      } else {
        try { const res = await fetch(`/api/projects/${projectId}`); if (res.ok) return projectId; } catch {}
        setProjectId(null);
      }
    }
    const project = await createProject.mutateAsync();
    return project.id;
  };

  const nextStep = () => {
    if (!isStepComplete(STEPS[stepIdx].key)) return;
    if (stepIdx < STEPS.length - 1) setStepIdx(stepIdx + 1);
  };

  const prevStep = () => {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  };

  const goToStep = (idx: number) => {
    if (idx >= 0 && idx < STEPS.length) setStepIdx(idx);
  };

  // ── Materials state (persisted to sessionStorage) ──
  function ss<T>(key: string, fallback: T): T {
    try { const v = sessionStorage.getItem(`${SAVE_KEY}_${key}`); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  const [unpackTab, setUnpackTab] = useState(() => ss("unpackTab", "files"));
  const [unpackLoading, setUnpackLoading] = useState(false);
  const [unpackKnowledgeCount, setUnpackKnowledgeCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkSaved, setLinkSaved] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [fileSaved, setFileSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [generatedKeywords, setGeneratedKeywords] = useState<any[]>([]);
  const [keywordsLoading, setKeywordsLoading] = useState(false);
  const [keywordsEditMode, setKeywordsEditMode] = useState(false);
  const [keywordsEdits, setKeywordsEdits] = useState<Record<string, string>>({});
  const [keywordsSaving, setKeywordsSaving] = useState(false);

  const [importPlatform, setImportPlatform] = useState(() => ss("importPlatform", "telegram"));
  const [importIdentifier, setImportIdentifier] = useState("");
  const [importDescription, setImportDescription] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Persist only UI preferences to sessionStorage (NOT project data)
  const persist = (key: string, value: any) => { try { sessionStorage.setItem(`${SAVE_KEY}_${key}`, JSON.stringify(value)); } catch {} };
  useEffect(() => { persist("unpackTab", unpackTab); }, [unpackTab]);
  useEffect(() => { persist("importPlatform", importPlatform); }, [importPlatform]);

  const createKnowledge = useMutation({
    mutationFn: async (data: any) => {
      const pid = await ensureProject();
      return api.knowledge.create({ ...data, projectId: pid });
    },
    onSuccess: (_, variables) => {
      setUnpackKnowledgeCount((c) => c + 1);
      queryClient.invalidateQueries({ queryKey: ["knowledge-stats", projectId] });
      queryClient.invalidateQueries({ queryKey: ["knowledge", projectId] });
      if (variables.type === "link") {
        setLinkSaved(true);
        setTimeout(() => setLinkSaved(false), 3000);
      } else if (variables.type === "note") {
        setNoteSaved(true);
        setTimeout(() => setNoteSaved(false), 3000);
      }
    },
  });

  function formatFileSize(bytes: number): string {
    if (!bytes) return "0 Б";
    const units = ["Б", "КБ", "МБ", "ГБ"];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      const pid = await ensureProject();
      const fd = new FormData();
      fd.append("file", file);
      fd.append("projectId", pid);
      return api.knowledge.upload(fd);
    },
    onSuccess: () => {
      setUnpackKnowledgeCount((c) => c + 1);
      queryClient.invalidateQueries({ queryKey: ["knowledge-stats", projectId] });
      queryClient.invalidateQueries({ queryKey: ["knowledge", projectId] });
      setFileSaved(true);
      setTimeout(() => setFileSaved(false), 3000);
    },
  });

  const deleteKnowledgeFile = useMutation({
    mutationFn: (id: string) => api.knowledge.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-stats", projectId] });
      queryClient.invalidateQueries({ queryKey: ["knowledge", projectId] });
    },
  });

  const handleGenerateKeywords = async () => {
    setKeywordsLoading(true);
    try {
      const pid = await ensureProject();
      const res = await fetch(`/api/onboarding/${pid}/generate-keywords`, { method: "POST" });
      if (!res.ok) {
        let msg = "Keyword generation failed";
        try { const err = await res.json(); if (err.error) msg = err.error; } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      setGeneratedKeywords(data);
      queryClient.invalidateQueries({ queryKey: ["onboarding-status", projectId] });
    } catch (err: any) {
      setError(err?.message || "Ошибка генерации ключевых слов");
    } finally {
      setKeywordsLoading(false);
    }
  };

  const handleSaveKeywords = async () => {
    setKeywordsSaving(true);
    try {
      const pid = await ensureProject();
      const items: { keyword: string; source: string }[] = [];
      for (const [group, text] of Object.entries(keywordsEdits)) {
        for (const kw of text.split(",").map((s) => s.trim()).filter(Boolean)) {
          items.push({ keyword: kw, source: `manual:${group}` });
        }
      }
      await api.keywords.createBulk(pid, items, true);
      const structured = items.map((item) => ({
        keyword: item.keyword,
        group: item.source.replace("manual:", ""),
        source: item.source,
      }));
      setGeneratedKeywords(structured);
      setKeywordsEditMode(false);
      await fetch(`/api/onboarding/${pid}/step/materials`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done", aiOutput: JSON.stringify(structured) }),
      });
      queryClient.invalidateQueries({ queryKey: ["onboarding-status", projectId] });
    } catch (err: any) {
      setError(err?.message || "Ошибка сохранения ключевых слов");
    } finally {
      setKeywordsSaving(false);
    }
  };

  // ── Competitors state ──
  const [competitorUrls, setCompetitorUrls] = useState<string[]>([""]);
  const [competitorKeywordsText, setCompetitorKeywordsText] = useState("");
  const [competitorResult, setCompetitorResult] = useState<any>(null);
  const [competitorLoading, setCompetitorLoading] = useState(false);
  const [competitorEdit, setCompetitorEdit] = useState(false);
  const [competitorShowPrompt, setCompetitorShowPrompt] = useState(false);
  const [competitorPromptEdit, setCompetitorPromptEdit] = useState("");
  const [competitorLastPrompt, setCompetitorLastPrompt] = useState("");
  const [savedCompetitors, setSavedCompetitors] = useState<any[]>([]);
  const [savedCompetitorsLoading, setSavedCompetitorsLoading] = useState(false);
  const [analyzeUrlsLoading, setAnalyzeUrlsLoading] = useState(false);
  const [analyzeUrlsResult, setAnalyzeUrlsResult] = useState<string | null>(null);

  // Auto-fill keywords textarea from generatedKeywords when entering competitors step
  const prevStepRef = useRef(step);
  useEffect(() => {
    if (step === "competitors" && prevStepRef.current !== "competitors" && !competitorKeywordsText && generatedKeywords.length > 0) {
      const allKws = generatedKeywords.map((kw: any) => kw.keyword).filter(Boolean);
      setCompetitorKeywordsText([...new Set(allKws)].join(", "));
    }
    prevStepRef.current = step;
  }, [step, generatedKeywords]);

  // Load latest competitor result and accumulated saved competitors when entering competitors step
  useEffect(() => {
    if (step === "competitors" && projectId) {
      if (!competitorResult) {
        api.competitors.getLatest(projectId).then((data) => {
          if (data) setCompetitorResult(data);
        }).catch(() => {});
      }
      // Load all accumulated saved competitors
      setSavedCompetitorsLoading(true);
      api.competitors.getSaved(projectId).then((data) => {
        setSavedCompetitors(data || []);
        setSavedCompetitorsLoading(false);
      }).catch(() => {
        setSavedCompetitors([]);
        setSavedCompetitorsLoading(false);
      });
    }
  }, [step, projectId]);

  const analyzeCompetitorUrls = useMutation({
    mutationFn: async () => {
      const pid = await ensureProject();
      const urls = competitorUrls.filter((u) => u.trim());
      if (urls.length === 0) throw new Error("Нет URL для анализа");
      return api.competitors.analyzeUrl(pid, urls);
    },
    onSuccess: (data) => {
      const saved = data.saved || 0;
      const skipped = data.skipped || 0;
      const parts: string[] = [];
      if (saved > 0) parts.push(`✅ Сохранено: ${saved}`);
      if (skipped > 0) parts.push(`⏭ Пропущено (уже есть): ${skipped}`);
      setAnalyzeUrlsResult(parts.join(" • ") || "Готово");
      setCompetitorUrls([""]);
      if (projectId) {
        api.competitors.getSaved(projectId).then(setSavedCompetitors).catch(() => {});
      }
    },
    onError: (err: any) => setAnalyzeUrlsResult(`❌ ${err?.message || "Ошибка анализа"}`),
    onSettled: () => setAnalyzeUrlsLoading(false),
  });

  const analyzeCompetitors = useMutation({
    mutationFn: async () => {
      const pid = await ensureProject();
      const urls = competitorUrls.filter((u) => u.trim());
      const kws = competitorKeywordsText.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
      return api.competitors.search(pid, { urls, keywords: kws });
    },
    onSuccess: (data) => {
      setCompetitorResult(data);
      queryClient.invalidateQueries({ queryKey: ["onboarding-status", projectId] });
      // Refresh saved competitors list after new search
      if (projectId) {
        api.competitors.getSaved(projectId).then((savedData) => {
          setSavedCompetitors(savedData || []);
        }).catch(() => {});
      }
    },
    onError: (err: any) => setError(err?.message || "Competitor analysis failed"),
  });

  // ── Audience state (deep analysis) ──
  const [audienceGeneratedPrompt, setAudienceGeneratedPrompt] = useState("");
  const [audienceEditedPrompt, setAudienceEditedPrompt] = useState("");
  const [audienceResult, setAudienceResult] = useState<any>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [audienceShowPrompt, setAudienceShowPrompt] = useState(false);
  const [audienceLastPrompt, setAudienceLastPrompt] = useState("");
  const [audienceEditing, setAudienceEditing] = useState<{ gi: number; field: string } | null>(null);
  const [audienceEditBuffer, setAudienceEditBuffer] = useState("");
  const [audienceSaving, setAudienceSaving] = useState(false);

  const loadAudiencePrompt = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.onboarding.getAudiencePrompt(projectId);
      setAudienceGeneratedPrompt(data.prompt);
      setAudienceEditedPrompt(data.prompt);
    } catch (err: any) {
      setError(err?.message || "Failed to load audience prompt");
    }
  }, [projectId]);

  // Load prompt when entering audience step
  useEffect(() => {
    if (step === "audience" && projectId && !audienceGeneratedPrompt) {
      loadAudiencePrompt();
    }
  }, [step, projectId, audienceGeneratedPrompt, loadAudiencePrompt]);

  const generateAudienceDeep = useMutation({
    mutationFn: async () => {
      const pid = await ensureProject();
      const override = audienceEditedPrompt !== audienceGeneratedPrompt ? audienceEditedPrompt : undefined;
      return api.onboarding.generateAudienceDeep(pid, override);
    },
    onSuccess: (data) => {
      if (data.promptUsed) setAudienceLastPrompt(data.promptUsed);
      setAudienceResult(data.result || data);
      setAudienceEditing(null);
      queryClient.invalidateQueries({ queryKey: ["onboarding-status", projectId] });
    },
    onError: (err: any) => setError(err?.message || "Deep audience analysis failed"),
  });

  const saveAudienceResult = useMutation({
    mutationFn: async () => {
      const pid = await ensureProject();
      return api.onboarding.saveAudience(pid, audienceResult);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-status", projectId] });
    },
    onError: (err: any) => setError(err?.message || "Save failed"),
  });

  const startEditing = (gi: number, field: string, currentValue: string) => {
    setAudienceEditing({ gi, field });
    setAudienceEditBuffer(currentValue);
  };

  const cancelEditing = () => {
    setAudienceEditing(null);
    setAudienceEditBuffer("");
  };

  const confirmEditing = () => {
    if (!audienceEditing) return;
    const { gi, field } = audienceEditing;
    setAudienceResult((prev: any) => {
      if (!prev?.groups) return prev;
      const groups = [...prev.groups];
      const group = { ...groups[gi] };
      // Try to parse as JSON array if value looks like one
      const trimmed = audienceEditBuffer.trim();
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        try { group[field] = JSON.parse(trimmed); } catch { group[field] = trimmed; }
      } else if (field === "socialFactors") {
        try { group[field] = JSON.parse(trimmed); } catch { group[field] = trimmed; }
      } else {
        group[field] = trimmed;
      }
      groups[gi] = group;
      return { ...prev, groups };
    });
    setAudienceEditing(null);
    setAudienceEditBuffer("");
  };

  const renderEditableField = (gi: number, field: string, label: string, value: any) => {
    const isEditing = audienceEditing?.gi === gi && audienceEditing?.field === field;
    const displayValue = Array.isArray(value) ? value.join("\n") : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value || "");

    return (
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
          <div style={{ flex: 1 }}>
            <SectionLabel label={label} />
            {isEditing ? (
              <div>
                <textarea
                  className="input"
                  style={{ fontSize: 12, fontFamily: "monospace", width: "100%", minHeight: 60 }}
                  value={audienceEditBuffer}
                  onChange={(e) => setAudienceEditBuffer(e.target.value)}
                  rows={Array.isArray(value) ? Math.max(value.length + 1, 3) : 3}
                />
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  <button className="btn btn-primary" style={{ fontSize: 10, padding: "2px 10px" }} onClick={confirmEditing}>Ок</button>
                  <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 10px" }} onClick={cancelEditing}>✕</button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                {Array.isArray(value) ? value.map((item: string, j: number) => <div key={j}>• {item}</div>)
                : typeof value === "object" ? <pre style={{ fontSize: 11, margin: 0, whiteSpace: "pre-wrap" }}>{displayValue}</pre>
                : <span>{displayValue}</span>}
              </div>
            )}
          </div>
          {!isEditing && (
            <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 6px", flexShrink: 0 }} onClick={() => startEditing(gi, field, displayValue)}>✏️</button>
          )}
        </div>
      </div>
    );
  };

  // ── Hant state (multi-group) ──
  const [hantData, setHantData] = useState<any[]>([]);
  const [hantActiveGroup, setHantActiveGroup] = useState(0);
  const [hantEditingStage, setHantEditingStage] = useState<{ ji: number; si: number; field: string } | null>(null);
  const [hantEditBuffer, setHantEditBuffer] = useState("");
  const [hantSaving, setHantSaving] = useState(false);

  const generateHant = useMutation({
    mutationFn: async () => {
      const pid = await ensureProject();
      return api.onboarding.generateHantMulti(pid);
    },
    onSuccess: (data) => {
      setHantData(Array.isArray(data) ? data : []);
      setHantActiveGroup(0);
      queryClient.invalidateQueries({ queryKey: ["onboarding-status", projectId] });
    },
    onError: (err: any) => setError(err?.message || "Hant analysis failed"),
  });

  const saveHantResult = useMutation({
    mutationFn: async () => {
      const pid = await ensureProject();
      return api.onboarding.saveHant(pid, hantData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-status", projectId] });
    },
    onError: (err: any) => setError(err?.message || "Save failed"),
  });

  const startHantEdit = (ji: number, si: number, field: string, value: string) => {
    setHantEditingStage({ ji, si, field });
    setHantEditBuffer(value);
  };

  const cancelHantEdit = () => {
    setHantEditingStage(null);
    setHantEditBuffer("");
  };

  const confirmHantEdit = () => {
    if (!hantEditingStage) return;
    const { ji, si, field } = hantEditingStage;
    setHantData((prev: any[]) => {
      const next = [...prev];
      const journey = { ...next[ji] };
      if (!journey.stages) return prev;
      const stages = [...journey.stages];
      const stage = { ...stages[si] };
      const trimmed = hantEditBuffer.trim();
      if (field === "touchpoints") {
        try { stage[field] = JSON.parse(trimmed); } catch { stage[field] = [trimmed]; }
      } else {
        stage[field] = trimmed;
      }
      stages[si] = stage;
      journey.stages = stages;
      next[ji] = journey;
      return next;
    });
    setHantEditingStage(null);
    setHantEditBuffer("");
  };

  const renderHantStageField = (ji: number, si: number, field: string, label: string, value: any) => {
    const isEditing = hantEditingStage?.ji === ji && hantEditingStage?.si === si && hantEditingStage?.field === field;
    const displayValue = Array.isArray(value) ? value.join(", ") : String(value || "");

    return (
      <div style={{ marginBottom: 2 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 11 }}>{label}:</strong>
            {isEditing ? (
              <div>
                <textarea
                  className="input"
                  style={{ fontSize: 11, fontFamily: "monospace", width: "100%", minHeight: 40 }}
                  value={hantEditBuffer}
                  onChange={(e) => setHantEditBuffer(e.target.value)}
                  rows={2}
                />
                <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                  <button className="btn btn-primary" style={{ fontSize: 10, padding: "1px 8px" }} onClick={confirmHantEdit}>Ок</button>
                  <button className="btn btn-ghost" style={{ fontSize: 10, padding: "1px 8px" }} onClick={cancelHantEdit}>✕</button>
                </div>
              </div>
            ) : (
              <span style={{ fontSize: 11 }}>{displayValue}</span>
            )}
          </div>
          {!isEditing && (
            <button className="btn btn-ghost" style={{ fontSize: 9, padding: "1px 4px", flexShrink: 0 }} onClick={() => startHantEdit(ji, si, field, displayValue)}>✏️</button>
          )}
        </div>
      </div>
    );
  };

  // ── Value prop state ──
  const [valuePropResult, setValuePropResult] = useState<any>(null);
  const [valuePropLoading, setValuePropLoading] = useState(false);
  const [vpEditing, setVpEditing] = useState<string | null>(null);
  const [vpEditBuffer, setVpEditBuffer] = useState("");

  const generateValueProp = useMutation({
    mutationFn: async () => {
      const pid = await ensureProject();
      const res = await fetch(`/api/onboarding/${pid}/generate-value-prop`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate value prop");
      return res.json();
    },
    onSuccess: (data) => {
      setValuePropResult(data);
      queryClient.invalidateQueries({ queryKey: ["onboarding-status", projectId] });
    },
    onError: (err: any) => setError(err?.message || "Value prop generation failed"),
  });

  // ── Products state ──
  const [productsResult, setProductsResult] = useState<any[]>([]);
  const [productsDeletedIds, setProductsDeletedIds] = useState<string[]>([]);
  const [productsSaving, setProductsSaving] = useState(false);
  const [productsSaved, setProductsSaved] = useState(false);
  const [productsEditing, setProductsEditing] = useState<{ i: number; field: string } | null>(null);
  const [productsEditBuffer, setProductsEditBuffer] = useState("");

  const generateProducts = useMutation({
    mutationFn: async () => {
      const pid = await ensureProject();
      const res = await fetch(`/api/onboarding/${pid}/generate-products`, { method: "POST" });
      if (!res.ok) {
        let msg = "Failed to generate products";
        try { const err = await res.json(); if (err.error) msg = err.error; } catch {}
        throw new Error(msg);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setProductsResult((prev) => {
        const map = new Map(prev.map((p) => [p.id, p]));
        for (const p of data) map.set(p.id, p);
        return Array.from(map.values());
      });
      queryClient.invalidateQueries({ queryKey: ["onboarding-status", projectId] });
      queryClient.invalidateQueries({ queryKey: ["products", projectId] });
    },
    onError: (err: any) => setError(err?.message || "Product generation failed"),
  });

  const startProductsEdit = (i: number, field: string, value: string) => {
    setProductsEditing({ i, field });
    setProductsEditBuffer(value);
  };

  const cancelProductsEdit = () => {
    setProductsEditing(null);
    setProductsEditBuffer("");
  };

  const confirmProductsEdit = () => {
    if (!productsEditing) return;
    const { i, field } = productsEditing;
    setProductsResult((prev) => {
      const next = [...prev];
      const prod = { ...next[i] };
      const trimmed = productsEditBuffer.trim();
      if (field === "pains" || field === "gains") {
        prod[field] = trimmed.split("\n").map((s) => s.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean);
      } else {
        prod[field] = trimmed;
      }
      next[i] = prod;
      return next;
    });
    setProductsEditing(null);
    setProductsEditBuffer("");
  };

  const addProduct = () => {
    setProductsResult((prev) => [...prev, { id: undefined, name: "", description: "", audienceDescription: "", pains: [], gains: [] }]);
  };

  const deleteProduct = (i: number) => {
    const prod = productsResult[i];
    if (prod.id) setProductsDeletedIds((prev) => [...prev, prod.id]);
    setProductsResult((prev) => prev.filter((_, idx) => idx !== i));
  };

  const saveProducts = async () => {
    const pid = await ensureProject();
    setProductsSaving(true);
    try {
      for (const id of productsDeletedIds) {
        await api.products.delete(id);
      }
      const newIds: Record<number, string> = {};
      for (let idx = 0; idx < productsResult.length; idx++) {
        const prod = productsResult[idx];
        const body = {
          projectId: pid,
          name: prod.name,
          description: prod.description || "",
          values: JSON.stringify({
            pains: prod.pains || [],
            gains: prod.gains || [],
            audienceDescription: prod.audienceDescription || "",
          }),
        };
        if (prod.id) {
          await api.products.update(prod.id, body);
        } else {
          const created = await api.products.create(body);
          newIds[idx] = created.id;
        }
      }
      if (Object.keys(newIds).length > 0) {
        setProductsResult((prev) => prev.map((p, i) => (newIds[i] ? { ...p, id: newIds[i] } : p)));
      }
      setProductsDeletedIds([]);
      await fetch(`/api/onboarding/${pid}/step/products`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done", aiOutput: JSON.stringify(productsResult) }),
      });
      setProductsSaved(true);
      setTimeout(() => setProductsSaved(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["onboarding-status", projectId] });
      queryClient.invalidateQueries({ queryKey: ["products", projectId] });
    } catch (err: any) {
      setError(err?.message || "Save failed");
    } finally {
      setProductsSaving(false);
    }
  };

  // ── Platforms state ──
  const [platformsResult, setPlatformsResult] = useState<any[]>([]);
  const [platformsDeletedIds, setPlatformsDeletedIds] = useState<string[]>([]);
  const [platformsSaving, setPlatformsSaving] = useState(false);
  const [platformsSaved, setPlatformsSaved] = useState(false);
  const [platformsEditing, setPlatformsEditing] = useState<{ i: number; field: string } | null>(null);
  const [platformsEditBuffer, setPlatformsEditBuffer] = useState("");
  const [showAddPlatformForProduct, setShowAddPlatformForProduct] = useState<string | null>(null);

  const suggestPlatforms = useMutation({
      mutationFn: async () => {
        const pid = await ensureProject();
        const res = await fetch(`/api/onboarding/${pid}/suggest-platforms`, { method: "POST" });
        if (!res.ok) {
          let msg = "Failed to suggest platforms";
          try { const err = await res.json(); if (err.error) msg = err.error; } catch {}
          throw new Error(msg);
        }
        return res.json();
      },
    onSuccess: (data) => {
      setPlatformsResult((prev) => {
        const manual = prev.filter((p) => (p.suggested ?? 0) !== 1);
        return [...manual, ...data];
      });
      setPlatformsDeletedIds([]);
      queryClient.invalidateQueries({ queryKey: ["onboarding-status", projectId] });
      queryClient.invalidateQueries({ queryKey: ["platforms", projectId] });
    },
    onError: (err: any) => setError(err?.message || "Platform suggestion failed"),
  });

  const startPlatformsEdit = (i: number, field: string, value: string) => {
    setPlatformsEditing({ i, field });
    setPlatformsEditBuffer(value);
  };

  const cancelPlatformsEdit = () => {
    setPlatformsEditing(null);
    setPlatformsEditBuffer("");
  };

  const confirmPlatformsEdit = () => {
    if (!platformsEditing) return;
    const { i, field } = platformsEditing;
    setPlatformsResult((prev) => {
      const next = [...prev];
      if (field === "full") {
        const lines = platformsEditBuffer.split("\n").map((s) => s.trim()).filter(Boolean);
        next[i] = { ...next[i], name: lines[0] || next[i].name, description: lines.slice(1).join("\n") || next[i].description };
      } else {
        next[i] = { ...next[i], [field]: platformsEditBuffer.trim() };
      }
      return next;
    });
    setPlatformsEditing(null);
    setPlatformsEditBuffer("");
  };

  const addPlatform = (productId: string, type: string) => {
    const opt = PLATFORM_OPTIONS.find((p) => p.value === type);
    setPlatformsResult((prev) => [...prev, {
      id: undefined, productId, type, name: opt?.label || type,
      description: "Добавлено вручную", priority: 99,
    }]);
    setShowAddPlatformForProduct(null);
  };

  const deletePlatform = (i: number) => {
    const pl = platformsResult[i];
    if (pl.id) setPlatformsDeletedIds((prev) => [...prev, pl.id]);
    setPlatformsResult((prev) => prev.filter((_, idx) => idx !== i));
  };

  const savePlatforms = async () => {
    const pid = await ensureProject();
    setPlatformsSaving(true);
    try {
      for (const id of platformsDeletedIds) {
        try { await api.platforms.delete(id); } catch (e) {}
      }
      const newIds: Record<number, string> = {};
      for (let idx = 0; idx < platformsResult.length; idx++) {
        const pl = platformsResult[idx];
        const body: any = {
          projectId: pid,
          type: pl.type,
          name: pl.name,
          suggested: pl.suggested || 0,
        };
        if (pl.productId && pl.id) {
          // existing platform — productId уже в БД, не шлём (может быть устаревшим)
        } else if (pl.productId) {
          body.productId = pl.productId;
        }
        if (pl.description) body.config = JSON.stringify({ description: pl.description, priority: pl.priority || 99 });
        if (pl.id) {
          try {
            await api.platforms.update(pl.id, body);
          } catch (e: any) {
            if (e.message?.includes("404")) {
              // If not found, create as new
              const created = await api.platforms.create(body);
              newIds[idx] = created.id;
            } else {
              throw e;
            }
          }
        } else {
          const created = await api.platforms.create(body);
          newIds[idx] = created.id;
        }
      }
      if (Object.keys(newIds).length > 0) {
        setPlatformsResult((prev) => prev.map((p, i) => (newIds[i] ? { ...p, id: newIds[i] } : p)));
      }
      setPlatformsDeletedIds([]);
      setPlatformsSaved(true);
      setTimeout(() => setPlatformsSaved(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["onboarding-status", projectId] });
      queryClient.invalidateQueries({ queryKey: ["platforms", projectId] });
    } catch (err: any) {
      setError(err?.message || "Save failed");
    } finally {
      setPlatformsSaving(false);
    }
  };

  // ── Real knowledge count from DB ──
  const { data: knowledgeStats } = useQuery({
    queryKey: ["knowledge-stats", projectId],
    queryFn: () => api.knowledge.stats(projectId!),
    enabled: !!projectId,
  });
  const realKnowledgeCount = knowledgeStats?.total ?? 0;

  const { data: uploadedFiles = [] } = useQuery({
    queryKey: ["knowledge", projectId, "file"],
    queryFn: () => api.knowledge.list(projectId!, { type: "file" }),
    enabled: !!projectId,
  });

  const { data: uploadedNotes = [] } = useQuery({
    queryKey: ["knowledge", projectId, "note"],
    queryFn: () => api.knowledge.list(projectId!, { type: "note" }),
    enabled: !!projectId,
  });

  const { data: uploadedLinks = [] } = useQuery({
    queryKey: ["knowledge", projectId, "link"],
    queryFn: () => api.knowledge.list(projectId!, { type: "link" }),
    enabled: !!projectId,
  });

  // ── Processing status ──
  function renderProcessStatus(item: any) {
    if (item.processed === 0) {
      return <span className="text-xs" style={{ color: "var(--accent)" }}>⏳ Анализ...</span>;
    }
    if (item.processingError) {
      return <span className="text-xs" style={{ color: "var(--red)" }} title={item.processingError}>❌ Ошибка</span>;
    }
    if ((item.factsCount || 0) > 0) {
      return <span className="text-xs" style={{ color: "var(--green)" }}>✅ {item.factsCount} фактов</span>;
    }
    return <span className="text-xs text-dim">✅ Обработан</span>;
  }

  // Auto-refresh knowledge lists while entries are still processing
  const hasUnprocessed = [...uploadedFiles, ...uploadedNotes, ...uploadedLinks].some((i: any) => i.processed === 0);
  useEffect(() => {
    if (!hasUnprocessed || !projectId) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["knowledge", projectId] });
    }, 3000);
    return () => clearInterval(interval);
  }, [hasUnprocessed, projectId, queryClient]);

  // ── Saved competitors (for complete tab) ──
  const { data: savedCompetitorsList } = useQuery({
    queryKey: ["saved-competitors", projectId],
    queryFn: () => api.competitors.getSaved(projectId!),
    enabled: !!projectId,
  });
  const savedCompetitorsCount = savedCompetitorsList?.length || 0;

  // ── Onboarding status ──
  const { data: onboardingStatus } = useQuery({
    queryKey: ["onboarding-status", projectId],
    queryFn: () => fetch(`/api/onboarding/${projectId}/status`).then((r) => r.json()),
    enabled: !!projectId,
  });

  const isStepComplete = (key: OnboardingStepType): boolean => {
    switch (key) {
      case "scenario": return scenario !== null;
      case "materials": return (knowledgeStats?.total ?? 0) > 0 || generatedKeywords.length > 0;
      case "competitors": return competitorResult !== null || (savedCompetitorsList?.length || 0) > 0;
      case "audience": return audienceResult?.groups?.length > 0;
      case "hant": return hantData.length > 0;
      case "value_prop": return valuePropResult !== null;
      case "products": return productsResult.length > 0;
      case "platforms": return platformsResult.length > 0;
      case "complete": return true;
    }
  };

  const highestComplete = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < STEPS.length; i++) {
      if (isStepComplete(STEPS[i].key)) idx = i;
      else break;
    }
    return idx;
  }, [scenario, knowledgeStats, generatedKeywords, competitorResult, savedCompetitorsList, audienceResult, hantData, valuePropResult, productsResult, platformsResult]);

  const initialFillRef = useRef(false);
  // Helper: normalize hant data — old format (flat stages) → new format (journeys with stages)
  const normalizeHantData = (data: any): any[] => {
    if (!Array.isArray(data)) return [];
    // If first element has a "stages" field → already new format
    if (data.length > 0 && data[0].stages) return data;
    // Old format: flat array of stage objects → wrap in one journey
    if (data.length > 0 && data[0].stage) {
      return [{ groupName: "Основная ЦА", groupSummary: "Единая целевая аудитория", stages: data }];
    }
    return data;
  };

  // Fill state from existing onboarding steps when status loads
  const onboardingComplete = !!(onboardingStatus?.complete);
  useEffect(() => {
    if (initialFillRef.current || !onboardingStatus?.steps || !projectId) return;
    initialFillRef.current = true;

    if (onboardingStatus.scenario) setScenario(onboardingStatus.scenario);

    for (const step of onboardingStatus.steps) {
      if (!step.aiOutput) continue;
      try {
        const data = JSON.parse(step.aiOutput);
        if (step.stepKey === "materials" && Array.isArray(data)) setGeneratedKeywords(data);
        if (step.stepKey === "competitors") setCompetitorResult(data);
        if (step.stepKey === "audience" && data) setAudienceResult(data);
        if (step.stepKey === "hant" && Array.isArray(data)) setHantData(normalizeHantData(data));
        if (step.stepKey === "value_prop" && data?.formula) setValuePropResult(data);
        if (step.stepKey === "products" && Array.isArray(data)) setProductsResult(data);
        if (step.stepKey === "platforms" && Array.isArray(data)) setPlatformsResult(data);
      } catch {}
    }
    // Also load from legacy project fields
    api.projects.get(projectId).then((p) => {
      if (p.valueProp) try { setValuePropResult(JSON.parse(p.valueProp)); } catch {}
      if (p.customerJourney) try { setHantData(normalizeHantData(JSON.parse(p.customerJourney))); } catch {}
    }).catch(() => {});
  }, [onboardingStatus, projectId]);

  // Load products from API when entering the products step
  useEffect(() => {
    if (step !== "products" || !projectId) return;
    api.products.listByProject(projectId).then((data) => {
      if (data?.length > 0) {
        setProductsResult((prev) => {
          if (prev.length > 0) return prev;
          return data.map((p: any) => {
            let parsedValues: any = {};
            try { if (p.values) parsedValues = JSON.parse(p.values); } catch {}
            return {
              id: p.id,
              name: p.name,
              description: p.description || "",
              audienceDescription: parsedValues.audienceDescription || "",
              pains: parsedValues.pains || [],
              gains: parsedValues.gains || [],
            };
          });
        });
      }
    }).catch(() => {});
  }, [step, projectId]);

  // Load products & platforms from API when entering the platforms step
  useEffect(() => {
    if (step !== "platforms" || !projectId) return;
    api.products.listByProject(projectId).then((data) => {
      if (data?.length > 0) {
        setProductsResult((prev) => {
          if (prev.length > 0) return prev;
          return data.map((p: any) => {
            let parsedValues: any = {};
            try { if (p.values) parsedValues = JSON.parse(p.values); } catch {}
            return {
              id: p.id,
              name: p.name,
              description: p.description || "",
              audienceDescription: parsedValues.audienceDescription || "",
              pains: parsedValues.pains || [],
              gains: parsedValues.gains || [],
            };
          });
        });
      }
    }).catch(() => {});
    api.platforms.listByProject(projectId).then((data) => {
      if (data?.length > 0) {
        setPlatformsResult((prev) => {
          if (prev.length > 0) return prev;
          return data.map((pl: any) => {
            let description = "";
            let priority = 99;
            try {
              const cfg = JSON.parse(pl.config || "{}");
              description = cfg.description || "";
              priority = cfg.priority || pl.ordering || 99;
            } catch {}
            return { ...pl, description, priority };
          });
        });
      }
    }).catch(() => {});
  }, [step, projectId]);

  const startScenario = useMutation({
    mutationFn: async (s: string) => {
      const pid = await ensureProject();
      const res = await fetch(`/api/onboarding/${pid}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: s }),
      });
      if (!res.ok) throw new Error("Failed to start onboarding");
      setScenario(s);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-status", projectId] });
      nextStep();
    },
  });

  const finishOnboarding = async () => {
    if (!projectId) return;
    await api.projects.update(projectId, { onboardingComplete: 1 });
    navigate("/strategy");
  };

  const SectionLabel = ({ label }: { label: string }) => (
    <div style={{ fontWeight: 600, fontSize: 11, color: "var(--dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
  );

  const Section = ({ label, items }: { label: string; items: string[] }) => {
    if (!items || items.length === 0) return null;
    return (
      <div>
        <SectionLabel label={label} />
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          {items.map((item: string, j: number) => <div key={j}>• {item}</div>)}
        </div>
      </div>
    );
  };

  const renderCompetitors = (items: any[], label: string) => {
    if (items.length === 0) return null;
    return (
      <div>
        <div style={{ fontWeight: 600, fontSize: 12, color: "var(--dim)", marginBottom: 6 }}>{label}</div>
        {items.map((c: any, i: number) => (
          <div key={i} style={{ padding: 10, background: "var(--bg-hover)", borderRadius: 6, marginBottom: 6 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
            <div className="text-xs text-dim" style={{ marginTop: 2 }}>
              {c.positioning && <div><strong>Позиционирование:</strong> {c.positioning}</div>}
              <div><strong>Сильные стороны:</strong> {Array.isArray(c.strengths) ? c.strengths.join(", ") : c.strengths}</div>
              <div><strong>Слабые стороны:</strong> {Array.isArray(c.weaknesses) ? c.weaknesses.join(", ") : c.weaknesses}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div className="page-header">
        <h2>Фабрика контента</h2>
        <p>Пошаговая распаковка: от сценария до площадок</p>
      </div>

      {error && (
        <div ref={errorRef} style={{ padding: "10px 14px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 6, marginBottom: 16, fontSize: 14, color: "#ef4444", fontWeight: 500 }}>
          ⚠️ {error}
          <button className="btn btn-ghost" style={{ marginLeft: 12, fontSize: 12, padding: "2px 8px" }} onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Progress bar */}
      <div>
        <div className="flex items-center gap-0" style={{ marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
          {STEPS.map((s, i) => {
            const isComplete = isStepComplete(s.key);
            const isCurrent = i === stepIdx;
            const isLocked = !onboardingComplete && i > highestComplete + 1 && i !== stepIdx;
            return (
              <div key={s.key} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                <button
                  onClick={() => goToStep(i)}
                  style={{
                    fontSize: 12, padding: "6px 10px", whiteSpace: "nowrap", cursor: "pointer",
                    borderRadius: 6, border: isCurrent ? `1.5px solid var(--accent)` : "none",
                    fontWeight: isCurrent ? 700 : 400,
                    background: isCurrent ? "transparent" : isComplete ? "var(--bg-hover)" : "transparent",
                    color: isCurrent ? "var(--accent)" : isComplete ? "var(--text)" : "var(--text-dim)",
                    opacity: isLocked ? 0.35 : 1,
                    display: "flex", alignItems: "center", gap: 4,
                    transition: "opacity 0.15s",
                  }}
                >
                  <span style={{
                    width: 20, height: 20, borderRadius: "50%", display: "inline-flex",
                    alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700,
                    border: `1.5px solid ${isComplete || isCurrent ? "var(--accent)" : "var(--border)"}`,
                    background: "transparent",
                    color: isComplete || isCurrent ? "var(--accent)" : "var(--text-dim)",
                  }}>
                    {isComplete ? "✓" : isCurrent ? "🚧" : isLocked ? "🔒" : s.number}
                  </span>
                  <span>{s.label}</span>
                </button>
                {i < STEPS.length - 1 && <div style={{
                  width: 16, height: 2, flexShrink: 0,
                  background: isComplete ? "var(--accent)" : "var(--border)",
                }} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="card" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>

        {/* Locked step banner */}
        {!onboardingComplete && stepIdx > highestComplete + 1 && !isStepComplete(STEPS[stepIdx].key) && (
          <div style={{
            padding: "12px 16px", background: "rgba(250,204,21,0.1)", border: "1px solid rgba(250,204,21,0.3)",
            borderRadius: 8, marginBottom: 16, fontSize: 14, display: "flex",
            alignItems: "center", gap: 12, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span style={{ flex: 1, minWidth: 0, color: "var(--text)" }}>
              Сначала завершите шаг <strong>«{STEPS[highestComplete + 1].label}»</strong> — без его данных этот шаг пока не имеет смысла
            </span>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 13, padding: "6px 14px", flexShrink: 0 }}
              onClick={() => setStepIdx(highestComplete + 1)}
            >
              → Перейти к шагу {STEPS[highestComplete + 1].number}
            </button>
          </div>
        )}

        {/* Step: scenario */}
        {step === "scenario" && (
          <div>
            <h3 style={{ fontSize: 18, marginBottom: 8 }}>Выберите сценарий</h3>
            <p className="text-sm text-dim" style={{ marginBottom: 24 }}>
              Как будем работать с проектом?
            </p>
            {onboardingComplete ? (
              <div style={{ padding: 24, borderRadius: 8, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <div style={{ marginBottom: 8, fontWeight: 600, color: "var(--text)" }}>✅ Сценарий выбран</div>
                <p className="text-sm text-dim" style={{ marginBottom: 12 }}>Проект уже настроен. Вы можете перейти к любому шагу для просмотра или редактирования данных.</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, opacity: 0.5, pointerEvents: "none" }}>
                  <div style={{ padding: 24, borderRadius: 8, border: "2px solid var(--accent)", textAlign: "center" }}>
                    <span style={{ fontWeight: 600 }}>Уже есть проект</span>
                    <span className="text-xs text-dim" style={{ display: "block", marginTop: 4 }}>Загрузите материалы, AI распакует бренд из них</span>
                  </div>
                  <div style={{ padding: 24, borderRadius: 8, border: "2px solid var(--border)", textAlign: "center" }}>
                    <span style={{ fontWeight: 600 }}>Создаём новый проект</span>
                    <span className="text-xs text-dim" style={{ display: "block", marginTop: 4 }}>Пройдём шаги вместе</span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <button
                  className={`btn ${scenario === "existing" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => startScenario.mutate("existing")}
                  disabled={startScenario.isPending}
                  style={{ padding: 24, height: "auto", flexDirection: "column", gap: 12, textAlign: "center", border: scenario === "existing" ? "2px solid var(--accent)" : "2px solid var(--border)" }}
                >
                  <span style={{ fontWeight: 600 }}>Уже есть проект</span>
                  <span className="text-xs text-dim">Загрузите материалы, AI распакует бренд из них</span>
                </button>
                <button
                  className={`btn ${scenario === "new" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => startScenario.mutate("new")}
                  disabled={startScenario.isPending}
                  style={{ padding: 24, height: "auto", flexDirection: "column", gap: 12, textAlign: "center", border: scenario === "new" ? "2px solid var(--accent)" : "2px solid var(--border)" }}
                >
                  <span style={{ fontWeight: 600 }}>Создаём новый проект</span>
                  <span className="text-xs text-dim">Пройдём шаги вместе, AI поможет проработать всё с нуля</span>
                </button>
              </div>
            )}
            {startScenario.isPending && (
              <div className="text-sm text-dim" style={{ textAlign: "center", marginTop: 16 }}>⏳ Создание проекта...</div>
            )}
          </div>
        )}

        {/* Step: materials */}
        {step === "materials" && (
          <div>
            <h3 style={{ fontSize: 18, marginBottom: 8 }}>📁 Загрузка материалов</h3>
            <p className="text-sm text-dim" style={{ marginBottom: 16 }}>
              Загрузите файлы, добавьте заметки и ссылки — AI извлечёт ключевые слова и данные
            </p>

            <div className="flex gap-2" style={{ marginBottom: 20 }}>
              {["files", "notes", "interview", "import"].map((t) => (
                <button key={t} className={`btn ${unpackTab === t ? "btn-primary" : "btn-ghost"}`} style={{ fontSize: 13 }} onClick={() => setUnpackTab(t)}>
                  {t === "files" ? "📁 Загрузить файлы" : t === "notes" ? "🔗 Ссылки и заметки" : t === "interview" ? "💬 Интервью с нуля" : "📱 Импорт канала"}
                </button>
              ))}
            </div>

            {unpackTab === "files" && (
              <div>
                <div
                  className="knowledge-dropzone"
                  style={{ border: dragOver ? "2px dashed var(--accent)" : "2px dashed var(--border)", borderRadius: 8, padding: 32, textAlign: "center", cursor: "pointer", background: dragOver ? "rgba(99,102,241,0.05)" : "transparent" }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const files = Array.from(e.dataTransfer.files);
                    for (const f of files) uploadFile.mutate(f);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {dragOver ? "📂 Отпустите файлы для загрузки" : "📁 Перетащите файлы сюда или нажмите для выбора"}
                  <span className="text-xs text-dim" style={{ display: "block", marginTop: 4 }}>Поддерживаются: DOCX, PPTX, XLSX, PDF, HTML, TXT, MD, CSV, JSON</span>
                </div>
                <input ref={fileInputRef} type="file" style={{ display: "none" }} multiple accept=".docx,.pptx,.xlsx,.pdf,.html,.htm,.txt,.md,.csv,.json"
                  onChange={(e) => { const files = Array.from(e.target.files || []); for (const f of files) uploadFile.mutate(f); }}
                />
                {fileSaved && <p className="text-sm" style={{ color: "var(--green)", marginTop: 8 }}>✅ Файл загружен</p>}
                {uploadedFiles.length > 0 && (
                  <div className="flex flex-col gap-2" style={{ marginTop: 16 }}>
                    <p className="text-xs text-dim" style={{ fontWeight: 600 }}>Загруженные файлы ({uploadedFiles.length})</p>
                    {uploadedFiles.map((f: any) => (
                      <div key={f.id} className="card" style={{ padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div className="flex items-center gap-2" style={{ minWidth: 0, flex: 1 }}>
                          <span>📄</span>
                          <span className="text-sm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.title}</span>
                          {f.wordCount > 0 && <span className="text-xs text-dim">· {f.wordCount} слов</span>}
                          {f.fileSize > 0 && <span className="text-xs text-dim">· {formatFileSize(f.fileSize)}</span>}
                          {renderProcessStatus(f)}
                        </div>
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 6px", color: "var(--red)", flexShrink: 0 }}
                          onClick={() => { if (confirm(`Удалить "${f.title}"?`)) deleteKnowledgeFile.mutate(f.id); }}>
                          🗑
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {unpackTab === "notes" && (
              <div className="flex flex-col gap-4">
                <div className="card">
                  <div className="flex flex-col gap-3">
                    <input className="input" placeholder="Название заметки" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
                    <textarea className="input" rows={4} placeholder="Текст заметки (или описание проекта своими словами)" value={noteContent} onChange={(e) => setNoteContent(e.target.value)} />
                    <button className="btn btn-primary" onClick={() => { if (!noteTitle.trim()) return; createKnowledge.mutate({ type: "note", title: noteTitle, content: noteContent }); setNoteTitle(""); setNoteContent(""); }}
                      disabled={createKnowledge.isPending || !noteTitle.trim()} style={{ alignSelf: "flex-start" }}>
                      {createKnowledge.isPending ? "⏳ Сохранение..." : "✏️ Добавить заметку"}
                    </button>
                    {noteSaved && <span style={{ color: "var(--green)", fontSize: 13 }}>✅ Заметка сохранена</span>}
                  </div>
                </div>
                <div className="card">
                  <div className="flex flex-col gap-3">
                    <input className="input" placeholder="Название ссылки" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
                    <input className="input" placeholder="URL" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
                      <button className="btn btn-primary" onClick={() => { if (!linkTitle.trim() || !linkUrl.trim()) return; createKnowledge.mutate({ type: "link", title: linkTitle, content: linkUrl, sourceUrl: linkUrl }); setLinkTitle(""); setLinkUrl(""); }}
                      disabled={createKnowledge.isPending || !linkTitle.trim() || !linkUrl.trim()} style={{ alignSelf: "flex-start" }}>
                      {createKnowledge.isPending ? "⏳ Сохранение..." : "🔗 Добавить ссылку"}
                    </button>
                    {linkSaved && <span style={{ color: "var(--green)", fontSize: 13 }}>✅ Ссылка сохранена</span>}
                  </div>
                </div>
                {uploadedNotes.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-dim" style={{ fontWeight: 600 }}>Сохранённые заметки ({uploadedNotes.length})</p>
                    {uploadedNotes.map((n: any) => (
                      <div key={n.id} className="card" style={{ padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                          <div className="flex items-center gap-2">
                            <span>✏️</span>
                            <span className="text-sm" style={{ fontWeight: 600 }}>{n.title}</span>
                            {n.wordCount > 0 && <span className="text-xs text-dim">· {n.wordCount} слов</span>}
                            {renderProcessStatus(n)}
                          </div>
                          {(n.content || "").length > 0 && (
                            <div className="text-xs text-dim" style={{ marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {(n.content || "").slice(0, 200)}
                            </div>
                          )}
                        </div>
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 6px", color: "var(--red)", flexShrink: 0 }}
                          onClick={() => { if (confirm(`Удалить "${n.title}"?`)) deleteKnowledgeFile.mutate(n.id); }}>
                          🗑
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {uploadedLinks.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-dim" style={{ fontWeight: 600 }}>Сохранённые ссылки ({uploadedLinks.length})</p>
                    {uploadedLinks.map((l: any) => (
                      <div key={l.id} className="card" style={{ padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                          <div className="flex items-center gap-2">
                            <span>🔗</span>
                            <span className="text-sm" style={{ fontWeight: 600 }}>{l.title}</span>
                            {renderProcessStatus(l)}
                          </div>
                          <div className="text-xs" style={{ marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--accent)" }}>
                            {l.content}
                          </div>
                        </div>
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 6px", color: "var(--red)", flexShrink: 0 }}
                          onClick={() => { if (confirm(`Удалить "${l.title}"?`)) deleteKnowledgeFile.mutate(l.id); }}>
                          🗑
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {unpackTab === "interview" && (
              <BrandInterview onComplete={(answers) => {
                (async () => {
                  setUnpackLoading(true);
                  try {
                    const pid = await ensureProject();
                    for (const a of answers) {
                      if (a.answer?.trim()) {
                        await api.knowledge.create({ projectId: pid, type: "note", title: `Интервью: ${a.question}`, content: a.answer });
                      }
                    }
                    setUnpackKnowledgeCount((c) => c + answers.filter((a: any) => a.answer?.trim()).length);
                  } catch (err: any) {
                    setError(err?.message || "Ошибка сохранения интервью");
                  } finally {
                    setUnpackLoading(false);
                  }
                })();
              }} onCancel={() => setUnpackTab("files")} />
            )}

            {unpackTab === "import" && (
              <div>
                <div className="flex flex-col gap-4">
                  <div className="card">
                    <h4 style={{ fontSize: 15, marginBottom: 12 }}>Импорт контента из канала</h4>
                    <p className="text-xs text-dim" style={{ marginBottom: 16 }}>
                      Введите ссылку или @username канала. Система загрузит последние посты и проанализирует их.
                    </p>
                    <div className="flex flex-col gap-3">
                      <div className="flex gap-2 flex-wrap">
                        {["telegram", "youtube", "vk", "zen", "instagram"].map((p) => (
                          <button
                            key={p}
                            className={`btn ${importPlatform === p ? "btn-primary" : "btn-ghost"}`}
                            style={{ fontSize: 13, flex: 1, minWidth: 80 }}
                            onClick={() => { setImportPlatform(p); setImportIdentifier(""); setImportResult(null); setImportError(null); setImportDescription(""); }}
                          >
                            {p === "telegram" ? "✈️ Telegram" : p === "youtube" ? "▶️ YouTube" : p === "vk" ? "📱 VK" : p === "zen" ? "📰 Дзен" : "📸 Instagram"}
                          </button>
                        ))}
                      </div>
                      <input
                        className="input"
                        placeholder={
                          importPlatform === "telegram" ? "@channel_username или https://t.me/channel" :
                          importPlatform === "youtube" ? "@channel_username или https://youtube.com/@channel" :
                          importPlatform === "vk" ? "@public_page или https://vk.com/public_page" :
                          importPlatform === "zen" ? "https://dzen.ru/media/... или https://dzen.ru/a/..." :
                          "@username или https://www.instagram.com/username/"
                        }
                        value={importIdentifier}
                        onChange={(e) => setImportIdentifier(e.target.value)}
                      />
                      {importPlatform === "instagram" && (
                        <textarea
                          className="input"
                          rows={2}
                          placeholder="Описание визуала (для рилсов/каруселей): что в кадре, вайб, музыка, текст на экране"
                          value={importDescription}
                          onChange={(e) => setImportDescription(e.target.value)}
                          style={{ marginTop: 8 }}
                        />
                      )}
                      <button
                        className="btn btn-primary"
                        onClick={async () => {
                          if (!importIdentifier.trim()) return;
                          setImportLoading(true);
                          setImportError(null);
                          setImportResult(null);
                          try {
                            const pid = await ensureProject();
                            let cleaned = importIdentifier.trim();
                            if (importPlatform === "instagram") {
                              cleaned = cleaned.replace(/^@/, "");
                              if (!/^https?:\/\//i.test(cleaned)) {
                                cleaned = `https://www.instagram.com/${cleaned}/`;
                              }
                            } else if (importPlatform === "telegram" || importPlatform === "youtube" || importPlatform === "vk") {
                              cleaned = cleaned.replace(/^https:\/\/(t\.me|youtube\.com|vk\.com|m\.vk\.com)\//, "");
                            }
                            const body: any = {
                              platform: importPlatform,
                              identifier: cleaned,
                            };
                            if (importPlatform === "instagram" && importDescription.trim()) {
                              body.description = importDescription.trim();
                            }
                            const res = await api.projects.importChannel(pid, body);
                            setImportResult(res);
                            setUnpackKnowledgeCount((c) => c + (res.imported || 0));
                          } catch (err: any) {
                            setImportError(err?.message || "Ошибка импорта канала");
                          } finally {
                            setImportLoading(false);
                          }
                        }}
                        disabled={importLoading || !importIdentifier.trim()}
                        style={{ alignSelf: "flex-start" }}
                      >
                        {importLoading ? "⏳ Импорт..." : "Импортировать и проанализировать"}
                      </button>
                      {importPlatform === "zen" && (
                        <p className="text-xs text-dim" style={{ marginTop: 6 }}>
                          Вставьте ссылку на статью Дзен. Сервер загрузит заголовок и текст статьи.
                        </p>
                      )}
                      {importPlatform === "instagram" && (
                        <p className="text-xs text-dim" style={{ marginTop: 6 }}>
                          Введите @username аккаунта или ссылку на пост Instagram. Для аккаунта загрузится профиль, для поста — caption. Для рилсов и каруселей добавьте описание визуала.
                        </p>
                      )}
                    </div>
                  </div>

                  {importError && (
                    <div className="card" style={{ border: "1px solid #ef4444" }}>
                      <p className="text-sm" style={{ color: "#ef4444" }}>❌ {importError}</p>
                    </div>
                  )}

                  {importResult && (
                    <div className="flex flex-col gap-4">
                      <div className="card">
                        <h4 style={{ fontSize: 15, marginBottom: 8 }}>✅ Импортировано: {importResult.imported} постов</h4>
                        {importResult.channel && (
                          <div className="text-sm" style={{ marginBottom: 8 }}>
                            <strong>Канал:</strong> {importResult.channel.name}
                            {importResult.channel.subscribers > 0 && (
                              <span style={{ marginLeft: 12 }}>
                                <strong>Подписчики:</strong> {importResult.channel.subscribers.toLocaleString()}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {importResult.analysis && !importResult.analysis.error && (
                        <>
                          <div className="card">
                            <h4 style={{ fontSize: 15, marginBottom: 8 }}>📊 Анализ канала</h4>
                            <div className="flex flex-col gap-2 text-sm">
                              {importResult.analysis.niche && (
                                <div><strong>Ниша:</strong> {importResult.analysis.niche}</div>
                              )}
                              {importResult.analysis.toneOfVoice && (
                                <div><strong>Тон:</strong> {importResult.analysis.toneOfVoice}</div>
                              )}
                              {importResult.analysis.contentStyle && (
                                <div><strong>Стиль:</strong> {importResult.analysis.contentStyle}</div>
                              )}
                              {importResult.analysis.targetAudience && (
                                <div><strong>ЦА:</strong> {importResult.analysis.targetAudience}</div>
                              )}
                              {importResult.analysis.postingFrequency && (
                                <div><strong>Частота:</strong> {importResult.analysis.postingFrequency}</div>
                              )}
                            </div>
                          </div>

                          {importResult.analysis.mainTopics && importResult.analysis.mainTopics.length > 0 && (
                            <div className="card">
                              <h4 style={{ fontSize: 15, marginBottom: 8 }}>📌 Ключевые темы</h4>
                              <div className="flex flex-wrap gap-2">
                                {importResult.analysis.mainTopics.map((t: any, i: number) => (
                                  <span key={i} className="badge" style={{ padding: "4px 10px", background: "rgba(99,102,241,0.12)", borderRadius: 6, fontSize: 13 }}>
                                    {typeof t === "string" ? t : t.title || t}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {importResult.analysis.rubrics && importResult.analysis.rubrics.length > 0 && (
                            <div className="card">
                              <h4 style={{ fontSize: 15, marginBottom: 8 }}>📂 Рубрики</h4>
                              <div className="flex flex-col gap-2">
                                {importResult.analysis.rubrics.map((r: any, i: number) => (
                                  <div key={i} className="flex items-center gap-3 text-sm">
                                    <span style={{ width: 120, fontWeight: 500 }}>{r.name}</span>
                                    <div style={{ flex: 1, height: 8, background: "var(--border)", borderRadius: 4 }}>
                                      <div style={{ width: `${r.percentage || r.percent || 0}%`, height: 8, background: "var(--accent)", borderRadius: 4 }} />
                                    </div>
                                    <span className="text-dim">{r.percentage || r.percent || 0}%</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {importResult.analysis.recommendations && (
                            <div className="card">
                              <h4 style={{ fontSize: 15, marginBottom: 8 }}>💡 Рекомендации</h4>
                              <p className="text-sm">{importResult.analysis.recommendations}</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {(realKnowledgeCount > 0 || unpackKnowledgeCount > 0) && (
              <div className="text-sm text-dim" style={{ marginTop: 12, textAlign: "center" }}>
                ✅ Загружено: {Math.max(realKnowledgeCount, unpackKnowledgeCount)} записей в базу знаний
              </div>
            )}

            {unpackTab !== "interview" && (
              <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
                {importResult && unpackTab === "import" && (
                  <p className="text-xs text-dim">
                    ✅ Посты импортированы. Нажмите «Извлечь ключевые слова», чтобы проанализировать все загруженные материалы, и переходите к следующему шагу.
                  </p>
                )}
                <button className="btn btn-primary" onClick={handleGenerateKeywords} disabled={keywordsLoading || (unpackKnowledgeCount === 0 && realKnowledgeCount === 0)}>
                  {keywordsLoading ? "⏳ AI извлекает..." : "Извлечь ключевые слова"}
                </button>
              </div>
            )}

            {generatedKeywords.length > 0 && (
              <div className="card" style={{ marginTop: 16, padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Ключевые слова</span>
                    <span className="text-xs text-dim">{generatedKeywords.length}</span>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => {
                    if (!keywordsEditMode) {
                      const edits: Record<string, string> = {};
                      for (const kw of generatedKeywords) {
                        const g = kw.group || "общее";
                        if (!edits[g]) edits[g] = "";
                        edits[g] += (edits[g] ? ", " : "") + kw.keyword;
                      }
                      setKeywordsEdits(edits);
                    }
                    setKeywordsEditMode(!keywordsEditMode);
                  }}>
                    {keywordsEditMode ? "✕ Отмена" : "✏️"}
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {Object.entries(
                    generatedKeywords.reduce((acc: any, kw: any) => {
                      const g = kw.group || "общее";
                      if (!acc[g]) acc[g] = [];
                      acc[g].push(kw.keyword);
                      return acc;
                    }, {})
                  ).map(([group, kws]: [string, any]) => (
                    <div key={group} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span className="text-xs text-dim" style={{ fontWeight: 600, whiteSpace: "nowrap", minWidth: 80, marginTop: 4 }}>{group}</span>
                      {keywordsEditMode ? (
                        <input
                          className="input"
                          style={{ flex: 1, fontSize: 12, padding: "4px 8px" }}
                          value={keywordsEdits[group] || ""}
                          onChange={(e) => setKeywordsEdits((prev) => ({ ...prev, [group]: e.target.value }))}
                        />
                      ) : (
                        <div className="text-sm" style={{ lineHeight: 1.6 }}>
                          {(kws as string[]).map((kw, j) => (
                            <span key={j}>{j > 0 && <span style={{ color: "var(--border)" }}>, </span>}<span style={{ color: "var(--text)" }}>{kw}</span></span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {keywordsEditMode && (
                    <button className="btn btn-primary" style={{ alignSelf: "flex-start", fontSize: 12, padding: "4px 16px", marginTop: 4 }} onClick={handleSaveKeywords} disabled={keywordsSaving}>
                      {keywordsSaving ? "⏳ Сохранение..." : "Сохранить"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step: competitors */}
        {step === "competitors" && (
          <div>
            <h3 style={{ fontSize: 18, marginBottom: 8 }}>Конкуренты</h3>
            <p className="text-sm text-dim" style={{ marginBottom: 16 }}>
              Добавьте URL конкурентов и ключевые слова для анализа рынка
            </p>

            <div className="flex flex-col gap-4">
              <div className="card">
                <label className="text-xs text-dim" style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Прямые конкуренты</label>
                {competitorUrls.map((url, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input className="input" placeholder={`URL конкурента ${i + 1}`} value={url} onChange={(e) => {
                      const next = [...competitorUrls];
                      next[i] = e.target.value;
                      setCompetitorUrls(next);
                    }} />
                    {competitorUrls.length > 1 && (
                      <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setCompetitorUrls(competitorUrls.filter((_, j) => j !== i))}>✕</button>
                    )}
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setCompetitorUrls([...competitorUrls, ""])}>+ Добавить URL</button>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 12 }}
                    onClick={() => {
                      setAnalyzeUrlsResult(null);
                      setAnalyzeUrlsLoading(true);
                      analyzeCompetitorUrls.mutate();
                    }}
                    disabled={analyzeUrlsLoading || competitorUrls.every((u) => !u.trim())}
                  >
                    {analyzeUrlsLoading ? "⏳ Анализ URL..." : "🔍 Анализировать URL"}
                  </button>
                </div>
                {analyzeUrlsResult && (
                  <p className="text-xs" style={{ marginTop: 6, color: analyzeUrlsResult.startsWith("❌") ? "var(--red)" : "var(--green)" }}>
                    {analyzeUrlsResult}
                  </p>
                )}
              </div>

              <div className="card">
                <label className="text-xs text-dim" style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
                  Ключевые слова для поиска
                  {generatedKeywords.length > 0 && (
                    <span className="text-xs text-dim" style={{ marginLeft: 8, fontWeight: 400 }}>
                      (автоматически перенесены из материалов)
                    </span>
                  )}
                </label>
                <textarea
                  className="input" rows={4}
                  placeholder="Вставьте ключевые слова через запятую или с новой строки"
                  value={competitorKeywordsText}
                  onChange={(e) => setCompetitorKeywordsText(e.target.value)}
                />
              </div>

              <button
                className="btn btn-primary"
                onClick={() => analyzeCompetitors.mutate()}
                disabled={analyzeCompetitors.isPending}
                style={{ alignSelf: "center" }}
              >
                {analyzeCompetitors.isPending ? "⏳ Анализ..." : "Анализировать"}
              </button>

              {competitorResult && (
                <div className="card" style={{ marginTop: 8 }}>
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ fontWeight: 600, fontSize: 14 }}>Результат последнего анализа</span>
                    <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setCompetitorEdit(!competitorEdit)}>
                      {competitorEdit ? "Готово" : "✏️ Редактировать"}
                    </button>
                  </div>
                  {competitorEdit ? (
                    <textarea
                      className="input" rows={12}
                      value={JSON.stringify(competitorResult.resultJson || competitorResult, null, 2)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value);
                          setCompetitorResult((prev: any) => ({ ...prev, resultJson: parsed }));
                        } catch {}
                      }}
                      style={{ fontFamily: "monospace", fontSize: 12 }}
                    />
                  ) : (
                    <div className="flex flex-col gap-3">
                      {renderCompetitors(competitorResult.resultJson?.direct || [], "Прямые конкуренты")}
                      {renderCompetitors(competitorResult.resultJson?.indirect || [], "Косвенные конкуренты")}
                      {competitorResult.resultJson?.marketInsights && (
                        <div style={{ padding: 10, background: "var(--bg-hover)", borderRadius: 6 }}>
                          <div className="text-xs text-dim">{competitorResult.resultJson.marketInsights}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Accumulated competitors from all searches */}
              {(savedCompetitors.length > 0 || savedCompetitorsLoading) && (
                <div className="card" style={{ marginTop: 8 }}>
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ fontWeight: 600, fontSize: 14 }}>
                      Накопленные конкуренты ({savedCompetitors.length})
                    </span>
                    <div className="flex gap-1">
                      <button 
                        className="btn btn-ghost" 
                        style={{ fontSize: 11 }} 
                        onClick={() => {
                          if (projectId) {
                            api.competitors.clearSaved(projectId).then(() => {
                              setSavedCompetitors([]);
                            });
                          }
                        }}
                        disabled={savedCompetitors.length === 0}
                      >
                        🗑 Очистить всё
                      </button>
                    </div>
                  </div>
                  {savedCompetitorsLoading ? (
                    <div className="text-xs text-dim">Загрузка...</div>
                  ) : savedCompetitors.length > 0 ? (
                    <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
                      {savedCompetitors.map((comp: any) => (
                        <div key={comp.id} style={{ padding: 8, background: "var(--bg-hover)", borderRadius: 6, display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{comp.name}</div>
                              <div className="text-xs text-dim" style={{ marginTop: 2 }}>
                                <a href={comp.url} target="_blank" rel="noopener noreferrer" className="text-xs">
                                  {comp.url}
                                </a>
                                {comp.positioning && <div style={{ marginTop: 2 }}><strong>Позиционирование:</strong> {comp.positioning}</div>}
                                {comp.strengths && <div style={{ marginTop: 2 }}><strong>Сильные:</strong> {JSON.parse(comp.strengths || "[]").join(", ")}</div>}
                                {comp.weaknesses && <div style={{ marginTop: 2 }}><strong>Слабые:</strong> {JSON.parse(comp.weaknesses || "[]").join(", ")}</div>}
                                {comp.audience && <div style={{ marginTop: 2 }}><strong>Аудитория:</strong> {comp.audience}</div>}
                                {comp.contentStrategy && <div style={{ marginTop: 2 }}><strong>Стратегия:</strong> {comp.contentStrategy}</div>}
                                {comp.details && (() => {
                                  try {
                                    const d = typeof comp.details === "string" ? JSON.parse(comp.details) : comp.details;
                                    const parts: string[] = [];
                                    if (d.mainProducts?.length) parts.push(`📦 ${d.mainProducts.join(", ")}`);
                                    if (d.contentFormats?.length) parts.push(`🎬 ${d.contentFormats.join(", ")}`);
                                    if (d.uniqueSellingPoints?.length) parts.push(`💡 ${d.uniqueSellingPoints.join(", ")}`);
                                    if (d.brandVoice) parts.push(`🗣 ${d.brandVoice}`);
                                    if (d.visualStyle) parts.push(`🎨 ${d.visualStyle}`);
                                    return parts.length > 0 ? <div style={{ marginTop: 2, lineHeight: 1.5 }}>{parts.map((p, i) => <div key={i}>{p}</div>)}</div> : null;
                                  } catch { return null; }
                                })()}
                                <div className="text-xs text-dim" style={{ marginTop: 4 }}>
                                  {comp.source === "manual_url" ? "📝 Ручной ввод" : "🔍 Поиск"} • {new Date(comp.created_at).toLocaleString()}
                                  {comp.search_keywords ? ` • По запросу: ${comp.search_keywords}` : ""}
                                </div>
                              </div>
                          </div>
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: 10, alignSelf: "flex-start" }}
                            onClick={() => {
                              api.competitors.deleteSaved(comp.id).then(() => {
                                setSavedCompetitors(prev => prev.filter(c => c.id !== comp.id));
                              });
                            }}
                          >
                            Удалить
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-dim">Нет накопленных конкурентов</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step: audience — глубокий анализ ЦА по 17 пунктам */}
        {step === "audience" && (
          <div>
            <h3 style={{ fontSize: 18, marginBottom: 8 }}>👥 Целевая аудитория</h3>
            <p className="text-sm text-dim" style={{ marginBottom: 16 }}>
              Глубокий анализ ЦА по 17 параметрам. Промпт сформирован из загруженных данных и анализа конкурентов.
              Вы можете отредактировать промпт перед запуском, а после — поправить любой пункт вручную.
            </p>

            {/* Prompt section */}
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <label className="text-xs text-dim" style={{ fontWeight: 600 }}>Промпт для AI</label>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: "2px 10px" }}
                  onClick={() => { setAudienceShowPrompt(!audienceShowPrompt); }}
                >
                  {audienceShowPrompt ? "✕ Скрыть" : "📝 Показать/редактировать"}
                </button>
              </div>

              {audienceShowPrompt && (
                <div>
                  {audienceEditedPrompt ? (
                    <textarea
                      className="input" rows={10}
                      style={{ fontFamily: "monospace", fontSize: 12, width: "100%" }}
                      value={audienceEditedPrompt}
                      onChange={(e) => setAudienceEditedPrompt(e.target.value)}
                    />
                  ) : (
                    <div className="text-sm text-dim" style={{ textAlign: "center", padding: 16 }}>
                      {audienceGeneratedPrompt ? "⏳ Загрузка..." : "Загрузка данных проекта..."}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 10px" }} onClick={loadAudiencePrompt}>
                      🔄 Сформировать заново
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2" style={{ marginTop: 8 }}>
              <button
                className="btn btn-primary"
                onClick={() => generateAudienceDeep.mutate()}
                disabled={generateAudienceDeep.isPending || !audienceGeneratedPrompt}
              >
                {generateAudienceDeep.isPending ? (
                  <span>⏳ AI анализирует ЦА...</span>
                ) : audienceResult ? (
                  "Перезапустить анализ"
                ) : (
                  "Запустить анализ ЦА"
                )}
              </button>
            </div>

            {/* Results */}
            {audienceResult?.groups && audienceResult.groups.length > 0 && (
              <div className="flex flex-col gap-6" style={{ marginTop: 20 }}>
                {audienceResult.groups.map((group: any, gi: number) => (
                  <div key={gi} className="card" style={{ borderLeft: "4px solid var(--accent)" }}>
                    <div style={{
                      fontSize: 16, fontWeight: 700, marginBottom: 4, color: "var(--accent)",
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span>{group.name || `Сегмент ${gi + 1}`}</span>
                      {renderEditableField(gi, "name", "", group.name)}
                    </div>
                    {renderEditableField(gi, "summary", "Краткое описание", group.summary)}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
                      {renderEditableField(gi, "segments", "1. Группы-сегменты", group.segments)}
                      {renderEditableField(gi, "socialFactors", "2. Социальный фактор", group.socialFactors)}
                      {renderEditableField(gi, "pains", "3. Боли и проблемы", group.pains)}
                      {renderEditableField(gi, "fears", "4. Глобальные страхи", group.fears)}
                      {renderEditableField(gi, "irritations", "5. Что раздражает", group.irritations)}
                      {renderEditableField(gi, "goals", "6. Цели, желания, ценности", group.goals)}
                      {renderEditableField(gi, "beliefs", "7. Убеждения", group.beliefs)}
                      {renderEditableField(gi, "stepsToSolve", "8. Шаги для устранения проблемы", group.stepsToSolve)}
                      {renderEditableField(gi, "alternatives", "9. Альтернативные методы", group.alternatives)}
                      {renderEditableField(gi, "whyAlternativesFail", "10. Почему альтернативы не работают", group.whyAlternativesFail)}
                      <div style={{ gridColumn: "1 / -1" }}>
                        {renderEditableField(gi, "needFrequency", "11a. Частота потребности", group.needFrequency)}
                        {renderEditableField(gi, "needSituation", "11b. Ситуация потребности", group.needSituation)}
                      </div>
                      {renderEditableField(gi, "informationSources", "12. Где потребляют информацию", group.informationSources)}
                      {renderEditableField(gi, "touchpoints", "13. Точки контакта", group.touchpoints)}
                      {renderEditableField(gi, "desiredResult", "14. Желаемый результат", group.desiredResult)}
                      {renderEditableField(gi, "whyProductBetter", "15. Почему продукт лучше", group.whyProductBetter)}
                      {renderEditableField(gi, "globalFears", "16. Глобальные страхи", group.globalFears)}
                      {renderEditableField(gi, "objections", "17. Возражения", group.objections)}
                    </div>
                  </div>
                ))}

                {/* Save & continue */}
                <div style={{ textAlign: "center", marginTop: 12 }}>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 15, padding: "10px 32px" }}
                    onClick={() => saveAudienceResult.mutate()}
                    disabled={saveAudienceResult.isPending}
                  >
                    {saveAudienceResult.isPending ? "⏳ Сохранение..." : "Сохранить"}
                  </button>
                </div>
              </div>
            )}

            {audienceResult?.groups?.length === 0 && audienceResult && (
              <div className="text-sm text-dim" style={{ marginTop: 16, textAlign: "center" }}>
                AI не определил группы ЦА. Попробуйте отредактировать промпт и запустить снова.
              </div>
            )}
          </div>
        )}

        {/* Step: hant — лестница Ханта для каждой группы ЦА */}
        {step === "hant" && (
          <div>
            <h3 style={{ fontSize: 18, marginBottom: 8 }}>Лестница Ханта</h3>
            <p className="text-sm text-dim" style={{ marginBottom: 16 }}>
              Матрица пути клиента по 9 стадиям Ханта — отдельно для каждой группы ЦА
            </p>

            {!audienceResult?.groups?.length && !Array.isArray(audienceResult) && (
              <div className="card" style={{ textAlign: "center", padding: 20 }}>
                <div className="text-sm text-dim">Сначала выполните анализ ЦА на предыдущем шаге</div>
              </div>
            )}

            {((audienceResult?.groups?.length > 0) && hantData.length !== audienceResult.groups.length) && !generateHant.isPending && (
              <button
                className="btn btn-primary"
                onClick={() => generateHant.mutate()}
                disabled={generateHant.isPending}
              >
                {generateHant.isPending
                  ? "⏳ Построение..."
                  : hantData.length === 0
                    ? `Построить лестницы для ${audienceResult.groups.length} групп ЦА`
                    : `🔄 Перестроить лестницы для ${audienceResult.groups.length} групп ЦА`
                }
              </button>
            )}

            {Array.isArray(audienceResult) && hantData.length === 0 && !generateHant.isPending && (
              <button
                className="btn btn-primary"
                onClick={() => generateHant.mutate()}
                disabled={generateHant.isPending}
              >
                {generateHant.isPending ? "⏳ Построение..." : "Построить лестницу Ханта"}
              </button>
            )}

            {generateHant.isPending && (
              <div className="text-sm text-dim" style={{ textAlign: "center", padding: 20 }}>
                ⏳ AI строит лестницы Ханта для каждой группы ЦА...
              </div>
            )}

            {hantData.length > 0 && (
              <div>
                {/* Tabs for each group */}
                <div className="flex gap-1" style={{ marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
                  {hantData.map((journey: any, ji: number) => {
                    const stages = journey.stages || [];
                    return (
                      <button
                        key={ji}
                        className={`btn ${hantActiveGroup === ji ? "btn-primary" : "btn-ghost"}`}
                        style={{ fontSize: 12, padding: "6px 14px", whiteSpace: "nowrap" }}
                        onClick={() => setHantActiveGroup(ji)}
                      >
                        {journey.groupName || `Группа ${ji + 1}`} ({stages.length} ст.)
                      </button>
                    );
                  })}
                </div>

                {/* Stages for active group */}
                {hantData[hantActiveGroup] && (() => {
                  const stages = hantData[hantActiveGroup].stages || [];
                  return (
                    <div>
                      {hantData[hantActiveGroup].groupSummary && (
                        <div className="text-sm text-dim" style={{ marginBottom: 12 }}>
                          {hantData[hantActiveGroup].groupSummary}
                        </div>
                      )}
                      <div className="flex flex-col gap-3">
                        {stages.map((stage: any, si: number) => (
                          <div key={si} style={{
                            padding: 12,
                            background: "var(--bg-hover)",
                            borderRadius: 8,
                            borderLeft: `4px solid ${
                              stage.temperature === "cold" ? "#3b82f6"
                              : stage.temperature === "warm" ? "#f59e0b"
                              : stage.temperature === "hot" ? "#ef4444"
                              : "#8b5cf6"
                            }`,
                          }}>
                            <div className="flex items-center justify-between mb-2">
                              <span style={{ fontWeight: 600, fontSize: 13 }}>
                                Стадия {stage.stage}: {stage.label}
                              </span>
                              <span className="tag" style={{ fontSize: 9, textTransform: "uppercase" }}>
                                {stage.temperature}
                              </span>
                            </div>
                            <div className="text-xs" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 12px" }}>
                              {renderHantStageField(hantActiveGroup, si, "clientGoal", "Цель", stage.clientGoal)}
                              {renderHantStageField(hantActiveGroup, si, "clientActions", "Действия клиента", stage.clientActions)}
                              {renderHantStageField(hantActiveGroup, si, "contentFromActions", "Контент (действия)", stage.contentFromActions)}
                              {renderHantStageField(hantActiveGroup, si, "expectations", "Ожидания", stage.expectations)}
                              {renderHantStageField(hantActiveGroup, si, "contentFromExpectations", "Контент (ожидания)", stage.contentFromExpectations)}
                              {renderHantStageField(hantActiveGroup, si, "emotions", "Эмоции", stage.emotions)}
                              {renderHantStageField(hantActiveGroup, si, "tonality", "Тональность", stage.tonality)}
                              {renderHantStageField(hantActiveGroup, si, "touchpoints", "Точки контакта", stage.touchpoints)}
                              {renderHantStageField(hantActiveGroup, si, "experience", "Опыт клиента", stage.experience)}
                              {renderHantStageField(hantActiveGroup, si, "contentFromExperience", "Контент (опыт)", stage.contentFromExperience)}
                              {renderHantStageField(hantActiveGroup, si, "recommendations", "Рекомендации", stage.recommendations)}
                              {renderHantStageField(hantActiveGroup, si, "funnelPrototype", "Прототип воронки", stage.funnelPrototype)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Save & continue */}
                <div style={{ textAlign: "center", marginTop: 20 }}>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 15, padding: "10px 32px" }}
                    onClick={() => saveHantResult.mutate()}
                    disabled={saveHantResult.isPending}
                  >
                    {saveHantResult.isPending ? "⏳ Сохранение..." : "Сохранить"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step: value_prop */}
        {step === "value_prop" && (
          <div>
            <h3 style={{ fontSize: 18, marginBottom: 8 }}>Ценностное предложение</h3>
            <p className="text-sm text-dim" style={{ marginBottom: 16 }}>
              AI сформирует ценностное предложение на основе собранных данных
            </p>

            <button
              className="btn btn-primary"
              onClick={() => generateValueProp.mutate()}
              disabled={generateValueProp.isPending}
            >
              {generateValueProp.isPending ? "⏳ Генерация..." : "Сгенерировать ценностное предложение"}
            </button>

            {valuePropResult && (
              <div className="flex flex-col gap-4" style={{ marginTop: 16 }}>
                <div className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label className="text-xs text-dim" style={{ fontWeight: 600 }}>Формула</label>
                    <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 6px" }}
                      onClick={() => { setVpEditing("formula"); setVpEditBuffer(valuePropResult.formula || ""); }}>✏️</button>
                  </div>
                  {vpEditing === "formula" ? (
                    <div>
                      <textarea className="input" style={{ fontSize: 13, width: "100%", minHeight: 60, marginTop: 4 }}
                        value={vpEditBuffer} onChange={(e) => setVpEditBuffer(e.target.value)} rows={3} />
                      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                        <button className="btn btn-primary" style={{ fontSize: 10, padding: "2px 10px" }}
                          onClick={() => { setValuePropResult((p: any) => ({ ...p, formula: vpEditBuffer })); setVpEditing(null); }}>Ок</button>
                        <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 10px" }} onClick={() => setVpEditing(null)}>✕</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 15, lineHeight: 1.6, marginTop: 4, fontWeight: 500 }}>
                      {valuePropResult.formula}
                    </div>
                  )}
                </div>

                {["tasks", "products", "problems", "gains"].map((field) => {
                  const items = valuePropResult[field] || [];
                  const labels: Record<string, string> = {
                    tasks: "Задачи и цели ЦА",
                    products: "Товары и услуги",
                    problems: "Проблемы",
                    gains: "Выгоды и результат",
                  };
                  const isEditing = vpEditing === field;
                  const serialize = (arr: any[]) => arr.map((i: any) => `${i.text}|${i.score}`).join("\n");
                  const deserialize = (str: string) => str.split("\n").filter(Boolean).map(line => {
                    const [text = "", score = "1"] = line.split("|");
                    return { text: text.trim(), score: Math.min(3, Math.max(1, parseInt(score) || 1)) };
                  });

                  return (
                    <div className="card" key={field}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <label className="text-xs text-dim" style={{ fontWeight: 600 }}>{labels[field]}</label>
                        <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 6px" }}
                          onClick={() => { setVpEditing(field); setVpEditBuffer(serialize(items)); }}>✏️</button>
                      </div>
                      {isEditing ? (
                        <div>
                          <textarea className="input" style={{ fontSize: 12, width: "100%", minHeight: 80, marginTop: 4, fontFamily: "monospace" }}
                            value={vpEditBuffer} onChange={(e) => setVpEditBuffer(e.target.value)}
                            rows={Math.max(items.length + 1, 3)} />
                          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                            <button className="btn btn-primary" style={{ fontSize: 10, padding: "2px 10px" }}
                              onClick={() => { setValuePropResult((p: any) => ({ ...p, [field]: deserialize(vpEditBuffer) })); setVpEditing(null); }}>Ок</button>
                            <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 10px" }} onClick={() => setVpEditing(null)}>✕</button>
                          </div>
                          <div className="text-xs text-dim" style={{ marginTop: 4 }}>Формат: текст|оценка (1-3), одна строка на пункт</div>
                        </div>
                      ) : (
                        items.map((t: any, i: number) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, borderBottom: "1px solid var(--border)" }}>
                            <span>{t.text}</span>
                            <span style={{ color: "var(--accent)" }}>{"★".repeat(t.score)}{"☆".repeat(3 - t.score)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step: products */}
        {step === "products" && (
          <div>
            <h3 style={{ fontSize: 18, marginBottom: 8 }}>📦 Продукты</h3>
            <p className="text-sm text-dim" style={{ marginBottom: 16 }}>
              AI определит продукты/услуги на основе материалов. Можно добавить вручную.
            </p>

            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button
                className="btn btn-primary"
                onClick={() => generateProducts.mutate()}
                disabled={generateProducts.isPending}
              >
                {generateProducts.isPending ? "⏳ Генерация..." : "Сгенерировать из материалов"}
              </button>
              <button className="btn btn-ghost" onClick={addProduct}>
                ➕ Добавить продукт
              </button>
            </div>

            {productsResult.length > 0 && (
              <div className="flex flex-col gap-4">
                {productsResult.map((prod: any, i: number) => {
                  const renderField = (field: string, label: string, value: any) => {
                    const isEditing = productsEditing?.i === i && productsEditing?.field === field;
                    const displayValue = Array.isArray(value) ? value.join("\n") : String(value || "");
                    return (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                          <div style={{ flex: 1 }}>
                            {label && <strong style={{ fontSize: 12 }}>{label}:</strong>}
                            {isEditing ? (
                              <div>
                                <textarea
                                  className="input"
                                  style={{ fontSize: 12, fontFamily: "monospace", width: "100%", minHeight: 50 }}
                                  value={productsEditBuffer}
                                  onChange={(e) => setProductsEditBuffer(e.target.value)}
                                  rows={Array.isArray(value) ? Math.max(value.length + 1, 2) : 2}
                                />
                                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                                  <button className="btn btn-primary" style={{ fontSize: 10, padding: "2px 10px" }} onClick={confirmProductsEdit}>Ок</button>
                                  <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 10px" }} onClick={cancelProductsEdit}>✕</button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                                {Array.isArray(value)
                                  ? value.length > 0
                                    ? value.map((item: string, j: number) => <div key={j}>• {item}</div>)
                                    : <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>—</span>
                                  : <span>{displayValue || "—"}</span>}
                              </div>
                            )}
                          </div>
                          {!isEditing && (
                            <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 6px", flexShrink: 0 }}
                              onClick={() => startProductsEdit(i, field, displayValue)}>✏️</button>
                          )}
                        </div>
                      </div>
                    );
                  };

                  return (
                    <div key={prod.id || `new-${i}`} className="card" style={{ padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>{prod.name || "Новый продукт"}</div>
                        <button className="btn btn-ghost" style={{ fontSize: 11, color: "var(--danger)", padding: "2px 8px" }}
                          onClick={() => deleteProduct(i)}>🗑️</button>
                      </div>
                      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                        {renderField("name", "Название", prod.name)}
                        {renderField("description", "Описание", prod.description)}
                        {renderField("audienceDescription", "Целевая аудитория", prod.audienceDescription)}
                        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div style={{ background: "rgba(239,68,68,0.06)", borderRadius: 6, padding: 8 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: "#ef4444" }}>⚠️ Проблемы</div>
                            {renderField("pains", "", prod.pains)}
                          </div>
                          <div style={{ background: "rgba(34,197,94,0.06)", borderRadius: 6, padding: 8 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: "#22c55e" }}>✅ Выгоды</div>
                            {renderField("gains", "", prod.gains)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div style={{ textAlign: "center", marginTop: 8 }}>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 15, padding: "10px 32px" }}
                    onClick={saveProducts}
                    disabled={productsSaving}
                  >
                    {productsSaving ? "⏳ Сохранение..." : "Сохранить"}
                  </button>
                  {productsSaved && <div style={{ marginTop: 8, color: "var(--green)", fontSize: 13 }}>✅ Продукты сохранены</div>}
                </div>
              </div>
            )}

            {productsResult.length === 0 && (
              <div className="card" style={{ textAlign: "center", padding: 20 }}>
                <div className="text-sm text-dim">Продукты ещё не добавлены. Сгенерируйте из материалов или добавьте вручную.</div>
              </div>
            )}
          </div>
        )}

        {/* Step: platforms */}
        {step === "platforms" && (
          <div>
            <h3 style={{ fontSize: 18, marginBottom: 8 }}>📡 Площадки</h3>
            <p className="text-sm text-dim" style={{ marginBottom: 16 }}>
              AI предложит подходящие площадки для каждого продукта. Можно добавлять и редактировать вручную.
            </p>

            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button
                className="btn btn-primary"
                onClick={() => suggestPlatforms.mutate()}
                disabled={suggestPlatforms.isPending || productsResult.length === 0}
              >
                {suggestPlatforms.isPending ? "⏳ Подбор..." : "Подобрать площадки"}
              </button>
            </div>

            {productsResult.length === 0 && (
              <div className="card" style={{ textAlign: "center", padding: 20 }}>
                <div className="text-sm text-dim">Сначала добавьте продукты на предыдущем шаге.</div>
              </div>
            )}

            {platformsResult.length === 0 && productsResult.length > 0 && (
              <div className="card" style={{ textAlign: "center", padding: 20 }}>
                <div className="text-sm text-dim">Площадки ещё не добавлены. Нажмите «Подобрать площадки» или добавьте вручную.</div>
              </div>
            )}

            {platformsResult.length > 0 && (
              <div className="flex flex-col gap-4">
                {productsResult.map((product: any) => {
                  const productPlatforms = platformsResult.filter((pl: any) => pl.productId === product.id);
                  if (productPlatforms.length === 0) return null;
                  return (
                    <div key={product.id} className="card" style={{ padding: 16 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>
                        📦 {product.name}
                      </div>
                      {productPlatforms.map((pl: any, j: number) => {
                        const globalIdx = platformsResult.indexOf(pl);
                        const isEditing = platformsEditing?.i === globalIdx && platformsEditing?.field === "full";

                        return (
                          <div key={pl.id || `new-${j}`} style={{
                            padding: "8px 10px", background: "var(--bg-hover)", borderRadius: 6, marginBottom: 4,
                          }}>
                            {isEditing ? (
                              <div>
                                <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                                  <input className="input" style={{ fontSize: 13, flex: 1 }} value={platformsEditBuffer}
                                    onChange={(e) => setPlatformsEditBuffer(e.target.value)}
                                    placeholder="Название" />
                                  <button className="btn btn-primary" style={{ fontSize: 10, padding: "1px 8px" }} onClick={confirmPlatformsEdit}>Ок</button>
                                  <button className="btn btn-ghost" style={{ fontSize: 10, padding: "1px 8px" }} onClick={cancelPlatformsEdit}>✕</button>
                                </div>
                                <textarea className="input" style={{ fontSize: 11, width: "100%", minHeight: 28, marginBottom: 2 }}
                                  value={platformsEditBuffer}
                                  onChange={(e) => setPlatformsEditBuffer(e.target.value)}
                                  placeholder="Описание" rows={1} />
                              </div>
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{
                                  width: 10, height: 10, borderRadius: 5,
                                  background: PLATFORM_COLORS[pl.type] || "var(--accent)",
                                  flexShrink: 0,
                                }} />
                                <div style={{ fontWeight: 600, fontSize: 13, minWidth: 100 }}>{pl.name}</div>
                                <span className="tag" style={{ fontSize: 10 }}>{pl.type}</span>
                                <div style={{ flex: 1, fontSize: 12, color: "var(--text-dim)" }}>
                                  {pl.description || "—"}
                                </div>
                                <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600, flexShrink: 0 }}>#{pl.priority}</span>
                                <button className="btn btn-ghost" style={{ fontSize: 10, padding: "1px 6px", flexShrink: 0 }}
                                  onClick={() => startPlatformsEdit(globalIdx, "full", `${pl.name}\n${pl.description || ""}`)}>✏️</button>
                                <button className="btn btn-ghost" style={{ fontSize: 11, color: "var(--danger)", padding: "1px 6px", flexShrink: 0 }}
                                  onClick={() => deletePlatform(globalIdx)}>🗑️</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div style={{ marginTop: 8 }}>
                        {showAddPlatformForProduct === product.id ? (
                          <div className="flex flex-wrap gap-1">
                            {PLATFORM_OPTIONS.filter(
                              (opt) => !productPlatforms.some((pl: any) => pl.type === opt.value)
                            ).map((opt) => (
                              <button key={opt.value} className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }}
                                onClick={() => addPlatform(product.id, opt.value)}>
                                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: PLATFORM_COLORS[opt.value] || "var(--accent)", marginRight: 4 }} />
                                {opt.label}
                              </button>
                            ))}
                            <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }}
                              onClick={() => setShowAddPlatformForProduct(null)}>✕</button>
                          </div>
                        ) : (
                          <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }}
                            onClick={() => setShowAddPlatformForProduct(product.id)}>
                            ➕ Добавить площадку
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Platforms without product */}
                {platformsResult.some((pl: any) => !pl.productId) && (
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>📡 Без продукта</div>
                    {platformsResult.filter((pl: any) => !pl.productId).map((pl: any, j: number) => {
                      const globalIdx = platformsResult.indexOf(pl);
                      return (
                        <div key={pl.id || `orphan-${j}`} style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "8px 10px", background: "var(--bg-hover)", borderRadius: 6, marginBottom: 4,
                        }}>
                          <span style={{ fontWeight: 600, fontSize: 13, minWidth: 100 }}>{pl.name}</span>
                          <span className="tag" style={{ fontSize: 10 }}>{pl.type}</span>
                          <button className="btn btn-ghost" style={{ fontSize: 11, color: "var(--danger)", padding: "1px 6px", flexShrink: 0 }}
                            onClick={() => deletePlatform(globalIdx)}>🗑️</button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ textAlign: "center", marginTop: 8 }}>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 15, padding: "10px 32px" }}
                    onClick={savePlatforms}
                    disabled={platformsSaving}
                  >
                    {platformsSaving ? "⏳ Сохранение..." : "Сохранить"}
                  </button>
                  {platformsSaved && <div style={{ marginTop: 8, color: "var(--green)", fontSize: 13 }}>✅ Площадки сохранены</div>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step: complete */}
        {step === "complete" && (
          <div>
            <h3 style={{ fontSize: 18, marginBottom: 8 }}>Онбординг завершён</h3>
            <p className="text-sm text-dim" style={{ marginBottom: 20 }}>
              Все данные собраны. Можно перейти к стратегии или вернуться к любому шагу
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {(() => {
                const stepStatus = (key: string) => onboardingStatus?.steps?.find((s: any) => s.stepKey === key);
                const stepData = (key: string) => {
                  const s = stepStatus(key);
                  if (!s?.aiOutput) return null;
                  try { return JSON.parse(s.aiOutput); } catch { return null; }
                };
                const items = [
                  {
                    key: "scenario", label: "Сценарий",
                    done: !!scenario,
                    detail: scenario ? `«${scenario.slice(0, 50)}${scenario.length > 50 ? "…" : ""}»` : "Не указан",
                  },
                  {
                    key: "materials", label: "Материалы",
                    done: (realKnowledgeCount || 0) > 0,
                    detail: `${realKnowledgeCount || "0"} записей знаний`,
                  },
                  {
                    key: "competitors", label: "Конкуренты",
                    done: (() => {
                      if (savedCompetitorsCount > 0) return true;
                      const d = stepData("competitors");
                      return !!(d?.direct?.length || d?.indirect?.length);
                    })(),
                    detail: (() => {
                      if (savedCompetitorsCount > 0) return `${savedCompetitorsCount} конкурентов в базе`;
                      const d = stepData("competitors");
                      if (d?.direct?.length || d?.indirect?.length) return `${(d.direct?.length || 0) + (d.indirect?.length || 0)} конкурентов`;
                      return "Не проанализированы";
                    })(),
                  },
                  {
                    key: "audience", label: "Целевая аудитория",
                    done: !!stepData("audience"),
                    detail: (() => {
                      const d = stepData("audience");
                      if (!d) return "Не сформирована";
                      return `${d.groups?.length || 0} групп(ы), ${d.groups?.reduce((a: number, g: any) => a + (g.name ? 1 : 0), 0) || 0} описаны`;
                    })(),
                  },
                  {
                    key: "hant", label: "Лестница Ханта",
                    done: (() => {
                      const d = stepData("hant");
                      return Array.isArray(d) && d.length > 0 && d.some((g: any) => g.stages?.length > 0);
                    })(),
                    detail: (() => {
                      const d = stepData("hant");
                      if (!Array.isArray(d)) return "Не построена";
                      return `${d.length} групп(ы), ${d.reduce((a: number, g: any) => a + (g.stages?.length || 0), 0)} стадий`;
                    })(),
                  },
                  {
                    key: "value_prop", label: "Ценностное предложение",
                    done: (() => {
                      const d = stepData("value_prop");
                      return !!(d?.formula || d?.reason);
                    })(),
                    detail: (() => {
                      const d = stepData("value_prop");
                      if (!d) return "Не сгенерировано";
                      return d.formula ? `Формула: ${d.formula?.slice(0, 30)}…` : "Сгенерировано";
                    })(),
                  },
                  {
                    key: "products", label: "Продукты",
                    done: productsResult.length > 0,
                    detail: `${productsResult.length} продуктов`,
                  },
                  {
                    key: "platforms", label: "Площадки",
                    done: platformsResult.length > 0,
                    detail: `${platformsResult.length} площадок`,
                  },
                ];
                return items.map((item) => {
                  const stepIdx = STEPS.findIndex((s) => s.key === item.key);
                  return (
                    <button
                    key={item.key}
                    onClick={() => goToStep(stepIdx >= 0 ? stepIdx : 0)}
                    className="card"
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer",
                      borderLeft: `4px solid ${item.done ? "#22c55e" : "var(--border)"}`,
                      textAlign: "left", width: "100%", borderTopLeftRadius: 0, borderBottomLeftRadius: 0,
                      color: "var(--text)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{item.label}</div>
                      <div className="text-sm text-dim" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{item.detail}</div>
                    </div>
                    <span style={{
                      fontSize: 20, flexShrink: 0, fontWeight: 700,
                      color: item.done ? "#22c55e" : "var(--dim)",
                      background: item.done ? "rgba(34,197,94,0.1)" : "transparent",
                      borderRadius: "50%", width: 32, height: 32,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {item.done ? "✓" : "—"}
                    </span>
                  </button>
                  );
                });
              })()}
            </div>

            <div style={{ textAlign: "center", marginTop: 24 }}>
              <button className="btn btn-primary" style={{ fontSize: 16, padding: "12px 40px" }} onClick={finishOnboarding}>
                Перейти к стратегии
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between" style={{ marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={prevStep} disabled={stepIdx === 0}>
          ← Назад
        </button>
        <div className="text-xs text-dim">
          Шаг {stepIdx + 1} из {STEPS.length}
        </div>
        <button
          className="btn btn-primary"
          onClick={nextStep}
          disabled={stepIdx === STEPS.length - 1 || (!onboardingComplete && !isStepComplete(STEPS[stepIdx].key))}
          title={!onboardingComplete && !isStepComplete(STEPS[stepIdx].key) ? "Заполните этот шаг, чтобы продолжить" : ""}
        >
          Далее →
        </button>
      </div>
    </div>
  );
}
