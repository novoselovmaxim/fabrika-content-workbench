import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getStoredProjectId } from "../lib/project";

const CATEGORY_LABELS: Record<string, string> = {
  product: "Продукт",
  audience: "Аудитория",
  promise: "Обещание",
  constraint: "Ограничение",
  proof: "Доказательство",
  faq: "FAQ",
  other: "Другое",
};

const CATEGORY_COLORS: Record<string, string> = {
  product: "#6366f1",
  audience: "#06b6d4",
  promise: "#f59e0b",
  constraint: "#ef4444",
  proof: "#14b8a6",
  faq: "#8b5cf6",
  other: "#6b7280",
};

const SOURCE_LABELS: Record<string, string> = {
  knowledge_file: "Файл",
  note: "Заметка",
  manual: "Вручную",
  ai_inferred: "AI",
};

export default function BrandFactsPage() {
  const projectId = getStoredProjectId();
  const queryClient = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newFact, setNewFact] = useState({ category: "other", factText: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const { data: facts = [], isLoading } = useQuery({
    queryKey: ["brand-facts", projectId, categoryFilter],
    queryFn: () => api.brandFacts.byProject(projectId!, { category: categoryFilter || undefined }),
    enabled: !!projectId,
  });

  const createFact = useMutation({
    mutationFn: () => api.brandFacts.create({
      projectId: projectId!,
      category: newFact.category,
      factText: newFact.factText,
      sourceType: "manual",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-facts"] });
      setShowForm(false);
      setNewFact({ category: "other", factText: "" });
    },
  });

  const updateFact = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.brandFacts.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-facts"] });
      setEditingId(null);
    },
  });

  const deleteFact = useMutation({
    mutationFn: (id: string) => api.brandFacts.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["brand-facts"] }),
  });

  const extractFacts = useMutation({
    mutationFn: () => api.brandFacts.extract(projectId!),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["brand-facts"] });
      alert(`Извлечено фактов: ${res.extracted}`);
    },
  });

  const deriveFacts = useMutation({
    mutationFn: () => api.brandFacts.deriveFromOnboarding(projectId!),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["brand-facts"] });
      alert(`Выведено из онбординга: ${res.derived}`);
    },
  });

  if (!projectId) return <div className="text-dim p-8">Выберите проект</div>;

  return (
    <div className="page px-8 py-6" style={{ maxWidth: 1200 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <h1 className="text-lg" style={{ fontWeight: 600 }}>Факты бренда</h1>
        <div className="flex gap-2">
          <button className="btn btn-primary btn-sm" onClick={() => extractFacts.mutate()} disabled={extractFacts.isPending}>
            {extractFacts.isPending ? "Извлечение..." : "Извлечь из базы знаний"}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => deriveFacts.mutate()} disabled={deriveFacts.isPending}>
            {deriveFacts.isPending ? "Обработка..." : "Вывести из онбординга"}
          </button>
          <button className="btn btn-sm" style={{ background: "var(--accent)", color: "#fff" }} onClick={() => setShowForm(!showForm)}>
            + Факт вручную
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="flex flex-col gap-2">
            <select className="input" value={newFact.category} onChange={(e) => setNewFact({ ...newFact, category: e.target.value })}>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <textarea className="input" rows={3} placeholder="Текст факта" value={newFact.factText}
              onChange={(e) => setNewFact({ ...newFact, factText: e.target.value })} />
            <div className="flex gap-2">
              <button className="btn btn-sm" style={{ background: "var(--accent)", color: "#fff" }}
                onClick={() => createFact.mutate()} disabled={!newFact.factText.trim()}>Сохранить</button>
              <button className="btn btn-sm btn-ghost" onClick={() => { setShowForm(false); setNewFact({ category: "other", factText: "" }); }}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2" style={{ marginBottom: 16 }}>
        <button className={`btn btn-sm ${!categoryFilter ? "btn-primary" : "btn-ghost"}`} onClick={() => setCategoryFilter("")}>Все</button>
        {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
          <button key={k} className={`btn btn-sm ${categoryFilter === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setCategoryFilter(k)}>{v}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-dim">Загрузка...</div>
      ) : facts.length === 0 ? (
        <div className="card text-dim" style={{ textAlign: "center", padding: 40 }}>
          Фактов пока нет. Нажмите «Извлечь из базы знаний» или добавьте вручную.
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Категория</th>
              <th>Факт</th>
              <th>Источник</th>
              <th>Достоверность</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {facts.map((f: any) => (
              <tr key={f.id}>
                <td>
                  <span className="tag" style={{
                    background: `${CATEGORY_COLORS[f.category] || "#6b7280"}20`,
                    color: CATEGORY_COLORS[f.category] || "#6b7280",
                    borderColor: CATEGORY_COLORS[f.category] || "#6b7280",
                  }}>
                    {CATEGORY_LABELS[f.category] || f.category}
                  </span>
                </td>
                <td>
                  {editingId === f.id ? (
                    <div className="flex gap-2">
                      <textarea className="input" rows={2} value={editText} onChange={(e) => setEditText(e.target.value)}
                        style={{ minWidth: 300 }} />
                      <button className="btn btn-sm btn-primary" onClick={() => updateFact.mutate({ id: f.id, data: { factText: editText } })}>
                        💾
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setEditingId(null)}>✕</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 13 }}>{f.factText}</span>
                      <button className="btn btn-xs btn-ghost" onClick={() => { setEditingId(f.id); setEditText(f.factText); }}>✎</button>
                    </div>
                  )}
                </td>
                <td>
                  <span className="text-xs text-dim">{SOURCE_LABELS[f.sourceType] || f.sourceType}</span>
                </td>
                <td>
                  <span className="text-xs text-dim">{f.confidence != null ? Math.round(f.confidence * 100) + "%" : "—"}</span>
                </td>
                <td>
                  <label className="flex items-center gap-1" style={{ cursor: "pointer", fontSize: 13 }}>
                    <input type="checkbox" checked={!!f.validated}
                      onChange={(e) => updateFact.mutate({ id: f.id, data: { validated: e.target.checked } })} />
                    {f.validated ? "✓ Подтверждён" : "Не проверен"}
                  </label>
                </td>
                <td>
                  <button className="btn btn-xs btn-danger" onClick={() => { if (confirm("Удалить факт?")) deleteFact.mutate(f.id); }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
