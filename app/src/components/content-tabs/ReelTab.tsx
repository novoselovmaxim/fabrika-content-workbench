import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import type { ContentTabHandle } from "./PostTab";

const ReelTab = forwardRef<ContentTabHandle, { post: any; postId: string }>(({ post, postId }, ref) => {
  const [duration, setDuration] = useState("30");
  const [script, setScript] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const snapRef = useRef({ scriptJson: "" });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/drafts/by-post/${postId}`);
        const drafts = await res.json();
        const reelDraft = drafts?.find((d: any) => d.stage === "reel");
        if (reelDraft?.contentJson) {
          let parsed;
          try { parsed = JSON.parse(reelDraft.contentJson); } catch { parsed = null; }
          if (parsed?.script) {
            setScript(parsed.script);
            if (parsed.duration) setDuration(parsed.duration);
            snapRef.current.scriptJson = JSON.stringify(parsed.script);
          }
        }
      } catch {}
    })();
  }, [postId]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: "reel-script",
          postItemId: postId,
          variables: {
            title: post.title,
            rubric: post.rubricName || "",
            goal: post.goal || "",
            hook: post.hook || "",
            keyMessage: post.keyMessage || "",
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
        parsed = { script: [] };
      }
      if (parsed.script) {
        setScript(parsed.script);
        if (parsed.duration) setDuration(parsed.duration);
      }
    } finally {
      setGenerating(false);
    }
  };

  const updateLine = (i: number, field: string, value: string) => {
    setScript((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  };

  const saveDraft = async () => {
    setSaving(true);
    await fetch("/api/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postItemId: postId,
        stage: "reel",
        contentMarkdown: script.map((l) => `[${l.time}] ${l.text} | Кадр: ${l.visual} | Экран: ${l.textOnScreen}`).join("\n"),
        contentJson: JSON.stringify({ duration, script }),
      }),
    });
    snapRef.current.scriptJson = JSON.stringify(script);
    setSaving(false);
  };

  useImperativeHandle(ref, () => ({
    saveDraft: saveDraft as unknown as () => Promise<string | null>,
    isDirty: () => JSON.stringify(script) !== snapRef.current.scriptJson,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="card-header">
        <span className="card-title">Сценарий Reels</span>
      </div>

      <div className="flex items-center gap-4">
        <label className="text-sm text-dim">Длительность (сек):</label>
        <select className="input" value={duration} onChange={(e) => setDuration(e.target.value)} style={{ width: 100 }}>
          <option value="15">15</option>
          <option value="30">30</option>
          <option value="60">60</option>
        </select>
        <button className="btn btn-primary" onClick={generate} disabled={generating}>
          {generating ? "Генерация..." : "🔥 Сгенерировать сценарий"}
        </button>
      </div>

      {script.length > 0 && (
        <div className="flex flex-col gap-4">
          {script.map((line, i) => (
            <div key={i} style={{ padding: 14, background: "var(--bg-hover)", borderRadius: 8 }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="tag tag-planned" style={{ fontSize: 10 }}>{line.time || i + 1}</span>
              </div>
              <div className="flex flex-col gap-2">
                <div>
                  <label className="text-xs text-dim" style={{ display: "block", marginBottom: 2 }}>Текст озвучки</label>
                  <input className="input" value={line.text || ""} onChange={(e) => updateLine(i, "text", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-dim" style={{ display: "block", marginBottom: 2 }}>Что в кадре</label>
                  <input className="input" value={line.visual || ""} onChange={(e) => updateLine(i, "visual", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-dim" style={{ display: "block", marginBottom: 2 }}>Текст на экране</label>
                  <input className="input" value={line.textOnScreen || ""} onChange={(e) => updateLine(i, "textOnScreen", e.target.value)} />
                </div>
              </div>
            </div>
          ))}

          {JSON.stringify(script) !== snapRef.current.scriptJson ? (
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

export default ReelTab;
