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
  },
};
