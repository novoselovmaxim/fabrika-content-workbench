import { Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { api } from "./lib/api";
import { getStoredProjectId, setStoredProjectId, clearStoredProjectId, getStoredPlatformId, setStoredPlatformId, clearStoredPlatformId, getStoredProductId, setStoredProductId, clearStoredProductId } from "./lib/project";
import { LicenseGate } from "./components/LicenseGate";

import Dashboard from "./pages/Dashboard";
import CalendarPage from "./pages/CalendarPage";
import FreeContentPage from "./pages/FreeContentPage";
import TopicsPage from "./pages/TopicsPage";
import PostCardPage from "./pages/PostCardPage";
import QueuePage from "./pages/QueuePage";
import AnalyticsPage from "./pages/AnalyticsPage";
import SettingsPage from "./pages/SettingsPage";
import AssetsPage from "./pages/AssetsPage";
import StrategyPage from "./pages/StrategyPage";
import BrandStylesPage from "./pages/BrandStylesPage";
import KnowledgeBase from "./pages/KnowledgeBase";
import UnpackPage from "./pages/UnpackPage";
import ChatPanel from "./components/ChatPanel";

const globalNavItems = [
  { to: "/", label: "Дашборд" },
];

const projectGlobalItems = [
  { to: "/unpack", label: "Распаковка" },
  { to: "/brand-styles", label: "Фирменный стиль" },
  { to: "/knowledge", label: "База знаний" },
];

function ProjectSelector() {
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });
  const queryClient = useQueryClient();
  const storedId = getStoredProjectId();
  const [selectedId, setSelectedId] = useState(storedId);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const deleteProject = useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["platforms"] });
      if (getStoredProjectId() === deletedId) {
        clearStoredProjectId();
        clearStoredPlatformId();
      }
    },
  });

  const createProject = useMutation({
    mutationFn: (name: string) => api.projects.create({ name }),
    onSuccess: (project) => {
      setStoredProjectId(project.id);
      setSelectedId(project.id);
      setCreating(false);
      setNewName("");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate("/unpack");
    },
  });

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  // Auto-save first project to localStorage if nothing is stored yet
  useEffect(() => {
    const stored = getStoredProjectId();
    if (projects?.length) {
      if (!stored || !projects.some(p => p.id === stored)) {
        const id = projects.find(p => p.name.includes("Берег"))?.id || projects[0].id;
        setStoredProjectId(id);
        setSelectedId(id);
      }
    }
  }, [projects]);

  const currentId = selectedId && projects?.find((p: any) => p.id === selectedId)
    ? selectedId
    : projects?.[0]?.id;

  const handleChange = (id: string) => {
    setSelectedId(id);
    setStoredProjectId(id);
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (name) createProject.mutate(name);
  };

  const cancelCreate = () => {
    setCreating(false);
    setNewName("");
  };

  return (
    <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span className="text-xs text-dim" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>Проект</span>
        {!creating && (
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => setCreating(true)}>
            + Новый
          </button>
        )}
      </div>
      {creating ? (
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            className="input"
            placeholder="Название проекта"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") cancelCreate();
            }}
            style={{ fontSize: 13, fontWeight: 600 }}
          />
          <div className="flex items-center gap-2">
            <button
              className="btn btn-primary"
              style={{ fontSize: 12, padding: "4px 12px" }}
              onClick={handleCreate}
              disabled={!newName.trim() || createProject.isPending}
            >
              {createProject.isPending ? "Создание..." : "Создать"}
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 8px" }} onClick={cancelCreate}>
              Отмена
            </button>
          </div>
        </div>
      ) : projects?.length ? (
        <div className="flex items-center gap-1">
          <select
            className="input"
            value={currentId || ""}
            onChange={(e) => handleChange(e.target.value)}
            style={{ fontSize: 13, fontWeight: 600, flex: 1 }}
          >
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {currentId && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: 14, padding: "2px 6px", color: "var(--danger, #e74c3c)", flexShrink: 0 }}
              title="Удалить проект"
              onClick={() => {
                const p = projects.find((x: any) => x.id === currentId);
                if (confirm(`Удалить проект «${p?.name}» и все его данные? Это действие нельзя отменить.`)) {
                  deleteProject.mutate(currentId, {
                    onSuccess: () => {
                      if (selectedId === currentId) setSelectedId(undefined);
                    },
                  });
                }
              }}
            >
              🗑
            </button>
          )}
        </div>
      ) : (
        <div className="text-sm text-dim" style={{ padding: "4px 0" }}>Нет проектов</div>
      )}
    </div>
  );
}

