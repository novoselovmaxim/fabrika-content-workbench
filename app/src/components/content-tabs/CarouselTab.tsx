import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ContentTabHandle } from "./PostTab";

function wrapTextPreview(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function SlideCanvasPreview({ slide }: { slide: any }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !slide.imageUrl) return;
    let active = true;
    (async () => {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = slide.imageUrl;
      });
      if (!active) return;

      const cvsSize = 1024;
      canvas.width = cvsSize;
      canvas.height = cvsSize;
      const ctx = canvas.getContext("2d")!;

      // Cover: fit image into square, crop overflow
      const scale = Math.max(cvsSize / img.naturalWidth, cvsSize / img.naturalHeight);
      const sw = img.naturalWidth * scale;
      const sh = img.naturalHeight * scale;
      const sx = (cvsSize - sw) / 2;
      const sy = (cvsSize - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh);

      const ts = slide.textStyle || {};
      const pos = ts.textPosition || "bottom";
      const bgOpacity = (ts.backgroundOpacity ?? 65) / 100;

      if (pos === "bottom") {
        const grad = ctx.createLinearGradient(0, canvas.height * 0.55, 0, canvas.height);
        ctx.fillStyle = grad;
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, `rgba(0,0,0,${bgOpacity})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, canvas.height * 0.55, canvas.width, canvas.height * 0.45);
      } else if (pos === "top") {
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.45);
        grad.addColorStop(0, `rgba(0,0,0,${bgOpacity})`);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height * 0.45);
      } else {
        ctx.fillStyle = `rgba(0,0,0,${bgOpacity * 0.5})`;
        ctx.fillRect(0, canvas.height * 0.35, canvas.width, canvas.height * 0.3);
      }

      const fontSize = ts.fontSize || 30;
      const fontFamily = ts.fontFamily || "Inter, system-ui, sans-serif";
      ctx.fillStyle = ts.textColor || "#ffffff";
      ctx.font = `600 ${fontSize}px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";

      // Wait for font to be loaded before measuring
      await document.fonts.ready;

      const textLines = wrapTextPreview(ctx, slide.text || "", canvas.width - 80);
      const lineHeight = fontSize * 1.35;

      let startY: number;
      const totalH = textLines.length * lineHeight;
      if (pos === "top") startY = 40 + totalH;
      else if (pos === "center") startY = canvas.height / 2 + totalH / 2;
      else startY = canvas.height - 40;

      textLines.forEach((line, i) => {
        const y = Math.round(startY - (textLines.length - 1 - i) * lineHeight);
        ctx.fillText(line, canvas.width / 2, y);
      });
    })();
    return () => { active = false; };
  }, [slide.imageUrl, slide.text, slide.textStyle]);

  return (
    <canvas
      ref={ref}
      style={{ width: "100%", maxWidth: 400, borderRadius: 6, display: "block" }}
    />
  );
}

