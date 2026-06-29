import { Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "./lib/api";
import { getStoredProjectId, setStoredProjectId, clearStoredProjectId, getStoredPlatformId, setStoredPlatformId, clearStoredPlatformId, getStoredProductId, setStoredProductId, clearStoredProductId } from "./lib/project";
import { PLATFORM_COLORS } from "./lib/constants";
import { LicenseGate } from "./components/LicenseGate";
import { UpdateBanner } from "./components/UpdateBanner";
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
  { to: "/", label: "Дашборд", icon: "📊" },
];

const projectGlobalItems = [
  { to: "/unpack", label: "Распаковка", icon: "🔍" },
  { to: "/brand-styles", label: "Фирменный стиль", icon: "🎨" },
  { to: "/knowledge", label: "База знаний", icon: "📚" },
];

function ProjectSelector() {
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });
  const queryClient = useQueryClient();
  const storedId = getStoredProjectId();
  const [selectedId, setSelectedId] = useState(storedId);

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

  const navigate = useNavigate();

  const handleChange = (id: string) => {
    setSelectedId(id);
    setStoredProjectId(id);
  };

  return (
    <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span className="text-xs text-dim" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>Проект</span>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => navigate("/strategy")}>
          + Новый
        </button>
      </div>
      {projects?.length ? (
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

function ProductSection() {
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
  const storedProductId = getStoredProductId();
  const [selectedProductId, setSelectedProductId] = useState(storedProductId);
  const storedPlatformId = getStoredPlatformId();
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

  useEffect(() => {
    if (!platforms?.length) return;
    const valid = platforms.some((p: any) => p.id === selectedPlatformId);
    if (!selectedPlatformId || !valid) {
      const first = platforms[0].id;
      setSelectedPlatformId(first);
      setStoredPlatformId(first);
    }
  }, [platforms, selectedPlatformId]);

  if (!products?.length) return null;

  const platformsByProduct: Record<string, any[]> = {};
  if (platforms) {
    for (const pl of platforms) {
      const pid = pl.productId || "unknown";
      if (!platformsByProduct[pid]) platformsByProduct[pid] = [];
      platformsByProduct[pid].push(pl);
    }
  }

  return (
    <div>
      <div className="sidebar-section-label">Продукты</div>
      {products.map((product: any) => {
        const isActiveProduct = product.id === selectedProductId;
        const productPlatforms = platformsByProduct[product.id] || [];
        return (
          <div key={product.id}>
            <div
              className="sidebar-link"
              style={{
                cursor: "pointer",
                fontWeight: isActiveProduct ? 600 : 400,
                color: isActiveProduct ? "var(--text)" : "var(--text-dim)",
              }}
              onClick={() => { setSelectedProductId(product.id); setStoredProductId(product.id); }}
            >
              <span>📦</span>
              {product.name}
            </div>
            <div style={{ paddingLeft: 8 }}>
              {productPlatforms.map((pl: any) => (
                <div
                  key={pl.id}
                  className="sidebar-link"
                  style={{
                    cursor: "pointer", fontSize: 13, padding: "6px 12px",
                    background: pl.id === selectedPlatformId ? "var(--accent)" : "transparent",
                    color: pl.id === selectedPlatformId ? "white" : "var(--text-dim)",
                    borderRadius: 6, marginBottom: 1,
                  }}
                  onClick={() => { setSelectedPlatformId(pl.id); setStoredPlatformId(pl.id); navigate(`/strategy?platformId=${pl.id}`); }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: PLATFORM_COLORS[pl.type] || "var(--accent)", display: "inline-block", flexShrink: 0 }} />
                  {pl.name}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NavSection({ label, items }: { label: string; items: { to: string; label: string; icon: string }[] }) {
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
          <span>{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function PlatformNavSection() {
  const currentProjectId = getStoredProjectId();
  const storedPlatformId = getStoredPlatformId();
  const qs = storedPlatformId ? `?platformId=${storedPlatformId}` : "";

  const { data: platforms } = useQuery({
    queryKey: ["platforms", currentProjectId],
    queryFn: () => api.platforms.listByProject(currentProjectId!),
    enabled: !!currentProjectId,
  });
  const activePlatform = platforms?.find((p: any) => p.id === storedPlatformId);
  const { data: products } = useQuery({
    queryKey: ["products", currentProjectId],
    queryFn: () => api.products.listByProject(currentProjectId!),
    enabled: !!currentProjectId,
  });
  const activeProduct = products?.find((p: any) => p.id === activePlatform?.productId);

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

  if (!activePlatform) return null;

  const primaryItems = [
    { to: `/strategy${qs}`, label: "Стратегия", icon: "🎯" },
    { to: `/free-content${qs}`, label: "Свободный контент", icon: "✍️" },
    { to: `/calendar${qs}`, label: "Календарь", icon: "📅" },
    { to: `/queue${qs}`, label: "Публикации", icon: "📋" },
  ];

  const resourceItems = [
    { to: `/topics${qs}`, label: "Библиотека", icon: "📚" },
    { to: `/analytics${qs}`, label: "Аналитика", icon: "📈" },
    { to: `/assets${qs}`, label: "Медиатека", icon: "🖼" },
  ];

  return (
    <div>
      <div className="sidebar-section-label">
        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: PLATFORM_COLORS[activePlatform.type] || "var(--accent)", marginRight: 6 }} />
        {activePlatform.name}
        {activeProduct && (
          <span style={{
            marginLeft: 6, fontSize: 10, fontWeight: 500,
            background: "var(--accent)", color: "#fff",
            borderRadius: 4, padding: "1px 6px", lineHeight: "16px",
            verticalAlign: "middle",
          }}>
            {activeProduct.name}
          </span>
        )}
      </div>
      {primaryItems.map((item) => {
        if (item.to.startsWith("/queue")) {
          return (
            <NavLink key={item.to} to={item.to} end
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <span>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {queueCount > 0 && (
                <span style={{
                  background: "var(--accent)", color: "#fff", borderRadius: 10,
                  padding: "1px 7px", fontSize: 11, fontWeight: 600, lineHeight: "18px",
                }}>
                  {queueCount}
                </span>
              )}
            </NavLink>
          );
        }
        return (
          <NavLink key={item.to} to={item.to} end
            className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        );
      })}
      <div className="sidebar-section-label">Ресурсы</div>
      {resourceItems.map((item) => (
        <NavLink key={item.to} to={item.to} end
          className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
        >
          <span>{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

export default function App() {
  const [globalChatOpen, setGlobalChatOpen] = useState(false);
  const firstProjectId = getStoredProjectId();

  return (
    <LicenseGate>
      <UpdateBanner />
      <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>Фабрика контента</h1>
        </div>
        <ProjectSelector />
        <nav className="sidebar-nav">
          <NavSection label="Приложение" items={globalNavItems} />
          <NavSection label="Проект" items={projectGlobalItems} />
          <ProductSection />
          <PlatformNavSection />
        </nav>
        <div style={{ marginTop: "auto", borderTop: "1px solid var(--border)", padding: "8px 16px" }}>
          <NavLink
            to="/settings"
            end
            className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
          >
            <span>⚙</span>
            Настройки
          </NavLink>
        </div>
      </aside>
      <main className="main-content">
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
      {firstProjectId && !globalChatOpen && (
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
      {globalChatOpen && firstProjectId && (
        <ChatPanel projectId={firstProjectId} />
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
