const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });

  if (!res.ok) {
    let body: any = "";
    let json: any;
    try { json = await res.json(); body = json.error || JSON.stringify(json); } catch { body = await res.text().catch(() => ""); }
    const err: any = new Error(`API ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    err.body = json || {};
    throw err;
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  health: () => request<{ status: string }>("/health"),
  dashboard: { stats: (queryString?: string) => request<any>(`/dashboard/stats${queryString || ""}`) },

  projects: {
    list: () => request<any[]>("/projects"),
    get: (id: string) => request<any>(`/projects/${id}`),
    create: (data: any) => request<any>("/projects", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" }),
    unpack: (id: string) => request<any>(`/projects/${id}/unpack`, { method: "POST" }),
    unpackFromInterview: (id: string, answers: any[]) =>
      request<any>(`/projects/${id}/unpack-from-interview`, { method: "POST", body: JSON.stringify({ answers }) }),
    generateDesignSystem: (id: string) =>
      request<any>(`/projects/${id}/generate-design-system`, { method: "POST" }),
    importChannel: (id: string, data: { platform: string; identifier: string }) =>
      request<any>(`/onboarding/${id}/import-channel`, { method: "POST", body: JSON.stringify(data) }),
  },

  platforms: {
    listByProject: (projectId: string) => request<any[]>(`/platforms/project/${projectId}`),
    create: (data: any) => request<any>("/platforms", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/platforms/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/platforms/${id}`, { method: "DELETE" }),
  },

  strategy: {
    listByProject: (projectId: string, platformId?: string) => {
      const qs = platformId ? `?platformId=${platformId}` : "";
      return request<any[]>(`/strategy/project/${projectId}${qs}`);
    },
    create: (data: any) => request<any>("/strategy", { method: "POST", body: JSON.stringify(data) }),
    bulkCreate: (data: { projectId: string; platformId: string; blocks: any[] }) =>
      request<{ blocks: any[]; count: number }>("/strategy/bulk", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/strategy/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/strategy/${id}`, { method: "DELETE" }),
    aiImport: (formData: FormData) =>
      fetch("/api/strategy/ai-import", { method: "POST", body: formData }).then((r) => r.json()),
  },

  chat: {
    list: (projectId: string, sessionId: string) =>
      request<any[]>(`/chat/project/${projectId}?sessionId=${sessionId}`),
    send: (data: any) => request<any>("/chat", { method: "POST", body: JSON.stringify(data) }),
    apply: (data: { messageId: string; blockId: string }) =>
      request<any>("/chat/apply", { method: "POST", body: JSON.stringify(data) }),
  },

  knowledge: {
    list: (projectId: string, params?: { type?: string; tag?: string; search?: string }) => {
      const qs = new URLSearchParams();
      if (params?.type) qs.set("type", params.type);
      if (params?.tag) qs.set("tag", params.tag);
      if (params?.search) qs.set("search", params.search);
      const queryStr = qs.toString() ? `?${qs.toString()}` : "";
      return request<any[]>(`/knowledge/by-project/${projectId}${queryStr}`);
    },
    stats: (projectId: string) => request<any>(`/knowledge/stats/${projectId}`),
    create: (data: any) => request<any>("/knowledge", { method: "POST", body: JSON.stringify(data) }),
    upload: (formData: FormData) =>
      fetch("/api/knowledge/upload", { method: "POST", body: formData }).then((r) => r.json()),
    update: (id: string, data: any) => request<any>(`/knowledge/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/knowledge/${id}`, { method: "DELETE" }),
    compress: (projectId: string) => request<any>(`/knowledge/${projectId}/compress`, { method: "POST" }),
  },

  brandStyles: {
    get: (projectId: string) => request<any[]>(`/projects/${projectId}/brand-styles`),
    save: (projectId: string, styles: any[]) =>
      request<any>(`/projects/${projectId}/brand-styles`, { method: "PUT", body: JSON.stringify({ styles }) }),
    uploadLogo: (projectId: string, styleId: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return fetch(`/api/assets/upload-logo?projectId=${projectId}&styleId=${styleId}`, {
        method: "POST", body: form,
      }).then((r) => r.json()) as Promise<{ url: string }>;
    },
    deleteLogo: (projectId: string, styleId: string) =>
      request<void>(`/assets/delete-logo?projectId=${projectId}&styleId=${styleId}`, { method: "DELETE" }),
  },

  topics: {
    list: (projectId?: string, platformId?: string) => {
      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      if (platformId) params.set("platformId", platformId);
      const qs = params.toString() ? `?${params.toString()}` : "";
      return request<any[]>(`/topics${qs}`);
    },
    create: (data: any) => request<any>("/topics", { method: "POST", body: JSON.stringify(data) }),
    bulkCreate: (data: { projectId: string; platformId: string; topics: any[] }) =>
      request<{ topics: any[]; count: number }>("/topics/bulk", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/topics/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    bulkUpdate: (ids: string[], data: any) =>
      request<{ updated: any[]; count: number }>("/topics/bulk", { method: "PATCH", body: JSON.stringify({ ids, data }) }),
    delete: (id: string) => request<void>(`/topics/${id}`, { method: "DELETE" }),
  },

  rubrics: {
    list: (projectId?: string, platformId?: string) => {
      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      if (platformId) params.set("platformId", platformId);
      const qs = params.toString() ? `?${params.toString()}` : "";
      return request<any[]>(`/rubrics${qs}`);
    },
    create: (data: any) => request<any>("/rubrics", { method: "POST", body: JSON.stringify(data) }),
    bulkCreate: (data: { projectId: string; platformId: string; rubrics: any[] }) =>
      request<{ rubrics: any[]; count: number }>("/rubrics/bulk", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/rubrics/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/rubrics/${id}`, { method: "DELETE" }),
  },

  contentTypes: { list: () => request<any[]>("/content-types") },

  posts: {
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<any[]>(`/posts${qs}`);
    },
    get: (id: string) => request<any>(`/posts/${id}`),
    create: (data: any) => request<any>("/posts", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/posts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/posts/${id}`, { method: "DELETE" }),
    bulkFromTopics: (data: { projectId: string; platformId?: string; topicIds: string[]; status?: string }) =>
      request<{ posts: any[]; count: number; skipped?: any[] }>("/posts/bulk-from-topics", { method: "POST", body: JSON.stringify(data) }),
  },

  drafts: {
    listByPost: (postId: string) => request<any[]>(`/drafts/by-post/${postId}`),
    create: (data: any) => request<any>("/drafts", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/drafts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/drafts/${id}`, { method: "DELETE" }),
  },

  assets: {
    listByPost: (postId: string) => request<any[]>(`/assets/by-post/${postId}`),
    create: (data: any) => request<any>("/assets", { method: "POST", body: JSON.stringify(data) }),
  },

  pipeline: {
    listByPost: (postId: string) => request<any[]>(`/pipeline/by-post/${postId}`),
    create: (data: any) => request<any>("/pipeline", { method: "POST", body: JSON.stringify(data) }),
  },

  products: {
    listByProject: (projectId: string) => request<any[]>(`/products?projectId=${projectId}`),
    create: (data: any) => request<any>("/products", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/products/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/products/${id}`, { method: "DELETE" }),
  },

  audiences: {
    listByProject: (projectId: string) => request<any[]>(`/audiences?projectId=${projectId}`),
    create: (data: any) => request<any>("/audiences", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/audiences/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/audiences/${id}`, { method: "DELETE" }),
    generate: (projectId: string, data: { mode?: string; note?: string }) =>
      request<any>(`/onboarding/${projectId}/generate-audience`, { method: "POST", body: JSON.stringify(data) }),
  },

  onboarding: {
    getAudiencePrompt: (projectId: string) =>
      request<{ prompt: string }>(`/onboarding/${projectId}/generate-audience-deep-prompt`),
    generateAudienceDeep: (projectId: string, promptOverride?: string) =>
      request<any>(`/onboarding/${projectId}/generate-audience-deep`, {
        method: "POST",
        body: JSON.stringify({ promptOverride }),
      }),
    saveAudience: (projectId: string, result: any) =>
      request<any>(`/onboarding/${projectId}/save-audience`, {
        method: "POST",
        body: JSON.stringify({ result }),
      }),
    generateHantMulti: (projectId: string) =>
      request<any>(`/onboarding/${projectId}/generate-hant-multi`, { method: "POST" }),
    saveHant: (projectId: string, journeys: any) =>
      request<any>(`/onboarding/${projectId}/save-hant`, {
        method: "POST",
        body: JSON.stringify({ journeys }),
      }),
    updateStep: (projectId: string, stepKey: string, data: { status?: string; manualOverride?: any }) =>
      request<any>(`/onboarding/${projectId}/step/${stepKey}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },

  keywords: {
    listByProject: (projectId: string) => request<any[]>(`/keywords/project/${projectId}`),
    createBulk: (projectId: string, keywords: { keyword: string; source?: string }[], replaceAll?: boolean) =>
      request<any>("/keywords/bulk", { method: "POST", body: JSON.stringify({ projectId, keywords, replaceAll }) }),
    delete: (id: string) => request<void>(`/keywords/${id}`, { method: "DELETE" }),
  },

  competitors: {
    listByProject: (projectId: string) => request<any[]>(`/competitors?projectId=${projectId}`),
    getLatest: (projectId: string) => request<any>(`/competitors/latest?projectId=${projectId}`),
    getSaved: (projectId: string) => request<any[]>(`/competitors/saved/${projectId}`),
    search: (projectId: string, data: { urls: string[]; keywords: string[] }) =>
      request<any>(`/competitors/search`, { method: "POST", body: JSON.stringify({ projectId, keywords: data.keywords }) }),
    delete: (id: string) => request<void>(`/competitors/${id}`, { method: "DELETE" }),
    deleteSaved: (id: string) => request<void>(`/competitors/saved/${id}`, { method: "DELETE" }),
    clearSaved: (projectId: string) => request<void>(`/competitors/saved/${projectId}/all`, { method: "DELETE" }),
    analyzeUrl: (projectId: string, urls: string[]) =>
      request<any>(`/competitors/analyze-url`, { method: "POST", body: JSON.stringify({ projectId, urls }) }),
  },

  generate: {
    suggestRubrics: (data: { projectId: string; platformId?: string }) =>
      request<any[]>("/generate/suggest-rubrics", { method: "POST", body: JSON.stringify(data) }),
    suggestTopics: (data: { projectId: string; platformId?: string; rubricId?: string; rubricName?: string; rubricDescription?: string }) =>
      request<any[]>("/generate/suggest-topics", { method: "POST", body: JSON.stringify(data) }),
  },

  funnels: {
    list: () => request<any[]>("/funnels"),
    get: (id: string) => request<any>(`/funnels/${id}`),
    listUsed: (projectId: string) => request<any[]>(`/funnels?projectId=${projectId}`),
  },

  reviewEvents: {
    reviewStatus: (id: string, reviewStatus: string, actorName?: string) =>
      request<any>(`/review-events/posts/${id}/review-status`, {
        method: "PATCH",
        body: JSON.stringify({ reviewStatus, actorName }),
      }),
    listByPost: (id: string) => request<any[]>(`/review-events/posts/${id}/review-events`),
  },

  analytics: {
    recomputeInsights: (projectId: string) =>
      request<{ recomputed: number }>(`/analytics/${projectId}/recompute-insights`, { method: "POST" }),
    listInsights: (projectId: string) => request<any[]>(`/analytics/${projectId}/insights`),
    deleteInsights: (projectId: string) => request<void>(`/analytics/${projectId}/insights`, { method: "DELETE" }),
    recomputePost: (postItemId: string) =>
      request<any>(`/analytics/post/${postItemId}/recompute`, { method: "POST" }),
    getPostAnalytics: (postItemId: string) =>
      request<any>(`/analytics/post/${postItemId}`),
    recomputeAll: (projectId: string) =>
      request<{ recomputed: number }>(`/analytics/project/${projectId}/recompute-all`, { method: "POST" }),
    getProjectAnalytics: (projectId: string) =>
      request<any[]>(`/analytics/project/${projectId}`),
    recomputeFunnel: (funnelId: string) =>
      request<any>(`/analytics/funnel/${funnelId}/recompute`, { method: "POST" }),
    getFunnelAnalytics: (funnelId: string) =>
      request<any[]>(`/analytics/funnel/${funnelId}`),
    createGoal: (data: { projectId: string; metricName: string; targetValue: number; period: string; deadlineDate?: string }) =>
      request<{ id: string }>("/analytics/goals", { method: "POST", body: JSON.stringify(data) }),
    getGoals: (projectId: string) =>
      request<any[]>(`/analytics/goals/${projectId}`),
    evaluateGoals: (projectId: string) =>
      request<{ evaluated: number; goals: any[] }>(`/analytics/goals/${projectId}/evaluate`, { method: "POST" }),
    deleteGoal: (id: string) =>
      request<void>(`/analytics/goals/${id}`, { method: "DELETE" }),
    periodReport: (projectId: string, period?: string) =>
      request<{ insightId: string; knowledgeId: string; summary: string; fullReport: string }>(
        `/analytics/${projectId}/period-report`, { method: "POST", body: JSON.stringify({ period }) }
      ),
    postSuggest: (postItemId: string) =>
      request<{ suggestions: any[] }>(`/analytics/post/${postItemId}/suggest`, { method: "POST" }),
    ingestCompetitor: (savedCompetitorId: string) =>
      request<{ ingested: number }>(`/analytics/competitor/${savedCompetitorId}/ingest`, { method: "POST" }),
    getCompetitorAnalytics: (savedCompetitorId: string) =>
      request<any[]>(`/analytics/competitor/${savedCompetitorId}`),
    competitorBenchmark: (projectId: string, competitorIds: string[]) =>
      request<{ insightId: string; analysis: string }>(
        `/analytics/${projectId}/competitor-benchmark`, { method: "POST", body: JSON.stringify({ competitorIds }) }
      ),
  },

  compliance: {
    check: (text: string, options?: { projectId?: string; platform?: string; useAi?: boolean; postType?: string; metadata?: any }) =>
      request<any>("/compliance/check", {
        method: "POST",
        body: JSON.stringify({ text, ...options }),
      }),
    checkDraft: (draftId: string, platform?: string) =>
      request<any>(`/compliance/draft/${draftId}/check`, {
        method: "POST",
        body: JSON.stringify({ platform }),
      }),
    checkPost: (postId: string, draftId?: string) =>
      request<any>(`/compliance/post/${postId}/check`, {
        method: "POST", body: JSON.stringify({ draftId }),
      }),
    suggestPostType: (text: string, title?: string) =>
      request<any>("/compliance/suggest-post-type", {
        method: "POST", body: JSON.stringify({ text, title }),
      }),
    suggestAgeRating: (text: string) =>
      request<any>("/compliance/suggest-age-rating", {
        method: "POST", body: JSON.stringify({ text }),
      }),
    listPolicyRules: () => request<any[]>("/compliance/policy-rules"),
    createPolicyRule: (data: { code: string; description: string; pattern?: string; severity?: string }) =>
      request<any>("/compliance/policy-rules", { method: "POST", body: JSON.stringify(data) }),
    updatePolicyRule: (id: string, data: any) =>
      request<any>(`/compliance/policy-rules/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deletePolicyRule: (id: string) => request<void>(`/compliance/policy-rules/${id}`, { method: "DELETE" }),
    listRules: () => request<any[]>("/compliance/rules"),
    syncRules: () => request<any>("/compliance/rules/sync", { method: "POST" }),
    toggleRule: (ruleId: string, data: any) =>
      request<any>(`/compliance/rules/${ruleId}`, { method: "PATCH", body: JSON.stringify(data) }),
    getHistory: (draftId: string) => request<any[]>(`/compliance/history/${draftId}`),
  },

  brandFacts: {
    byProject: (projectId: string, params?: { category?: string; validated?: number; sourceType?: string }) => {
      const qs = new URLSearchParams();
      if (params?.category) qs.set("category", params.category);
      if (params?.validated !== undefined) qs.set("validated", String(params.validated));
      if (params?.sourceType) qs.set("sourceType", params.sourceType);
      const queryStr = qs.toString() ? `?${qs.toString()}` : "";
      return request<any[]>(`/brand-facts/by-project/${projectId}${queryStr}`);
    },
    create: (data: { projectId: string; category: string; factText: string; sourceType?: string; confidence?: number }) =>
      request<any>("/brand-facts", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/brand-facts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/brand-facts/${id}`, { method: "DELETE" }),
    extract: (projectId: string) =>
      request<{ extracted: number }>(`/brand-facts/${projectId}/extract`, { method: "POST" }),
    deriveFromOnboarding: (projectId: string) =>
      request<{ derived: number }>(`/brand-facts/${projectId}/derive-from-onboarding`, { method: "POST" }),
  },

  metrics: {
    check: (platform: string, identifier: string) =>
      request<{ valid: boolean; error?: string; name?: string; subscribers?: number | null }>(
        "/metrics/check", { method: "POST", body: JSON.stringify({ platform, identifier }) }
      ),
    fetch: (platform: string, identifier: string) =>
      request<any>("/metrics/fetch", { method: "POST", body: JSON.stringify({ platform, identifier }) }),
  },
};
