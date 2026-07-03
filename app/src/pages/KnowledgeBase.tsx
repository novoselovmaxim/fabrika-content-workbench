import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getStoredProjectId } from "../lib/project";
import { useState, useRef, useCallback } from "react";

type EntryType = "file" | "note" | "link";

const TYPE_ICONS: Record<EntryType, string> = { file: "📄", note: "✏️", link: "🔗" };
const TYPE_LABELS: Record<EntryType, string> = { file: "Файл", note: "Заметка", link: "Ссылка" };

export default function KnowledgeBase() {
  const queryClient = useQueryClient();
  const currentProjectId = getStoredProjectId();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [showForm, setShowForm] = useState<EntryType | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [tags, setTags] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: entries = [], refetch } = useQuery({
    queryKey: ["knowledge", currentProjectId, typeFilter, search],
    queryFn: () => api.knowledge.list(currentProjectId!, { type: typeFilter || undefined, search: search || undefined }),
    enabled: !!currentProjectId,
  });

  const { data: stats } = useQuery({
    queryKey: ["knowledge-stats", currentProjectId],
    queryFn: () => api.knowledge.stats(currentProjectId!),
    enabled: !!currentProjectId,
  });

  const createNote = useMutation({
    mutationFn: () =>
      api.knowledge.create({ projectId: currentProjectId, type: "note", title: noteTitle, content: noteContent, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) }),
    onSuccess: () => { refetch(); setShowForm(null); setNoteTitle(""); setNoteContent(""); setTags(""); },
  });

  const createLink = useMutation({
    mutationFn: () =>
      api.knowledge.create({ projectId: currentProjectId, type: "link", title: linkTitle, content: linkUrl, sourceUrl: linkUrl, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) }),
    onSuccess: () => { refetch(); setShowForm(null); setLinkTitle(""); setLinkUrl(""); setTags(""); },
  });

  const uploadFile = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("projectId", currentProjectId!);
      if (tags) fd.append("tags", JSON.stringify(tags.split(",").map((t) => t.trim()).filter(Boolean)));
      return api.knowledge.upload(fd);
    },
    onSuccess: () => { refetch(); setTags(""); },
  });

  const updateEntry = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.knowledge.update(id, data),
    onSuccess: () => { refetch(); setEditingId(null); },
  });

  const deleteEntry = useMutation({
    mutationFn: (id: string) => api.knowledge.delete(id),
    onSuccess: () => refetch(),
  });

  const compressAll = useMutation({
    mutationFn: () => api.knowledge.compress(currentProjectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", currentProjectId] });
      refetch();
    },
  });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) uploadFile.mutate(file);
  }, [currentProjectId, tags]);

  const getTags = (entry: any) => {
    try { return entry.tags ? (typeof entry.tags === "string" ? JSON.parse(entry.tags) : entry.tags) : []; }
    catch { return []; }
  };

  const contextSize = stats ? `${Math.min(stats.totalChars, 4000)}/${4000}` : "...";

  if (!currentProjectId) {
    return (
      <div>
        <div className="page-header">
          <h2>База знаний</h2>
          <p>Сначала создайте проект в Стратегии</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h2>База знаний</h2>
          <p>Добавляйте информацию о проекте — AI будет использовать её во всех генерациях автоматически</p>
        </div>
        {stats && stats.total > 0 && (
          <button
            className="btn btn-ghost"
            onClick={() => compressAll.mutate()}
            disabled={compressAll.isPending}
            style={{ fontSize: 12 }}
          >
            {compressAll.isPending ? "Сжатие..." : "🔄 Сжать контекст AI"}
          </button>
        )}
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-3" style={{ marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}>
          📁 Загрузить файл
        </button>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: "none" }}
          multiple
          accept=".docx,.pptx,.xlsx,.pdf,.html,.htm,.txt,.md,.csv,.json"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            for (const f of files) uploadFile.mutate(f);
          }}
        />
        <button className="btn btn-ghost" onClick={() => setShowForm(showForm === "note" ? null : "note")}>
          ✏️ Заметка
        </button>
        <button className="btn btn-ghost" onClick={() => setShowForm(showForm === "link" ? null : "link")}>
          🔗 Ссылка
        </button>
        <div style={{ flex: 1 }} />
        <select className="input" style={{ width: 140 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Все типы</option>
          <option value="file">Файлы</option>
          <option value="note">Заметки</option>
          <option value="link">Ссылки</option>
        </select>
        <input
          className="input"
          style={{ width: 200 }}
          placeholder="🔍 Поиск..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Create forms */}
      {showForm === "note" && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="flex flex-col gap-3">
            <input className="input" placeholder="Название заметки" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
            <textarea className="input" rows={5} placeholder="Текст заметки (поддерживается Markdown)" value={noteContent} onChange={(e) => setNoteContent(e.target.value)} />
            <input className="input" placeholder="Теги через запятую: бренд, стиль, аудитория" value={tags} onChange={(e) => setTags(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={() => createNote.mutate()} disabled={!noteTitle || createNote.isPending}>
                {createNote.isPending ? "Сохранение..." : "💾 Сохранить"}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowForm(null)}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {showForm === "link" && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="flex flex-col gap-3">
            <input className="input" placeholder="Название ссылки" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
            <input className="input" placeholder="URL" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
            <input className="input" placeholder="Теги через запятую" value={tags} onChange={(e) => setTags(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={() => createLink.mutate()} disabled={!linkTitle || !linkUrl || createLink.isPending}>
                {createLink.isPending ? "Сохранение..." : "💾 Сохранить"}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowForm(null)}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Drag & drop zone */}
      <div
        className={`knowledge-dropzone ${dragOver ? "drag-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        {dragOver ? "📂 Отпустите файлы для загрузки" : "📁 Перетащите файлы сюда или нажмите для выбора"}
        <span className="text-xs text-dim">Поддерживаются: DOCX, PPTX, XLSX, PDF, HTML, TXT, MD, CSV, JSON</span>
      </div>

      {/* Entries list */}
      <div className="flex flex-col gap-3" style={{ marginTop: 20 }}>
        {entries.length === 0 ? (
          <div className="text-sm text-dim" style={{ textAlign: "center", padding: 40 }}>
            {search || typeFilter ? "Ничего не найдено" : "База знаний пуста. Добавьте файлы, заметки или ссылки."}
          </div>
        ) : (
          entries.map((entry: any) => {
            const entryTags = getTags(entry);
            return (
              <div key={entry.id} className="knowledge-card">
                <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 16 }}>{TYPE_ICONS[entry.type as EntryType] || "📄"}</span>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{entry.title}</span>
                    <span className="text-xs text-dim">{TYPE_LABELS[entry.type as EntryType] || entry.type}</span>
                    {entry.wordCount > 0 && <span className="text-xs text-dim">· {entry.wordCount} слов</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {entry.type === "link" && entry.sourceUrl && (
                      <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 6px" }}>🌐</a>
                    )}
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 6px" }}
                      onClick={() => { setEditingId(editingId === entry.id ? null : entry.id); setEditContent(entry.content || ""); }}>
                      {editingId === entry.id ? "✕" : "✏️"}
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 6px", color: "var(--red)" }}
                      onClick={() => { if (confirm("Удалить?")) deleteEntry.mutate(entry.id); }}>
                      🗑
                    </button>
                  </div>
                </div>

                {entryTags.length > 0 && (
                  <div className="flex gap-1" style={{ marginBottom: 6, flexWrap: "wrap" }}>
                    {entryTags.map((t: string) => (
                      <span key={t} className="knowledge-tag">{t}</span>
                    ))}
                  </div>
                )}

                {editingId === entry.id ? (
                  <div className="flex flex-col gap-2">
                    <textarea className="input" rows={6} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                    <div className="flex gap-2">
                      <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => updateEntry.mutate({ id: entry.id, data: { content: editContent } })}>
                        💾 Сохранить
                      </button>
                      <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditingId(null)}>Отмена</button>
                    </div>
                  </div>
                ) : (
                  (entry.content || "").length > 0 && (
                    <div className="text-sm text-dim knowledge-content-preview">
                      {(entry.content || "").slice(0, 500)}
                      {(entry.content || "").length > 500 ? "..." : ""}
                    </div>
                  )
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="knowledge-stats-bar">
          📊 {stats.total} записей · {stats.totalWords.toLocaleString()} слов · контекст ~{contextSize} зн.
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 8px", marginLeft: 8 }}
            onClick={() => compressAll.mutate()} disabled={compressAll.isPending}>
            {compressAll.isPending ? "Сжатие..." : "🔄 Сжать контекст AI"}
          </button>
        </div>
      )}
    </div>
  );
}
