import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useState, useEffect } from "react";

interface GeneratePanelProps {
  postId: string;
  postTitle: string;
  postGoal?: string;
  postHook?: string;
  postKeyMessage?: string;
  postCta?: string;
  postRubric?: string;
  postContentType?: string;
  postContentTypeCode?: string;
}

const CONTENT_TYPE_TO_TEMPLATE: Record<string, string> = {
  post: "caption-post",
  carousel: "caption-carousel",
  reel: "caption-reel",
  stories: "caption-stories",
};

export default function GeneratePanel({
  postId,
  postTitle,
  postGoal,
  postHook,
  postKeyMessage,
  postCta,
  postRubric,
  postContentType,
  postContentTypeCode,
}: GeneratePanelProps) {
  const queryClient = useQueryClient();
  const autoTemplate = CONTENT_TYPE_TO_TEMPLATE[postContentTypeCode || ""];
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [result, setResult] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (autoTemplate) setSelectedTemplate(autoTemplate);
  }, [autoTemplate]);

  const { data: templates } = useQuery({
    queryKey: ["templates"],
    queryFn: () => fetch("/api/generate/templates").then((r) => r.json()),
  });

  const generateContent = useMutation({
    mutationFn: async () => {
      setIsGenerating(true);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplate,
          postItemId: postId,
          variables: {
            title: postTitle,
            goal: postGoal || "",
            hook: postHook || "",
            keyMessage: postKeyMessage || "",
            cta: postCta || "",
            rubric: postRubric || "",
            contentType: postContentType || "",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      setResult(data.content);
      setIsGenerating(false);
      queryClient.invalidateQueries({ queryKey: ["drafts", postId] });
    },
    onError: () => setIsGenerating(false),
  });

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Создание поста</span>
      </div>

      <div className="flex flex-col gap-4">
        {autoTemplate ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="tag tag-ready">✓</span>
            <span>Выбран шаблон: <strong>{(templates || []).find((t: any) => t.id === autoTemplate)?.name}</strong></span>
          </div>
        ) : (
          <div>
            <label className="text-xs text-dim" style={{ display: "block", marginBottom: 4 }}>Шаблон</label>
            <select
              className="input"
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
            >
              <option value="">Выберите шаблон...</option>
              {(templates || []).map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={() => generateContent.mutate()}
          disabled={!selectedTemplate || isGenerating}
        >
          {isGenerating ? "Генерация..." : "⚡ Сгенерировать"}
        </button>

        {result && (
          <div style={{ padding: 14, background: "var(--bg-hover)", borderRadius: 8 }}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-dim">Результат</span>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 11 }}
                onClick={() => navigator.clipboard.writeText(result)}
              >
                📋 Копировать
              </button>
            </div>
            <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{result}</div>
          </div>
        )}

        <div className="text-xs text-dim">
          Результат сохраняется как черновик. Можно отредактировать во вкладке Drafts.
        </div>
      </div>
    </div>
  );
}
