import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface ContentTabHandle {
  saveDraft: () => Promise<string | null>;
  isDirty: () => boolean;
}

const PostTab = forwardRef<ContentTabHandle, {
  post: any;
  postId: string;
  queryClient?: any;
}>(({ post, postId, queryClient: externalQc }, ref) => {
  const qc = externalQc || useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const snapRef = useRef({ text: "", visualPrompt: "", imageUrl: "" });
  const [text, setText] = useState("");
  const [visualPrompt, setVisualPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [brandStyles, setBrandStyles] = useState<any[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<string>("");
  const [draftId, setDraftId] = useState<string | null>(null);

  const { data: assets, refetch: refetchAssets } = useQuery({
    queryKey: ["assets", postId],
    queryFn: () => api.assets.listByPost(postId),
    enabled: !!postId,
  });

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

  useEffect(() => {
    (async () => {
      let t = "", vp = "", iu = "";
      try {
        const res = await fetch(`/api/drafts/by-post/${postId}`);
        const drafts = await res.json();
        const captionDraft = drafts?.find((d: any) => d.stage === "caption");
        if (captionDraft) {
          if (captionDraft.contentMarkdown) t = captionDraft.contentMarkdown;
          if (captionDraft.contentJson) {
            try {
              const parsed = JSON.parse(captionDraft.contentJson);
              if (parsed.visualPrompt) vp = parsed.visualPrompt;
              if (parsed.imageUrl) iu = parsed.imageUrl;
            } catch {}
          }
          setDraftId(captionDraft.id);
        }
      } catch {}
      setText(t);
      setVisualPrompt(vp);
      setImageUrl(iu);
      snapRef.current = { text: t, visualPrompt: vp, imageUrl: iu };
      setLoaded(true);
    })();
  }, [postId]);

  const applicableStyles = brandStyles.filter(
    (s) => s.contentType === "all" || s.contentType === "post"
  );
  const selectedStyle = applicableStyles.find((s) => s.id === selectedStyleId);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: "caption-post",
          postItemId: postId,
          variables: {
            title: post.title,
            rubric: post.rubricName || "",
            goal: post.goal || "",
            hook: post.hook || "",
            keyMessage: post.keyMessage || "",
            cta: post.cta || "",
            contentType: post.contentTypeName || "пост",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setText(data.content);
    } finally {
      setGenerating(false);
    }
  };

  const generateVisualPrompt = async () => {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: "visual-prompt",
        variables: {
          title: post.title,
          keyMessage: post.keyMessage || "",
        },
      }),
    });
    const data = await res.json();
    if (data.content) setVisualPrompt(data.content);
  };

  const generateImage = async () => {
    setGeneratingImage(true);
    try {
      const res = await fetch("/api/assets/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postItemId: postId,
          prompt: visualPrompt,
          stylePrompt: selectedStyle?.systemPrompt || "",
        }),
      });
      if (!res.ok) throw new Error(((await res.json()).error || "Ошибка"));
      const asset = await res.json();
      setImageUrl(asset.sourceUrl);
      refetchAssets();
    } catch (err: any) {
      alert("❌ " + err.message);
    } finally {
      setGeneratingImage(false);
    }
  };

  const deleteAsset = async (assetId: string) => {
    if (!confirm("Удалить изображение?")) return;
    await fetch(`/api/assets/${assetId}`, { method: "DELETE" });
    refetchAssets();
    if (assets) {
      const deleted = assets.find((a: any) => a.id === assetId);
      if (deleted && deleted.sourceUrl === imageUrl) setImageUrl("");
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("postItemId", postId);
      form.append("type", "image");
      form.append("sourceType", "manual_upload");
      const res = await fetch("/api/assets/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error(((await res.json()).error) || "Upload failed");
      const uploaded = await res.json();
      setImageUrl(uploaded.sourceUrl);
      refetchAssets();
    } catch (err: any) {
      alert("❌ " + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const saveDraft = async () => {
    setSaving(true);
    const body: any = {
      postItemId: postId,
      stage: "caption",
      contentMarkdown: text,
    };
    body.contentJson = JSON.stringify({
      visualPrompt: visualPrompt || "",
      imageUrl: imageUrl || "",
    });
    let currentDraftId = draftId;
    if (currentDraftId) {
      await fetch(`/api/drafts/${currentDraftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.id) {
        setDraftId(data.id);
        currentDraftId = data.id;
      }
    }
    snapRef.current = { text, visualPrompt, imageUrl };
    qc.invalidateQueries({ queryKey: ["drafts", postId] });
    setSaving(false);
    return currentDraftId || null;
  };

  useImperativeHandle(ref, () => ({
    saveDraft,
    isDirty: () =>
      text !== snapRef.current.text ||
      visualPrompt !== snapRef.current.visualPrompt ||
      imageUrl !== snapRef.current.imageUrl,
  }));

  const imageAssets = (assets || []).filter((a: any) => a.type === "image");

  return (
    <div className="flex flex-col gap-4">
      <div className="card-header">
        <span className="card-title">Текст поста</span>
      </div>
      <button
        className="btn btn-primary"
        onClick={generate}
        disabled={generating}
        style={{ alignSelf: "flex-start" }}
      >
        {generating ? "Генерация..." : "🔥 Сгенерировать текст"}
      </button>
      {text && (
        <>
          {applicableStyles.length > 0 && (
            <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
              <label className="text-sm text-dim" style={{ fontWeight: 500 }}>
                Фирменный стиль:
              </label>
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
          <div style={{ position: "relative", width: "100%" }}>
            <textarea
              className="input"
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{ width: "100%", resize: "vertical", minHeight: 120 }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 2,
                right: 2,
                width: 14,
                height: 14,
                pointerEvents: "none",
                borderRight: "3px solid var(--accent)",
                borderBottom: "3px solid var(--accent)",
                opacity: 0.5,
                borderRadius: "0 0 4px 0",
              }}
            />
          </div>
          <div className="text-xs text-dim" style={{ marginBottom: 8 }}>
            Можно использовать Markdown: **жирный**, *курсив*, #теги, [ссылка](url), — строки разделяются переносом
          </div>
          <div>
            <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>
              Промпт для изображения
            </label>
            <div className="flex gap-2" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                <textarea
                  className="input"
                  rows={2}
                  value={visualPrompt}
                  onChange={(e) => setVisualPrompt(e.target.value)}
                  placeholder="Напишите промпт или сгенерируйте ✨"
                  style={{ width: "100%", resize: "vertical", minHeight: 60 }}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: 2,
                    right: 2,
                    width: 14,
                    height: 14,
                    pointerEvents: "none",
                    borderRight: "3px solid var(--accent)",
                    borderBottom: "3px solid var(--accent)",
                    opacity: 0.5,
                    borderRadius: "0 0 4px 0",
                  }}
                />
              </div>
              <button className="btn btn-ghost" onClick={generateVisualPrompt} style={{ flexShrink: 0 }}>
                ✨
              </button>
              {visualPrompt && (
                <button
                  className="btn btn-ghost"
                  disabled={generatingImage}
                  onClick={generateImage}
                  style={{ flexShrink: 0, opacity: generatingImage ? 0.5 : 1 }}
                >
                  {generatingImage ? "⏳" : "🖼 Изображение"}
                </button>
              )}
              <button
                className="btn btn-ghost"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                style={{ flexShrink: 0 }}
              >
                {uploading ? "⏳" : "📁 Загрузить"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleUpload}
                style={{ display: "none" }}
              />
            </div>
            {imageUrl && (
              <div style={{ marginTop: 8, borderRadius: 8, overflow: "hidden", maxWidth: 400 }}>
                <img src={imageUrl} alt="" style={{ width: "100%", display: "block" }} />
              </div>
            )}
            {imageAssets.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>
                  Все изображения ({imageAssets.length}) — нажмите чтобы выбрать
                </label>
                <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                  {imageAssets.map((a: any) => {
                    const isSelected = a.sourceUrl === imageUrl;
                    return (
                      <div key={a.id} style={{ position: "relative" }}>
                        <div
                          onClick={() => setImageUrl(a.sourceUrl)}
                          style={{
                            width: 80,
                            height: 80,
                            borderRadius: 8,
                            overflow: "hidden",
                            cursor: "pointer",
                            border: isSelected ? "3px solid var(--accent)" : "3px solid transparent",
                            opacity: isSelected ? 1 : 0.6,
                            transition: "all 0.15s",
                          }}
                        >
                          <img
                            src={a.sourceUrl}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          />
                        </div>
                        <button
                          onClick={() => deleteAsset(a.id)}
                          style={{
                            position: "absolute",
                            top: -4,
                            right: -4,
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            border: "none",
                            background: "var(--red)",
                            color: "#fff",
                            fontSize: 11,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            lineHeight: 1,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {text !== snapRef.current.text || visualPrompt !== snapRef.current.visualPrompt || imageUrl !== snapRef.current.imageUrl ? (
            <button
              className="btn btn-primary"
              disabled={saving}
              style={{ alignSelf: "flex-start" }}
              onClick={saveDraft}
            >
              {saving ? "Сохранение..." : "💾 Сохранить как черновик"}
            </button>
          ) : (
            <span className="text-xs" style={{ color: "var(--green)" }}>
              ✅ Сохранено
            </span>
          )}
        </>
      )}
    </div>
  );
});

export default PostTab;
