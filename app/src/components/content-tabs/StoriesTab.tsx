import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import type { ContentTabHandle } from "./PostTab";

const StoriesTab = forwardRef<ContentTabHandle, { post: any; postId: string }>(({ post, postId }, ref) => {
  const [cards, setCards] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatingImage, setGeneratingImage] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [brandStyles, setBrandStyles] = useState<any[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<string>("");
  const snapRef = useRef({ cardsJson: "" });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/drafts/by-post/${postId}`);
        const drafts = await res.json();
        const storiesDraft = drafts?.find((d: any) => d.stage === "stories");
        if (storiesDraft?.contentJson) {
          let parsed;
          try { parsed = JSON.parse(storiesDraft.contentJson); } catch { parsed = null; }
          if (parsed?.stories) {
            setCards(parsed.stories);
            snapRef.current.cardsJson = JSON.stringify(parsed.stories);
          }
        }
      } catch {}
    })();
  }, [postId]);

  useEffect(() => {
    if (!post.projectId) return;
    fetch(`/api/projects/${post.projectId}/brand-styles`)
      .then((r) => r.json())
      .then((styles) => {
        setBrandStyles(styles);
        const active = styles.find((s: any) => s.isActive);
        if (active) setSelectedStyleId(active.id);
      })
      .catch(() => {});
  }, [post.projectId]);

  const applicableStyles = brandStyles.filter(
    (s) => s.contentType === "all" || s.contentType === "stories"
  );
  const selectedStyle = applicableStyles.find((s) => s.id === selectedStyleId);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: "stories-board",
          postItemId: postId,
          variables: {
            title: post.title,
            rubric: post.rubricName || "",
            goal: post.goal || "",
            hook: post.hook || "",
            cta: post.cta || "",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      let parsed;
      try {
        const cleaned = data.content.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { stories: [] };
      }
      if (parsed.stories) setCards(parsed.stories);
    } finally {
      setGenerating(false);
    }
  };

  const updateCard = (i: number, field: string, value: string) => {
    setCards((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  };

  const generateImage = async (i: number) => {
    setGeneratingImage(i);
    try {
      const res = await fetch("/api/assets/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postItemId: postId,
          prompt: cards[i].visualNote,
          size: "1080x1920",
          stylePrompt: selectedStyle?.systemPrompt || "",
        }),
      });
      if (!res.ok) throw new Error(((await res.json()).error || "Ошибка"));
      const asset = await res.json();
      setCards((prev) => prev.map((c, idx) => idx === i ? { ...c, imageUrl: asset.sourceUrl } : c));
    } catch (err: any) {
      alert("❌ " + err.message);
    } finally {
      setGeneratingImage(null);
    }
  };

  const saveDraft = async () => {
    setSaving(true);
    await fetch("/api/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postItemId: postId,
        stage: "stories",
        contentMarkdown: cards.map((c) => `Карточка ${c.slide || ""}: ${c.text}`).join("\n"),
        contentJson: JSON.stringify({ stories: cards }),
      }),
    });
    snapRef.current.cardsJson = JSON.stringify(cards);
    setSaving(false);
  };

  useImperativeHandle(ref, () => ({
    saveDraft: saveDraft as unknown as () => Promise<string | null>,
    isDirty: () => JSON.stringify(cards) !== snapRef.current.cardsJson,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="card-header">
        <span className="card-title">Сценарий Stories</span>
      </div>

      <button className="btn btn-primary" onClick={generate} disabled={generating} style={{ alignSelf: "flex-start" }}>
        {generating ? "Генерация..." : "🔥 Сгенерировать сценарий"}
      </button>

      {cards.length > 0 && (
        <div className="flex flex-col gap-4">
          {applicableStyles.length > 0 && (
            <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
              <label className="text-sm text-dim" style={{ fontWeight: 500 }}>Фирменный стиль:</label>
              <select
                className="input"
                style={{ width: 260 }}
                value={selectedStyleId}
                onChange={(e) => setSelectedStyleId(e.target.value)}
              >
                <option value="">Без стиля</option>
                {applicableStyles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || "Без названия"}
                  </option>
                ))}
              </select>
              {selectedStyle && (
                <span className="tag tag-ready" style={{ fontSize: 11 }}>
                  Применяется к генерации
                </span>
              )}
            </div>
          )}

          {cards.map((card, i) => (
            <div key={i} style={{ padding: 14, background: "var(--bg-hover)", borderRadius: 8 }}>
              <div className="flex items-center justify-between mb-2">
                <span style={{ fontWeight: 600, fontSize: 14 }}>Карточка {card.slide || i + 1}</span>
                <span className="tag tag-planned" style={{ fontSize: 10 }}>{i + 1}/{cards.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                <div>
                  <label className="text-xs text-dim" style={{ display: "block", marginBottom: 2 }}>Текст на экране</label>
                  <input className="input" value={card.text || ""} onChange={(e) => updateCard(i, "text", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-dim" style={{ display: "block", marginBottom: 2 }}>Визуальная заметка</label>
                  <div className="flex gap-2">
                    <input className="input" style={{ flex: 1 }} value={card.visualNote || ""} onChange={(e) => updateCard(i, "visualNote", e.target.value)} />
                    {card.visualNote && (
                      <button
                        className="btn btn-ghost"
                        style={{ flexShrink: 0, fontSize: 14, padding: "4px 8px", opacity: generatingImage === i ? 0.5 : 1 }}
                        disabled={generatingImage === i}
                        onClick={() => generateImage(i)}
                      >
                        {generatingImage === i ? "⏳" : "🖼"}
                      </button>
                    )}
                  </div>
                </div>
                {card.imageUrl && (
                  <div style={{ marginTop: 8, borderRadius: 8, overflow: "hidden", maxWidth: 200 }}>
                    <img src={card.imageUrl} alt={`Сторис ${i + 1}`} style={{ width: "100%", display: "block" }} />
                  </div>
                )}
              </div>
            </div>
          ))}

          {JSON.stringify(cards) !== snapRef.current.cardsJson ? (
            <button className="btn btn-primary" disabled={saving} onClick={saveDraft}>
              {saving ? "Сохранение..." : "💾 Сохранить как черновик"}
            </button>
          ) : (
            <span className="text-xs" style={{ color: "var(--green)" }}>✅ Сохранено</span>
          )}
        </div>
      )}
    </div>
  );
});

export default StoriesTab;