const CarouselTab = forwardRef<ContentTabHandle, { post: any; postId: string; queryClient?: any }>(({ post, postId, queryClient: externalQc }, ref) => {
  const queryClient = externalQc || useQueryClient();
  const [slides, setSlides] = useState<any[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState<number | null>(null);
  const [generatingStyle, setGeneratingStyle] = useState<number | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [error, setError] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [brandStyles, setBrandStyles] = useState<any[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<string>("");
  const [postAssets, setPostAssets] = useState<any[]>([]);
  const [showAssetPicker, setShowAssetPicker] = useState<number | null>(null);
  const autoSaveTimer = useRef<any>(null);
  const slidesRef = useRef(slides);
  slidesRef.current = slides;
  const snapRef = useRef({ slidesJson: "", captionText: "" });
  const [captionText, setCaptionText] = useState("");
  const [captionDraftId, setCaptionDraftId] = useState<string | null>(null);
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [generatingTags, setGeneratingTags] = useState(false);
  const [uploadingBg, setUploadingBg] = useState<number | null>(null);

  useImperativeHandle(ref, () => ({
    saveDraft,
    isDirty: () =>
      JSON.stringify(slides) !== snapRef.current.slidesJson ||
      captionText !== snapRef.current.captionText,
  }));

  // Load Google Fonts once
  useEffect(() => {
    if (document.getElementById("gf-fabrika")) return;
    const link = document.createElement("link");
    link.id = "gf-fabrika";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Montserrat:wght@400;600;700&family=Raleway:wght@400;600;700&family=Roboto:wght@400;600;700&family=Open+Sans:wght@400;600;700&display=swap";
    document.head.appendChild(link);
  }, []);

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
    (s) => s.contentType === "all" || s.contentType === "carousel"
  );
  const selectedStyle = applicableStyles.find((s) => s.id === selectedStyleId);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/drafts/by-post/${postId}`);
        const drafts = await res.json();
        const carouselDraft = drafts?.find((d: any) => d.stage === "carousel");
        if (carouselDraft) {
          setDraftId(carouselDraft.id);
          if (carouselDraft.contentJson) {
            let parsed;
            try { parsed = JSON.parse(carouselDraft.contentJson); } catch { parsed = null; }
            if (parsed?.slides) {
              const withTextStyle = parsed.slides.map((s: any) => ({ ...s, textStyle: s.textStyle || { fontFamily: "Inter, system-ui, sans-serif", fontSize: 30, textColor: "#ffffff", textPosition: "bottom", textAlign: "center", backgroundOpacity: 65 } }));
              setSlides(withTextStyle);
              snapRef.current.slidesJson = JSON.stringify(withTextStyle);
            }
          } else if (carouselDraft.contentMarkdown) {
            try {
              const parsed = JSON.parse(carouselDraft.contentMarkdown);
              if (parsed?.slides) {
                const withTextStyle = parsed.slides.map((s: any) => ({ ...s, textStyle: s.textStyle || { fontFamily: "Inter, system-ui, sans-serif", fontSize: 30, textColor: "#ffffff", textPosition: "bottom", textAlign: "center", backgroundOpacity: 65 } }));
                setSlides(withTextStyle);
                snapRef.current.slidesJson = JSON.stringify(withTextStyle);
              }
            } catch {}
          }
        }
        const captionDraft = drafts?.find((d: any) => d.stage === "caption");
        if (captionDraft) {
          setCaptionDraftId(captionDraft.id);
          if (captionDraft.contentMarkdown) {
            setCaptionText(captionDraft.contentMarkdown);
            snapRef.current.captionText = captionDraft.contentMarkdown;
          }
        }
        // Load post assets for background library
        const assetsRes = await fetch(`/api/assets/by-post/${postId}`);
        if (assetsRes.ok) setPostAssets(await assetsRes.json());
      } catch {}
      setLoaded(true);
    })();
  }, [postId]);

  const saveDraft = async (): Promise<string | null> => {
    const latest = slidesRef.current;
    try {
      const body = {
        postItemId: postId,
        stage: "carousel",
        contentMarkdown: latest.map((s, i) => `## Слайд ${i + 1}: ${s.title || ""}\n${s.text || ""}`).join("\n\n"),
        contentJson: JSON.stringify({ slides: latest }),
      };
      let currentDraftId = draftId;
      if (draftId) {
        const res = await fetch(`/api/drafts/${draftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("PATCH draft failed");
      } else {
        const res = await fetch("/api/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("POST draft failed");
        const data = await res.json();
        if (data.id) {
          setDraftId(data.id);
          currentDraftId = data.id;
        }
      }
      const captionBody = {
        postItemId: postId,
        stage: "caption",
        contentMarkdown: captionText,
      };
      if (captionDraftId) {
        const res = await fetch(`/api/drafts/${captionDraftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(captionBody),
        });
        if (!res.ok) throw new Error("PATCH caption draft failed");
      } else {
        const res = await fetch("/api/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(captionBody),
        });
        if (!res.ok) throw new Error("POST caption draft failed");
        const data = await res.json();
        if (data.id) {
          setCaptionDraftId(data.id);
        }
      }
      snapRef.current.slidesJson = JSON.stringify(slidesRef.current);
      snapRef.current.captionText = captionText;
      queryClient.invalidateQueries({ queryKey: ["drafts", postId] });
      return currentDraftId;
    } catch {
      return null;
    }
  };

  const generateCaption = async () => {
    setGeneratingCaption(true);
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
            contentType: "карусель",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCaptionText(data.content);
    } finally {
      setGeneratingCaption(false);
    }
  };

  const generateTags = async () => {
    setGeneratingTags(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: "hashtags",
          variables: {
            title: post.title || "",
            goal: post.goal || "",
            hook: post.hook || "",
            keyMessage: post.keyMessage || "",
            cta: post.cta || "",
            rubric: post.rubricName || "",
            contentType: "карусель",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const tags = data.content.trim();
      setCaptionText((prev) => prev + (prev ? "\n\n" : "") + tags);
    } finally {
      setGeneratingTags(false);
    }
  };

  const generateBrief = async () => {
    setLoading("brief");
    setError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: "brief",
          variables: { title: post.title, rubric: post.rubricName || "", contentType: post.contentTypeName || "карусель" },
          responseFormat: "json",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка генерации");
      const cleaned = data.content.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();
      const brief = JSON.parse(cleaned);
      const fields: Record<string, string> = {};
      if (brief.goal) fields.goal = brief.goal;
      if (brief.hook) fields.hook = brief.hook;
      if (brief.keyMessage) fields.keyMessage = brief.keyMessage;
      if (brief.cta) fields.cta = brief.cta;
      if (Object.keys(fields).length > 0) {
        await fetch(`/api/posts/${postId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
        queryClient.invalidateQueries({ queryKey: ["post", postId] });
      }
    } catch (err: any) {
      setError(err.message);
      alert("Ошибка: " + err.message);
    } finally {
      setLoading(null);
    }
  };

  const generateSlides = async () => {
    setLoading("slides");
    setError("");
    try {
      let captionContext = "";
      try {
        const draftsRes = await fetch(`/api/drafts/by-post/${postId}`);
        const drafts = await draftsRes.json();
        const captionDraft = drafts?.find((d: any) => d.stage === "caption");
        if (captionDraft?.contentMarkdown) {
          captionContext = `\n\nУже готовый текст поста:\n${captionDraft.contentMarkdown.slice(0, 2000)}`;
        }
      } catch {}

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: "carousel-slides",
          postItemId: postId,
          variables: { title: post.title, rubric: post.rubricName || "", goal: post.goal || "", hook: post.hook || "", keyMessage: post.keyMessage || "", cta: post.cta || "", captionContext },
          responseFormat: "json",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка генерации");
      const cleaned = data.content.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();
      const parsed = JSON.parse(cleaned);
      if (!parsed.slides?.length) throw new Error("AI не вернул слайды");
      const withTextStyle = parsed.slides.map((s: any) => ({ ...s, textStyle: s.textStyle || { fontFamily: "Inter, system-ui, sans-serif", fontSize: 30, textColor: "#ffffff", textPosition: "bottom", textAlign: "center", backgroundOpacity: 65 } }));
      slidesRef.current = withTextStyle;
      setSlides(withTextStyle);
      await saveDraft();
    } catch (err: any) {
      setError(err.message);
      alert("Ошибка: " + err.message);
    } finally {
      setLoading(null);
    }
  };

  const generatePrompts = async (singleIndex?: number) => {
    setLoading("prompts");
    setError("");
    try {
      const result = [...slides];
      // If singleIndex is set, regenerate that one; otherwise only generate missing
      let indices: number[];
      if (singleIndex !== undefined) {
        indices = [singleIndex];
      } else {
        indices = result
          .map((s, i) => s.format === "html" || s.visualPrompt ? -1 : i)
          .filter(i => i >= 0);
      }
      indices = indices.filter((i) => result[i].format !== "html");
      if (indices.length === 0) {
        await saveDraft();
        return;
      }
      for (const i of indices) {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId: "carousel-image-prompt",
            variables: {
              title: post.title,
              keyMessage: post.keyMessage || "",
              slideNumber: String(i + 1),
              slideTitle: result[i].title || "",
              slideText: result[i].text || "",
              rubric: post.rubricName || "",
            },
            responseFormat: "text",
          }),
        });
        const data = await res.json();
        if (data.content) result[i].visualPrompt = data.content.trim();
        // Clear stale image whenever prompt is regenerated
        result[i].imageUrl = "";
        result[i].composedUrl = "";
      }
      slidesRef.current = result;
      setSlides(result);
      await saveDraft();
    } catch (err: any) {
      setError(err.message);
      alert("Ошибка: " + err.message);
    } finally {
      setLoading(null);
    }
  };

  const wrapTextCanvas = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const test = current ? current + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  const composeOnCanvas = async (slide: any, rawUrl: string): Promise<string | null> => {
    try {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = rawUrl;
      });

      const canvas = document.createElement("canvas");
      const cvsSize = 1024;
      canvas.width = cvsSize;
      canvas.height = cvsSize;
      const ctx = canvas.getContext("2d")!;

      // Cover: fit image into square, crop overflow
      const scale = Math.max(cvsSize / img.naturalWidth, cvsSize / img.naturalHeight);
      const sw = img.naturalWidth * scale;
      const sh = img.naturalHeight * scale;
      const sx = (cvsSize - sw) / 2;
      const sy = (cvsSize - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh);

      const ts = slide.textStyle || {};
      const pos = ts.textPosition || "bottom";
      const bgOpacity = (ts.backgroundOpacity ?? 65) / 100;

      if (pos === "bottom") {
        const grad = ctx.createLinearGradient(0, canvas.height * 0.55, 0, canvas.height);
        ctx.fillStyle = grad;
        ctx.fillRect(0, canvas.height * 0.55, canvas.width, canvas.height * 0.45);
      } else if (pos === "top") {
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.45);
        grad.addColorStop(0, `rgba(0,0,0,${bgOpacity})`);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height * 0.45);
      } else {
        ctx.fillStyle = `rgba(0,0,0,${bgOpacity * 0.5})`;
        ctx.fillRect(0, canvas.height * 0.35, canvas.width, canvas.height * 0.3);
      }

      const fontSize = ts.fontSize || 30;
      const fontFamily = ts.fontFamily || "Inter, system-ui, sans-serif";
      ctx.fillStyle = ts.textColor || "#ffffff";
      ctx.font = `600 ${fontSize}px ${fontFamily}`;
      ctx.textAlign = ts.textAlign === "left" ? "left" : "center";
      ctx.textBaseline = "bottom";

      const padding = 40;
      const maxTextWidth = canvas.width - padding * 2;

      // Wait for font to be loaded before measuring
      await document.fonts.ready;

      const textLines = wrapTextCanvas(ctx, slide.text || "", maxTextWidth);
      const lineHeight = fontSize * 1.35;

      let startY: number;
      const totalH = textLines.length * lineHeight;
      if (pos === "top") startY = padding + totalH;
      else if (pos === "center") startY = canvas.height / 2 + totalH / 2;
      else startY = canvas.height - padding;

      const x = ts.textAlign === "left" ? padding : canvas.width / 2;

      textLines.forEach((line, i) => {
        const y = Math.round(startY - (textLines.length - 1 - i) * lineHeight);
        ctx.fillText(line, x, y);
      });

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) return null;

      const formData = new FormData();
      formData.append("file", blob, `composed_${Date.now()}.png`);
      formData.append("postItemId", postId);
      formData.append("type", "image");
      formData.append("sourceType", "ai_generated");

      const res = await fetch("/api/assets/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const asset = await res.json();
      return asset.sourceUrl;
    } catch (err) {
      console.error("Canvas compose error:", err);
      return null;
    }
  };

  const composeImage = async (i: number, rawUrl: string): Promise<string | null> => {
    try {
      const cur = slidesRef.current[i];
      if (!cur?.text) return null;
      return await composeOnCanvas(cur, rawUrl);
    } catch {
      return null;
    }
  };

  const generateOneImage = async (i: number) => {
    setGeneratingImage(i);
    const cur = slidesRef.current[i];
    try {
      const res = await fetch("/api/assets/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postItemId: postId,
          prompt: cur.visualPrompt,
          stylePrompt: selectedStyle?.systemPrompt || "",
        }),
      });
      if (!res.ok) throw new Error(((await res.json()).error || "Ошибка"));
      const asset = await res.json();
      const rawUrl = asset.sourceUrl;

      let composedUrl = "";
      if (cur.text) {
        const composed = await composeImage(i, rawUrl);
        if (composed) composedUrl = composed;
      }

      const newSlides = slidesRef.current.map((s, idx) => idx === i
        ? { ...s, imageUrl: rawUrl, composedUrl, composeEnabled: true }
        : s
      );
      slidesRef.current = newSlides;
      setSlides(newSlides);
      await saveDraft();
    } catch (err: any) {
      alert("❌ " + err.message);
    } finally {
      setGeneratingImage(null);
    }
  };

  const generateSlideStyle = async (i: number) => {
    setGeneratingStyle(i);
    try {
      const slide = slidesRef.current[i];
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: "slide-html-style",
          variables: {
            title: slide.title || "",
            text: slide.text || "",
            styleHint: slide.styleHint || "",
            brandStyle: selectedStyle?.systemPrompt || "",
          },
          responseFormat: "json",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      const cleaned = data.content.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();
      const style = JSON.parse(cleaned);
      const newSlides = slidesRef.current.map((s, idx) => idx === i ? { ...s, slideStyle: style } : s);
      slidesRef.current = newSlides;
      setSlides(newSlides);
      await saveDraft();
    } catch (err: any) {
      alert("❌ " + err.message);
    } finally {
      setGeneratingStyle(null);
    }
  };

  const toggleFormat = async (i: number) => {
    const slide = slides[i];
    const newFormat = slide.format === "html" ? "image" : "html";
    const newSlides = slides.map((s, idx) => idx === i
      ? { ...s, format: newFormat, visualPrompt: "", imageUrl: "", composedUrl: "", slideStyle: undefined }
      : s
    );
    slidesRef.current = newSlides;
    setSlides(newSlides);
    await saveDraft();
  };

  const toggleCompose = async (i: number) => {
    const slide = slidesRef.current[i];
    const newEnabled = !slide.composeEnabled;

    if (newEnabled && !slide.composedUrl && slide.imageUrl && slide.text) {
      const composed = await composeImage(i, slide.imageUrl);
      if (composed) {
        const newSlides = slidesRef.current.map((s, idx) => idx === i
          ? { ...s, composeEnabled: true, composedUrl: composed }
          : s
        );
      slidesRef.current = newSlides;
      setSlides(newSlides);
      await saveDraft();
        return;
      }
    }

    const newSlides = slidesRef.current.map((s, idx) => idx === i
      ? { ...s, composeEnabled: newEnabled }
      : s
    );
    slidesRef.current = newSlides;
    setSlides(newSlides);
    await saveDraft();
  };

  const displayUrl = (slide: any) => {
    return slide.composedUrl || slide.imageUrl || "";
  };

  const handleCompose = async (i: number) => {
    const cur = slidesRef.current[i];
    if (!cur?.imageUrl || !cur?.text) return;
    const url = await composeOnCanvas(cur, cur.imageUrl);
    if (url) {
      const newSlides = slidesRef.current.map((s, idx) => idx === i ? { ...s, composedUrl: url } : s);
      slidesRef.current = newSlides;
      setSlides(newSlides);
      await saveDraft();
    }
  };

  const handleBackgroundUpload = async (i: number, file: File) => {
    setUploadingBg(i);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("postItemId", postId);
      formData.append("type", "image");
      formData.append("sourceType", "manual_upload");
      const res = await fetch("/api/assets/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const asset = await res.json();
      const newSlides = slidesRef.current.map((s, idx) =>
        idx === i ? { ...s, imageUrl: asset.sourceUrl, visualPrompt: asset.sourceUrl } : s
      );
      slidesRef.current = newSlides;
      setSlides(newSlides);
      await saveDraft();
    } catch (err: any) {
      alert("❌ " + err.message);
    } finally {
      setUploadingBg(null);
    }
  };

  const updateSlideTextStyle = (i: number, key: string, value: any) => {
    const newSlides = slidesRef.current.map((s, idx) => {
      if (idx !== i) return s;
      return { ...s, textStyle: { ...(s.textStyle || {}), [key]: value } };
    });
    slidesRef.current = newSlides;
    setSlides(newSlides);
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const latest = slidesRef.current;
      if (draftId) {
        await fetch(`/api/drafts/${draftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentMarkdown: latest.map((s, idx) => `## Слайд ${idx + 1}: ${s.title || ""}\n${s.text || ""}`).join("\n\n"),
            contentJson: JSON.stringify({ slides: latest }),
          }),
        });
      }
    }, 1000);
  };

  const updateSlide = (i: number, field: string, value: string) => {
    const newSlides = slidesRef.current.map((s, idx) => (idx === i ? { ...s, [field]: value } : s));
    slidesRef.current = newSlides;
    setSlides(newSlides);
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const latest = slidesRef.current;
      if (draftId) {
        await fetch(`/api/drafts/${draftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentMarkdown: latest.map((s, idx) => `## Слайд ${idx + 1}: ${s.title || ""}\n${s.text || ""}`).join("\n\n"),
            contentJson: JSON.stringify({ slides: latest }),
          }),
        });
      }
    }, 1000);
  };

  const allImagesGenerated = slides.length > 0 && slides.every((s) =>
    s.format === "html" ? (!s.styleHint || s.slideStyle) : !!s.imageUrl
  );
  const hasBrief = !!(post.goal || post.hook || post.keyMessage || post.cta);

  if (!loaded) return <div className="text-sm text-dim">Загрузка...</div>;

  return (
    <div className="flex flex-col gap-4" style={{ maxWidth: "100%", overflowX: "hidden" }}>
      {error && (
        <div style={{ padding: "8px 12px", background: "var(--bg-error, #fef2f2)", borderRadius: 6, fontSize: 13, color: "var(--red)" }}>
          {error}
        </div>
      )}

      {/* SECTION: Brief */}
      <div className="card">
        <div className="card-header" style={{ padding: 0 }}>
          <span className="card-title">📋 Бриф</span>
          {hasBrief && <span className="tag tag-ready">Заполнен</span>}
        </div>
        {hasBrief ? (
          <>
            <div style={{ background: "var(--bg-hover)", padding: "12px 16px", borderRadius: 8, marginTop: 8 }}>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs text-dim" style={{ display: "block", marginBottom: 2 }}>Цель</label>
                  <input className="input" value={post.goal || ""} onChange={(e) => {
                    fetch(`/api/posts/${postId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: e.target.value }) });
                  }} />
                </div>
                <div>
                  <label className="text-xs text-dim" style={{ display: "block", marginBottom: 2 }}>Хук</label>
                  <textarea className="input" rows={2} value={post.hook || ""} onChange={(e) => {
                    fetch(`/api/posts/${postId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hook: e.target.value }) });
                  }} />
                </div>
                <div>
                  <label className="text-xs text-dim" style={{ display: "block", marginBottom: 2 }}>Ключевое сообщение</label>
                  <textarea className="input" rows={2} value={post.keyMessage || ""} onChange={(e) => {
                    fetch(`/api/posts/${postId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyMessage: e.target.value }) });
                  }} />
                </div>
                <div>
                  <label className="text-xs text-dim" style={{ display: "block", marginBottom: 2 }}>CTA</label>
                  <input className="input" value={post.cta || ""} onChange={(e) => {
                    fetch(`/api/posts/${postId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cta: e.target.value }) });
                  }} />
                </div>
              </div>
            </div>
            <div className="flex gap-2" style={{ flexWrap: "wrap", marginTop: 8 }}>
              <button className="btn btn-primary" onClick={generateBrief} disabled={loading === "brief"}>
                {loading === "brief" ? "Генерация..." : "🔄 Сгенерировать заново"}
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3" style={{ marginTop: 8 }}>
            <p className="text-sm text-dim">Сначала создадим бриф: цель, хук, ключевое сообщение и CTA.</p>
            <button className="btn btn-primary" onClick={generateBrief} disabled={loading === "brief"} style={{ alignSelf: "flex-start" }}>
              {loading === "brief" ? "Генерация..." : "📝 Сгенерировать бриф"}
            </button>
          </div>
        )}
      </div>

      {/* SECTION: Generate Slides */}
      <div className="card">
        <div className="card-header" style={{ padding: 0 }}>
          <span className="card-title">🎬 Слайды</span>
          {slides.length > 0 && <span className="tag tag-ready">{slides.length} шт.</span>}
        </div>
        <div className="flex flex-col gap-3" style={{ marginTop: 8 }}>
          {slides.length > 0 ? (
            <>
              {hasBrief && (
                <p className="text-sm text-dim" style={{ background: "var(--bg-hover)", padding: "8px 12px", borderRadius: 6 }}>
                  <strong>Цель:</strong> {post.goal}<br />
                  <strong>Хук:</strong> {post.hook}<br />
                  <strong>Ключ. сообщение:</strong> {post.keyMessage}<br />
                  <strong>CTA:</strong> {post.cta}
                </p>
              )}
              <p className="text-sm text-dim">Слайды готовы. Можно отредактировать ниже или сгенерировать заново.</p>
              <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={generateSlides} disabled={loading === "slides"}>
                  {loading === "slides" ? "Генерация..." : "🔄 Сгенерировать заново"}
                </button>
              </div>
            </>
          ) : (
            <>
              {hasBrief && (
                <p className="text-sm text-dim" style={{ background: "var(--bg-hover)", padding: "8px 12px", borderRadius: 6 }}>
                  <strong>Цель:</strong> {post.goal}<br />
                  <strong>Хук:</strong> {post.hook}<br />
                  <strong>Ключ. сообщение:</strong> {post.keyMessage}<br />
                  <strong>CTA:</strong> {post.cta}
                </p>
              )}
              <button className="btn btn-primary" onClick={generateSlides} disabled={loading === "slides"} style={{ alignSelf: "flex-start" }}>
                {loading === "slides" ? "Генерация..." : "✨ Сгенерировать слайды"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Brand style selector (visible when slides exist) */}
      {slides.length > 0 && applicableStyles.length > 0 && (
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

      {/* SECTION: Visuals (Prompts + Images) */}
      {slides.length > 0 && (
        <div className="card">
          <div className="card-header" style={{ padding: 0 }}>
            <span className="card-title">🖼 Визуалы</span>
            {allImagesGenerated && <span className="tag tag-ready">Готово</span>}
          </div>
          <div className="flex flex-col gap-3" style={{ marginTop: 8 }}>
            {/* Prompts section */}
            <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 8 }}>
              <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                <span className="text-sm text-dim">
                  {slides.every((s) => s.format === "html" || s.visualPrompt)
                    ? "✅ Промпты готовы"
                    : slides.some((s) => s.visualPrompt)
                      ? "Промпты частично готовы"
                      : "Сгенерируйте промпты для изображений"}
                </span>
                {slides.some(s => s.format === "html") && (
                  <span className="text-xs text-dim">✏️ HTML-слайды не требуют промптов</span>
                )}
              </div>
              <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                <button className="btn btn-ghost" onClick={() => generatePrompts()} disabled={loading === "prompts"} style={{ fontSize: 12 }}>
                  {loading === "prompts" ? "..." : slides.some((s) => s.visualPrompt) ? "🔄 Все промпты" : "✨ Сгенерировать промпты"}
                </button>
                {slides.map((_, i) => (
                  <button
                    key={i}
                    className="btn btn-ghost"
                    onClick={() => generatePrompts(i)}
                    disabled={loading === "prompts" || slides[i].format === "html"}
                    style={{ fontSize: 11, padding: "2px 6px", opacity: slides[i].format === "html" ? 0.4 : 1 }}
                  >
                    {loading === "prompts" ? "..." : slides[i].format === "html" ? `✏️ ${i + 1}` : slides[i].visualPrompt ? `🔄 ${i + 1}` : `✨ ${i + 1}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate Images / Styles buttons */}
            <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  setGeneratingAll(true);
                  const imageIndices = slides
                    .map((s, i) => (!s.imageUrl && (!s.format || s.format === "image")) ? i : -1)
                    .filter(i => i >= 0);
                  const htmlIndices = slides
                    .map((s, i) => (s.format === "html" && s.styleHint && !s.slideStyle) ? i : -1)
                    .filter(i => i >= 0);
                  for (const i of imageIndices) await generateOneImage(i);
                  for (const i of htmlIndices) await generateSlideStyle(i);
                  setGeneratingAll(false);
                }}
                disabled={generatingImage !== null || generatingStyle !== null || generatingAll}
                style={{ fontSize: 13 }}
              >
                {generatingAll && generatingImage !== null
                  ? `🖼 Слайд ${(generatingImage ?? 0) + 1}/${slides.length}...`
                  : generatingAll && generatingStyle !== null
                    ? `🎨 Стиль слайда ${(generatingStyle ?? 0) + 1}/${slides.length}...`
                    : "🚀 Сгенерировать всё"}
              </button>
              <span className="text-xs text-dim">или по одному:</span>
              {slides.map((slide, i) => {
                const isImage = !slide.format || slide.format === "image";
                const done = isImage ? !!slide.imageUrl : !!slide.slideStyle;
                const isBusy = generatingImage === i || generatingStyle === i;
                return (
                  <button
                    key={i}
                    className={`btn ${done ? "btn-ghost" : "btn-outline"}`}
                    style={{
                      fontSize: 11,
                      padding: "2px 6px",
                      opacity: isBusy ? 0.6 : 1,
                      borderColor: done ? "var(--border)" : undefined,
                    }}
                    disabled={isBusy || generatingAll}
                    onClick={() => { if (isImage) generateOneImage(i); else generateSlideStyle(i); }}
                  >
                    {isBusy ? "⏳" : done ? "✓" : isImage ? "🖼" : "🎨"} {i + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SLIDES EDITOR */}
      {slides.length > 0 && (
        <div className="flex flex-col gap-4" style={{ maxWidth: "100%" }}>
          <div className="card-header" style={{ padding: 0 }}>
            <span className="card-title">Слайды ({slides.length})</span>
          </div>
          {slides.map((slide, i) => (
            <div key={i} style={{ padding: 14, background: "var(--bg-hover)", borderRadius: 8, maxWidth: "100%" }}>
              <div className="flex items-center justify-between mb-2" style={{ flexWrap: "wrap", gap: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Слайд {i + 1}{slide.title ? ` — ${slide.title}` : ""}</span>
                <div className="flex items-center gap-2">
                  {slide.visualPrompt && (
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: "2px 6px" }}
                      onClick={() => generatePrompts(i)}
                      disabled={loading === "prompts"}
                    >
                      🔄 промпт
                    </button>
                  )}
                  <span className="tag tag-planned" style={{ fontSize: 10 }}>{i + 1}/{slides.length}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {/* Format toggle */}
                <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                  <span className="text-xs text-dim">Формат:</span>
                  <button
                    className={`btn btn-ghost`}
                    style={{ fontSize: 11, padding: "2px 8px", fontWeight: slide.format === "image" ? 700 : 400, background: slide.format === "image" ? "var(--accent-glow)" : "transparent" }}
                    onClick={() => { if (slide.format !== "image") toggleFormat(i); }}
                  >
                    🖼 Изображение
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: "2px 8px", fontWeight: slide.format === "html" ? 700 : 400, background: slide.format === "html" ? "var(--accent-glow)" : "transparent" }}
                    onClick={() => { if (slide.format !== "html") toggleFormat(i); }}
                  >
                    ✏️ Текст HTML
                  </button>
                </div>

                <div>
                  <label className="text-xs text-dim" style={{ display: "block", marginBottom: 2 }}>Заголовок слайда</label>
                  <input className="input" value={slide.title || ""} onChange={(e) => updateSlide(i, "title", e.target.value)} placeholder="Заголовок" />
                </div>
                <div>
                  <label className="text-xs text-dim" style={{ display: "block", marginBottom: 2 }}>Текст на слайде</label>
                  <textarea className="input" rows={2} value={slide.text || ""} onChange={(e) => updateSlide(i, "text", e.target.value)} />
                </div>

                {/* Canvas Preview */}
                {(!slide.format || slide.format === "image") && slide.imageUrl && (
                  <SlideCanvasPreview slide={slide} />
                )}

                {/* Text Style Controls */}
                {(!slide.format || slide.format === "image") && (
                  <details style={{ marginTop: 4 }}>
                    <summary className="text-xs text-dim" style={{ cursor: "pointer", userSelect: "none" }}>
                      🎨 Стили текста
                    </summary>
                    <div className="flex flex-col gap-2" style={{ marginTop: 6, padding: 10, background: "var(--bg)", borderRadius: 6 }}>
                      <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
                        <div className="flex flex-col gap-1" style={{ flex: "1 1 140px" }}>
                          <label className="text-xs text-dim">Шрифт</label>
                          <select className="input" value={slide.textStyle?.fontFamily || "Inter, system-ui, sans-serif"} onChange={(e) => updateSlideTextStyle(i, "fontFamily", e.target.value)} style={{ fontSize: 12 }}>
                            <option value="Inter, system-ui, sans-serif">Inter</option>
                            <option value="'Montserrat', sans-serif">Montserrat</option>
                            <option value="'Raleway', sans-serif">Raleway</option>
                            <option value="'Roboto', sans-serif">Roboto</option>
                            <option value="'Georgia', serif">Georgia</option>
                            <option value="'Times New Roman', serif">Times New Roman</option>
                            <option value="system-ui, sans-serif">System UI</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-dim">Размер</label>
                          <div className="flex gap-1">
                            {[24, 30, 36, 48, 60].map((s) => (
                              <button key={s} className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 6px", fontWeight: (slide.textStyle?.fontSize || 30) === s ? 700 : 400, background: (slide.textStyle?.fontSize || 30) === s ? "var(--accent-glow)" : "transparent" }} onClick={() => updateSlideTextStyle(i, "fontSize", s)}>{s}</button>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1" style={{ width: 60 }}>
                          <label className="text-xs text-dim">Цвет</label>
                          <input type="color" value={slide.textStyle?.textColor || "#ffffff"} onChange={(e) => updateSlideTextStyle(i, "textColor", e.target.value)} style={{ width: "100%", height: 32, borderRadius: 6, padding: 0, border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-dim">Позиция</label>
                          <div className="flex gap-1">
                            {[{ v: "top", l: "⬆" }, { v: "center", l: "◉" }, { v: "bottom", l: "⬇" }].map(({ v, l }) => (
                              <button key={v} className="btn btn-ghost" style={{ fontSize: 14, padding: "2px 8px", fontWeight: (slide.textStyle?.textPosition || "bottom") === v ? 700 : 400, background: (slide.textStyle?.textPosition || "bottom") === v ? "var(--accent-glow)" : "transparent" }} onClick={() => updateSlideTextStyle(i, "textPosition", v)}>{l}</button>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-dim">Выравнивание</label>
                          <div className="flex gap-1">
                            {[{ v: "left", l: "⊣" }, { v: "center", l: "≣" }].map(({ v, l }) => (
                              <button key={v} className="btn btn-ghost" style={{ fontSize: 14, padding: "2px 8px", fontWeight: (slide.textStyle?.textAlign || "center") === v ? 700 : 400, background: (slide.textStyle?.textAlign || "center") === v ? "var(--accent-glow)" : "transparent" }} onClick={() => updateSlideTextStyle(i, "textAlign", v)}>{l}</button>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1" style={{ flex: "1 1 120px" }}>
                          <label className="text-xs text-dim">Фон: {slide.textStyle?.backgroundOpacity ?? 65}%</label>
                          <input type="range" min={0} max={100} value={slide.textStyle?.backgroundOpacity ?? 65} onChange={(e) => updateSlideTextStyle(i, "backgroundOpacity", Number(e.target.value))} style={{ width: "100%" }} />
                        </div>
                      </div>
                    </div>
                  </details>
                )}

                {/* Compose button */}
                {(!slide.format || slide.format === "image") && slide.imageUrl && slide.text && (
                  <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
                    <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => handleCompose(i)}>
                      🎨 Скомпоновать
                    </button>
                    {slide.composedUrl && <span className="tag tag-ready">Готово</span>}
                  </div>
                )}

                {/* Background upload & library */}
                {(!slide.format || slide.format === "image") && (
                  <div className="flex flex-col gap-2" style={{ marginTop: 4 }}>
                    <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        id={`bg-upload-${i}`}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleBackgroundUpload(i, file);
                          e.target.value = "";
                        }}
                      />
                      <label htmlFor={`bg-upload-${i}`} className="btn btn-ghost" style={{ fontSize: 11, cursor: "pointer" }}>
                        {uploadingBg === i ? "⏳" : "📁 Загрузить фон"}
                      </label>
                      {postAssets.length > 0 && (
                        <button className={`btn btn-ghost`} style={{ fontSize: 11, background: showAssetPicker === i ? "var(--accent-glow)" : "transparent" }} onClick={() => setShowAssetPicker(showAssetPicker === i ? null : i)}>
                          📚 Из библиотеки
                        </button>
                      )}
                    </div>
                    {showAssetPicker === i && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 6, padding: 8, background: "var(--bg)", borderRadius: 6, maxHeight: 200, overflowY: "auto" }}>
                        {postAssets.filter((a: any) => a.type === "image" && a.sourceUrl).map((a: any) => (
                          <div key={a.id} style={{ borderRadius: 6, overflow: "hidden", cursor: "pointer", border: slide.imageUrl === a.sourceUrl ? "2px solid var(--accent)" : "2px solid transparent", position: "relative" }} onClick={() => {
                            const newSlides = slidesRef.current.map((s, idx) => idx === i ? { ...s, imageUrl: a.sourceUrl, composedUrl: "" } : s);
                            slidesRef.current = newSlides;
                            setSlides(newSlides);
                            saveDraft();
                            setShowAssetPicker(null);
                          }}>
                            <img src={a.sourceUrl} alt="" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
                            <div style={{ fontSize: 9, padding: "2px 4px", color: "var(--dim)", textAlign: "center", background: "var(--bg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {a.sourceType === "ai_generated" ? "AI" : "Загружено"}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {(!slide.format || slide.format === "image") ? (
                  <>
                    <div>
                      <label className="text-xs text-dim" style={{ display: "block", marginBottom: 2 }}>Промпт для визуала</label>
                      <div className="flex gap-2">
                        <textarea className="input" rows={2} value={slide.visualPrompt || ""} onChange={(e) => updateSlide(i, "visualPrompt", e.target.value)} style={{ flex: 1 }} />
                        {slide.visualPrompt && (
                          <button
                            className="btn btn-ghost"
                            style={{ flexShrink: 0, fontSize: 14, padding: "4px 8px", alignSelf: "flex-start", opacity: generatingImage === i ? 0.5 : 1 }}
                            disabled={generatingImage === i}
                            onClick={() => generateOneImage(i)}
                          >
                            {generatingImage === i ? "⏳" : "🖼"}
                          </button>
                        )}
                      </div>
                    </div>
                    {slide.imageUrl && (
                      <div style={{ marginTop: 8, borderRadius: 8, overflow: "hidden", maxWidth: "100%" }}>
                        <img src={displayUrl(slide)} alt={`Слайд ${i + 1}`} style={{ width: "100%", maxWidth: 400, display: "block", borderRadius: 6 }} />
                        <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
                          <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 6px", color: "var(--red)" }} onClick={() => updateSlide(i, "imageUrl", "")}>
                            ✕ Удалить
                          </button>
                          {slide.composedUrl && <span className="tag tag-ready" style={{ fontSize: 10 }}>Есть композиция</span>}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-xs text-dim" style={{ display: "block", marginBottom: 2 }}>Стиль оформления</label>
                      <div className="flex gap-2">
                        <input
                          className="input"
                          style={{ flex: 1 }}
                          value={slide.styleHint || ""}
                          onChange={(e) => updateSlide(i, "styleHint", e.target.value)}
                          placeholder="например: крупная цифра, тёмный фон, контраст"
                        />
                        {slide.styleHint && (
                          <button
                            className="btn btn-ghost"
                            style={{ flexShrink: 0, fontSize: 14, padding: "4px 8px", opacity: generatingStyle === i ? 0.5 : 1 }}
                            disabled={generatingStyle === i}
                            onClick={() => generateSlideStyle(i)}
                          >
                            {generatingStyle === i ? "⏳" : "🎨"}
                          </button>
                        )}
                      </div>
                    </div>
                    {slide.slideStyle && (
                      <div style={{ marginTop: 8, borderRadius: 8, overflow: "hidden", maxWidth: 400 }}>
                        <div style={{
                          width: "100%",
                          aspectRatio: "1/1",
                          background: slide.slideStyle.backgroundType === "gradient"
                            ? `linear-gradient(135deg, ${slide.slideStyle.colors?.[0] || "#eee"}, ${slide.slideStyle.colors?.[1] || "#ccc"})`
                            : slide.slideStyle.colors?.[0] || "#eee",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: slide.slideStyle.layout === "center" ? "center" : "flex-start",
                          justifyContent: slide.slideStyle.layout === "bottom" ? "flex-end" : slide.slideStyle.layout === "left" ? "flex-start" : "center",
                          padding: 20,
                          borderRadius: 6,
                          color: slide.slideStyle.textColor || "#fff",
                          fontFamily: "system-ui, sans-serif",
                          textAlign: slide.slideStyle.layout === "center" ? "center" : "left",
                          position: "relative",
                        }}>
                          {selectedStyle?.logoUrl && (
                            <img src={selectedStyle.logoUrl} alt="Logo" style={{
                              position: "absolute",
                              top: 8,
                              left: 8,
                              height: 20,
                              width: "auto",
                              opacity: 0.7,
                              pointerEvents: "none",
                            }} />
                          )}
                          <div style={{
                            fontSize: slide.slideStyle.titleSize === "large" ? 22 : 16,
                            fontWeight: 700,
                            marginBottom: 8,
                          }}>
                            {slide.title || "Заголовок"}
                          </div>
                          <div style={{ fontSize: 13, opacity: 0.9, maxWidth: "90%" }}>
                            {slide.text || "Текст слайда"}
                          </div>
                          {slide.slideStyle.accentType && slide.slideStyle.accentType !== "none" && (
                            <div style={{
                              marginTop: 12,
                              width: 40,
                              height: 3,
                              background: slide.slideStyle.accentColor || slide.slideStyle.textColor,
                              borderRadius: 2,
                              opacity: 0.6,
                            }} />
                          )}
                        </div>
                        <div className="text-xs text-dim" style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span>{slide.slideStyle.backgroundType}</span>
                          <span>{slide.slideStyle.colors?.join(", ")}</span>
                          <span>{slide.slideStyle.layout}</span>
                        </div>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: 11, marginTop: 4, padding: "2px 6px" }}
                          onClick={() => generateSlideStyle(i)}
                          disabled={generatingStyle === i}
                        >
                          {generatingStyle === i ? "..." : "🎨 Сгенерировать заново"}
                        </button>
                        {/* Style property editors */}
                        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                          <div className="text-xs text-dim" style={{ fontWeight: 600 }}>Свойства стиля</div>
                          <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                            <div className="flex flex-col gap-1" style={{ flex: "1 1 120px" }}>
                              <label className="text-xs text-dim">Цвет 1</label>
                              <input type="color" value={slide.slideStyle.colors?.[0] || "#6366f1"} onChange={(e) => {
                                const newColors = [...(slide.slideStyle.colors || ["#6366f1", "#818cf8"])];
                                newColors[0] = e.target.value;
                                updateSlide(i, "slideStyle", { ...slide.slideStyle, colors: newColors });
                              }} style={{ width: "100%", height: 32, borderRadius: 6, padding: 0, border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }} />
                            </div>
                            <div className="flex flex-col gap-1" style={{ flex: "1 1 120px" }}>
                              <label className="text-xs text-dim">Цвет 2</label>
                              <input type="color" value={slide.slideStyle.colors?.[1] || slide.slideStyle.colors?.[0] || "#818cf8"} onChange={(e) => {
                                const newColors = [...(slide.slideStyle.colors || ["#6366f1", "#818cf8"])];
                                newColors[1] = e.target.value;
                                updateSlide(i, "slideStyle", { ...slide.slideStyle, colors: newColors });
                              }} style={{ width: "100%", height: 32, borderRadius: 6, padding: 0, border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }} />
                            </div>
                            <div className="flex flex-col gap-1" style={{ flex: "1 1 120px" }}>
                              <label className="text-xs text-dim">Цвет текста</label>
                              <input type="color" value={slide.slideStyle.textColor || "#ffffff"} onChange={(e) => updateSlide(i, "slideStyle", { ...slide.slideStyle, textColor: e.target.value })} style={{ width: "100%", height: 32, borderRadius: 6, padding: 0, border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }} />
                            </div>
                          </div>
                          <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                            <div className="flex flex-col gap-1" style={{ flex: "1 1 140px" }}>
                              <label className="text-xs text-dim">Фон</label>
                              <select className="input" value={slide.slideStyle.backgroundType || "solid"} onChange={(e) => updateSlide(i, "slideStyle", { ...slide.slideStyle, backgroundType: e.target.value })} style={{ fontSize: 12 }}>
                                <option value="solid">Заливка</option>
                                <option value="gradient">Градиент</option>
                              </select>
                            </div>
                            <div className="flex flex-col gap-1" style={{ flex: "1 1 140px" }}>
                              <label className="text-xs text-dim">Расположение</label>
                              <select className="input" value={slide.slideStyle.layout || "center"} onChange={(e) => updateSlide(i, "slideStyle", { ...slide.slideStyle, layout: e.target.value })} style={{ fontSize: 12 }}>
                                <option value="center">Центр</option>
                                <option value="left">Слева</option>
                                <option value="bottom">Снизу</option>
                              </select>
                            </div>
                            <div className="flex flex-col gap-1" style={{ flex: "1 1 100px" }}>
                              <label className="text-xs text-dim">Размер заголовка</label>
                              <select className="input" value={slide.slideStyle.titleSize || "medium"} onChange={(e) => updateSlide(i, "slideStyle", { ...slide.slideStyle, titleSize: e.target.value })} style={{ fontSize: 12 }}>
                                <option value="medium">Средний</option>
                                <option value="large">Крупный</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                            <div className="flex flex-col gap-1" style={{ flex: "1 1 140px" }}>
                              <label className="text-xs text-dim">Акцент</label>
                              <select className="input" value={slide.slideStyle.accentType || "none"} onChange={(e) => updateSlide(i, "slideStyle", { ...slide.slideStyle, accentType: e.target.value })} style={{ fontSize: 12 }}>
                                <option value="none">Нет</option>
                                <option value="line">Линия</option>
                              </select>
                            </div>
                            <div className="flex flex-col gap-1" style={{ flex: "1 1 120px" }}>
                              <label className="text-xs text-dim">Цвет акцента</label>
                              <input type="color" value={slide.slideStyle.accentColor || slide.slideStyle.textColor || "#ffffff"} onChange={(e) => updateSlide(i, "slideStyle", { ...slide.slideStyle, accentColor: e.target.value })} style={{ width: "100%", height: 32, borderRadius: 6, padding: 0, border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview strip — always show when 2+ slides */}
      {slides.length > 1 && (
        <div className="card" style={{ maxWidth: "100%" }}>
          <div className="card-header">
            <span className="card-title">👁 Предпросмотр карусели</span>
            <span className="text-xs text-dim">{slides.length} слайдов</span>
          </div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
            {slides.map((slide, i) => (
              <div key={i} style={{ flex: "0 0 auto", width: 140, textAlign: "center" }}>
                {slide.imageUrl ? (
                  <img src={displayUrl(slide)} alt={`Слайд ${i + 1}`} style={{ width: "100%", borderRadius: 6, display: "block" }} />
                ) : slide.slideStyle ? (
                  <div style={{
                    width: "100%",
                    aspectRatio: "1/1",
                    borderRadius: 6,
                    background: slide.slideStyle.backgroundType === "gradient"
                      ? `linear-gradient(135deg, ${slide.slideStyle.colors?.[0] || "#eee"}, ${slide.slideStyle.colors?.[1] || "#ccc"})`
                      : slide.slideStyle.colors?.[0] || "#eee",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 10,
                    color: slide.slideStyle.textColor || "#fff",
                    fontSize: 11,
                    fontFamily: "system-ui",
                    boxSizing: "border-box",
                    position: "relative",
                  }}>
                    {selectedStyle?.logoUrl && (
                      <img src={selectedStyle.logoUrl} alt="Logo" style={{
                        position: "absolute",
                        top: 4,
                        left: 4,
                        height: 14,
                        width: "auto",
                        opacity: 0.6,
                        pointerEvents: "none",
                      }} />
                    )}
                    <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 12 }}>{slide.title || `Слайд ${i + 1}`}</div>
                    <div style={{ opacity: 0.8, overflow: "hidden", maxHeight: 30 }}>{slide.text}</div>
                  </div>
                ) : slide.format === "html" ? (
                  <div style={{ width: "100%", aspectRatio: "1/1", borderRadius: 6, background: "var(--bg-hover)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--dim)", flexDirection: "column" }}>
                    <span>✏️ HTML</span>
                    <span style={{ fontSize: 9 }}>нет стиля</span>
                  </div>
                ) : (
                  <div style={{ width: "100%", aspectRatio: "1/1", borderRadius: 6, background: "var(--bg-hover)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--dim)", flexDirection: "column" }}>
                    <span>🖼</span>
                    <span style={{ fontSize: 9 }}>нет картинки</span>
                  </div>
                )}
                <div style={{ fontSize: 11, marginTop: 4, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {slide.title || `Слайд ${i + 1}`}
                </div>
                {slide.format === "html" && (
                  <div style={{ fontSize: 9, color: "var(--accent)", marginTop: 2 }}>HTML</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {allImagesGenerated && (
        <p className="text-xs text-dim" style={{ textAlign: "center" }}>
          ✅ Все картинки сгенерированы.
        </p>
      )}

      {/* SECTION: Post Caption */}
      <div className="card">
        <div className="card-header" style={{ padding: 0 }}>
          <span className="card-title">📝 Текст поста (подпись)</span>
          {captionText && <span className="tag tag-ready">{captionText.length} зн.</span>}
        </div>
        <div className="flex flex-col gap-3" style={{ marginTop: 8 }}>
          <div style={{ position: "relative", width: "100%" }}>
            <textarea
              className="input"
              rows={6}
              value={captionText}
              onChange={(e) => setCaptionText(e.target.value)}
              placeholder="Текст подписи к карусели (можно использовать Markdown)"
              style={{ width: "100%", resize: "vertical", minHeight: 120 }}
            />
            <div style={{
              position: "absolute", bottom: 2, right: 2,
              width: 14, height: 14, pointerEvents: "none",
              borderRight: "3px solid var(--accent)", borderBottom: "3px solid var(--accent)",
              opacity: 0.5, borderRadius: "0 0 4px 0",
            }} />
          </div>
          <div className="text-xs text-dim">
            Можно использовать Markdown: **жирный**, *курсив*, #теги, [ссылка](url)
          </div>
          <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              onClick={generateCaption}
              disabled={generatingCaption}
            >
              {generatingCaption ? "Генерация..." : "🔥 Сгенерировать текст"}
            </button>
            <button
              className="btn btn-ghost"
              onClick={generateTags}
              disabled={generatingTags}
            >
              {generatingTags ? "⏳" : "🏷"} Тэги
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default CarouselTab;