function ContextSection() {
  const navigate = useNavigate();
  const currentProjectId = getStoredProjectId();

  const { data: products } = useQuery({
    queryKey: ["products", currentProjectId],
    queryFn: () => api.products.listByProject(currentProjectId!),
    enabled: !!currentProjectId,
  });
  const { data: platforms } = useQuery({
    queryKey: ["platforms", currentProjectId],
    queryFn: () => api.platforms.listByProject(currentProjectId!),
    enabled: !!currentProjectId,
  });

  const { data: readyPosts } = useQuery({
    queryKey: ["posts", "ready", currentProjectId],
    queryFn: () => {
      const params: Record<string, string> = { status: "ready" };
      if (currentProjectId) params.projectId = currentProjectId;
      return api.posts.list(params);
    },
    enabled: !!currentProjectId,
  });
  const { data: scheduledPosts } = useQuery({
    queryKey: ["posts", "scheduled", currentProjectId],
    queryFn: () => {
      const params: Record<string, string> = { status: "scheduled" };
      if (currentProjectId) params.projectId = currentProjectId;
      return api.posts.list(params);
    },
    enabled: !!currentProjectId,
  });
  const queueCount = (readyPosts?.length || 0) + (scheduledPosts?.length || 0);

  const storedProductId = getStoredProductId();
  const storedPlatformId = getStoredPlatformId();
  const [selectedProductId, setSelectedProductId] = useState(storedProductId);
  const [selectedPlatformId, setSelectedPlatformId] = useState(storedPlatformId);

  useEffect(() => {
    if (!products?.length) return;
    const valid = products.some((p: any) => p.id === selectedProductId);
    if (!selectedProductId || !valid) {
      const first = products[0].id;
      setSelectedProductId(first);
      setStoredProductId(first);
    }
  }, [products, selectedProductId]);

  const productPlatforms = (platforms || []).filter((p: any) => p.productId === selectedProductId);
  const activePlatformId = productPlatforms.some((p: any) => p.id === selectedPlatformId)
    ? selectedPlatformId
    : productPlatforms[0]?.id;

  useEffect(() => {
    if (activePlatformId) {
      setSelectedPlatformId(activePlatformId);
      setStoredPlatformId(activePlatformId);
    }
  }, [activePlatformId]);

  const hasContent = !!(products?.length && platforms?.length);

  if (!hasContent) {
    const skeletonNav = [
      { section: "❷  План", items: [
        "Стратегия",
        "Свободный контент",
      ]},
      { section: "❸  Запуск", items: [
        "Календарь",
        "Публикации",
      ]},
      { section: "Инструменты", items: [
        "Библиотека",
        "Аналитика",
        "Медиатека",
      ]},
    ];

    return (
      <div style={{ opacity: 0.35, pointerEvents: "none", userSelect: "none" }}>
        <div className="sidebar-section-label" style={{ fontSize: 10, letterSpacing: 1, opacity: 0.5, textAlign: "center" }}>
          ─  Контекст  ─
        </div>
        <div style={{ padding: "4px 12px", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          Продукт
        </div>
        <div style={{ padding: "4px 12px", fontSize: 12, fontWeight: 500, color: "var(--text-dim)" }}>
          Платформа
        </div>
        <div style={{ marginTop: 4 }}>
          {skeletonNav.map((g) => (
            <div key={g.section}>
              <div className="sidebar-section-label">{g.section}</div>
              {g.items.map((label) => (
                <div key={label} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 8,
                  color: "var(--text-dim)", textDecoration: "none", fontSize: 14,
                }}>
                  {label}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-dim)", textAlign: "center", pointerEvents: "auto" }}>
          👆 Пройдите <span style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }} onClick={() => navigate("/unpack")}>распаковку</span>, чтобы активировать разделы
        </div>
      </div>
    );
  }

  const activeProduct = products.find((p: any) => p.id === selectedProductId);
  const qs = activePlatformId ? `?platformId=${activePlatformId}` : "";

  return (
    <div>
      <div className="sidebar-section-label" style={{ fontSize: 10, letterSpacing: 1, opacity: 0.5, textAlign: "center" }}>
        ─  Контекст  ─
      </div>

      {products.length > 1 ? (
        <div style={{ padding: "4px 12px" }}>
          <select
            className="input"
            value={selectedProductId || ""}
            onChange={(e) => { setSelectedProductId(e.target.value); setStoredProductId(e.target.value); }}
            style={{ fontSize: 12, fontWeight: 600 }}
          >
            {products.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      ) : activeProduct ? (
        <div style={{ padding: "4px 12px", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          {activeProduct.name}
        </div>
      ) : null}

      {productPlatforms.length > 1 ? (
        <div style={{ padding: "4px 12px" }}>
          <select
            className="input"
            value={activePlatformId || ""}
            onChange={(e) => { setSelectedPlatformId(e.target.value); setStoredPlatformId(e.target.value); }}
            style={{ fontSize: 12, fontWeight: 500 }}
          >
            {productPlatforms.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      ) : productPlatforms.length === 1 ? (
        <div style={{ padding: "4px 12px", fontSize: 12, fontWeight: 500, color: "var(--text-dim)" }}>
          {productPlatforms[0].name}
        </div>
      ) : null}

      <div style={{ marginTop: 4 }}>
        <div className="sidebar-section-label">❷  План</div>
        <NavLink to={`/strategy${qs}`} end className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          Стратегия
        </NavLink>
        <NavLink to={`/free-content${qs}`} end className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          Свободный контент
        </NavLink>

        <div className="sidebar-section-label">❸  Запуск</div>
        <NavLink to={`/calendar${qs}`} end className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          Календарь
        </NavLink>
        <NavLink to={`/queue${qs}`} end className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          <span style={{ flex: 1 }}>Публикации</span>
          {queueCount > 0 && (
            <span style={{
              background: "var(--accent)", color: "#fff", borderRadius: 10,
              padding: "1px 7px", fontSize: 11, fontWeight: 600, lineHeight: "18px",
            }}>
              {queueCount}
            </span>
          )}
        </NavLink>

        <div className="sidebar-section-label">Инструменты</div>
        <NavLink to={`/topics${qs}`} end className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          Библиотека
        </NavLink>
        <NavLink to={`/analytics${qs}`} end className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          Аналитика
        </NavLink>
        <NavLink to={`/assets${qs}`} end className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          Медиатека
        </NavLink>
      </div>
    </div>
  );
}

function NavSection({ label, items }: { label: string; items: { to: string; label: string }[] }) {
  return (
    <div>
      <div className="sidebar-section-label">{label}</div>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            `sidebar-link ${isActive ? "active" : ""}`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

export default function App() {
  const [globalChatOpen, setGlobalChatOpen] = useState(false);

  const currentProjectId = getStoredProjectId();

  return (
    <LicenseGate>
      <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>Фабрика контента</h1>
        </div>
        <ProjectSelector />
        <nav className="sidebar-nav">
          <NavSection label="Приложение" items={globalNavItems} />
          <NavSection label="❶  Разведка" items={projectGlobalItems} />
          <ContextSection />
        </nav>
        <div style={{ borderTop: "1px solid var(--border)", padding: "8px 16px" }}>
          <NavLink
            to="/settings"
            end
            className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
          >
            Настройки
          </NavLink>
        </div>
      </aside>
      <main className="main-content" key={currentProjectId || "no-project"}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/unpack" element={<UnpackPage />} />
          <Route path="/strategy" element={<StrategyPage />} />
          <Route path="/brand-styles" element={<BrandStylesPage />} />
          <Route path="/knowledge" element={<KnowledgeBase />} />
          <Route path="/free-content" element={<FreeContentPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/topics" element={<TopicsPage />} />
          <Route path="/posts/:id" element={<PostCardPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/queue" element={<QueuePage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      {/* Global chat button */}
      {currentProjectId && !globalChatOpen && (
        <button
          onClick={() => setGlobalChatOpen(true)}
          style={{
            position: "fixed", bottom: 80, right: 20, zIndex: 9999,
            width: 52, height: 52, borderRadius: 26,
            background: "var(--accent)", border: "none", cursor: "pointer",
            fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(99,102,241,0.4)",
          }}
          title="AI Чат"
        >
          🤖
        </button>
      )}
      {globalChatOpen && currentProjectId && (
        <ChatPanel projectId={currentProjectId} key={currentProjectId} />
      )}
      {globalChatOpen && (
        <style>{`
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        `}</style>
      )}
    </div>
    </LicenseGate>
  );
}
