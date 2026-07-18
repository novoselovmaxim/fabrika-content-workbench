import React, { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

const statusLabels: Record<string, string> = {
  idea: "Идея", planned: "Запланирован", draft: "Черновик",
  generated: "Сгенерирован", editing: "Редактируется", ready: "Готов",
  scheduled: "В очереди", published: "Опубликован", archived: "Архив",
};

const statusColors: Record<string, string> = {
  idea: "tag-idea", planned: "tag-planned", draft: "tag-draft",
  generated: "tag-generated", editing: "tag-editing", ready: "tag-ready",
  scheduled: "tag-scheduled", published: "tag-published", archived: "tag-archived",
};

const statuses = ["idea", "planned", "draft", "generated", "editing", "ready", "scheduled", "published", "archived"];

function CarouselPreview({ slides, caption, displayName }: { slides: any[]; caption: string; displayName: string }) {
  const [idx, setIdx] = useState(0);
  const current = slides[idx];

  if (!current) return <div className="text-dim text-sm">Нет слайдов для предпросмотра</div>;

  const downloadAllSlides = async () => {
    for (let i = 0; i < slides.length; i++) {
      const url = slides[i].composedUrl || slides[i].imageUrl;
      if (!url) continue;
      const ext = url.split(".").pop() || "png";
      const a = document.createElement("a");
      a.href = url;
      a.download = `slide-${i + 1}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      await new Promise((r) => setTimeout(r, 200));
    }
  };

  const copyCaption = async () => {
    if (caption) await navigator.clipboard.writeText(caption);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Карточка карусели — Instagram-like */}
      <div style={{
        width: "100%", maxWidth: 400, borderRadius: 12, overflow: "hidden",
        border: "1px solid var(--border)", background: "#fff",
      }}>
        {/* Изображение */}
        <div style={{ position: "relative", aspectRatio: "1/1", background: "#f0f0f0" }}>
          {(current.composedUrl || current.imageUrl) ? (
            <>
              <img src={current.composedUrl || current.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <button onClick={downloadAllSlides} className="preview-dl-btn" title="Скачать все слайды">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            </>
          ) : current.slideStyle ? (
            <div style={{
              width: "100%", height: "100%",
              background: current.slideStyle.backgroundType === "gradient"
                ? `linear-gradient(135deg, ${(current.slideStyle.colors || ["#eee", "#ccc"]).join(", ")})`
                : (current.slideStyle.colors?.[0] || "#f0f0f0"),
              color: current.slideStyle.textColor || "#333",
              display: "flex", flexDirection: "column",
              alignItems: current.slideStyle.layout === "left" ? "flex-start" : "center",
              justifyContent: "center",
              padding: 24, textAlign: current.slideStyle.layout === "left" ? "left" : "center",
              boxSizing: "border-box",
            }}>
              {current.title && (
                <div style={{
                  fontWeight: 700,
                  fontSize: current.slideStyle.titleSize === "large" ? 20 : current.slideStyle.titleSize === "medium" ? 16 : 14,
                  marginBottom: 8,
                }}>
                  {current.title}
                </div>
              )}
              {current.text && (
                <div style={{ fontSize: 13, lineHeight: 1.4, opacity: 0.85 }}>
                  {current.text}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#999", fontSize: 13 }}>
              Нет картинки
            </div>
          )}
        </div>

        {/* Навигация */}
        {slides.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "10px 12px" }}>
            <button
              onClick={() => setIdx(Math.max(0, idx - 1))}
              disabled={idx === 0}
              style={{ background: "none", border: "none", fontSize: 18, cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.3 : 1, color: "#333" }}
            >
              ‹
            </button>
            <div style={{ display: "flex", gap: 6 }}>
              {slides.map((_, i) => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: i === idx ? "#3897f0" : "#ddd", cursor: "pointer", transition: "background 0.2s",
                }} onClick={() => setIdx(i)} />
              ))}
            </div>
            <button
              onClick={() => setIdx(Math.min(slides.length - 1, idx + 1))}
              disabled={idx === slides.length - 1}
              style={{ background: "none", border: "none", fontSize: 18, cursor: idx === slides.length - 1 ? "default" : "pointer", opacity: idx === slides.length - 1 ? 0.3 : 1, color: "#333" }}
            >
              ›
            </button>
          </div>
        )}

        {/* Счётчик */}
        <div style={{ textAlign: "center", fontSize: 12, color: "#999", paddingBottom: 8 }}>
          {idx + 1} / {slides.length}
        </div>
      </div>

      {/* Caption снизу */}
      {caption && (
        <div style={{
          width: "100%", maxWidth: 400, borderRadius: 12, padding: 16, position: "relative",
          border: "1px solid var(--border)", background: "#fff", fontSize: 13, lineHeight: 1.5,
          color: "#262626",
        }}>
          <button onClick={copyCaption} className="preview-copy-btn" title="Копировать текст">📋</button>
          <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 600 }}>
              Б
            </div>
            <span style={{ fontWeight: 600, fontSize: 13 }}>@{displayName}</span>
          </div>
          <div><strong style={{ fontWeight: 600 }}>@{displayName}</strong> {renderMarkdown(caption)}</div>
        </div>
      )}
    </div>
  );
}

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  return lines.map((line, li) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let key = 0;
    const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(remaining)) !== null) {
      if (match.index > lastIdx) {
        parts.push(renderInlineText(remaining.slice(lastIdx, match.index), key++));
      }
      if (match[2]) {
        parts.push(<strong key={key++}>{match[2]}</strong>);
      } else if (match[4]) {
        parts.push(<em key={key++}>{match[4]}</em>);
      } else if (match[6]) {
        parts.push(<a key={key++} href={match[7]} target="_blank" rel="noopener noreferrer" style={{ color: "#3897f0" }}>{match[6]}</a>);
      }
      lastIdx = regex.lastIndex;
    }
    if (lastIdx < remaining.length) {
      parts.push(renderInlineText(remaining.slice(lastIdx), key++));
    }
    if (li < lines.length - 1) parts.push(<br key={`br-${li}`} />);
    return <span key={li}>{parts}</span>;
  });
}

function renderInlineText(text: string, key: number): React.ReactNode {
  const tagRegex = /(#[\wа-яёА-ЯЁ]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    parts.push(
      <span key={`${key}-${match.index}`} style={{ color: "#3897f0" }}>{match[1]}</span>
    );
    lastIdx = tagRegex.lastIndex;
  }
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }
  return parts.length > 0 ? <>{parts}</> : text;
}

function TelegramPreview({ imageUrl, caption, displayName }: { imageUrl?: string; caption: string; displayName: string }) {
  const copyCaption = async () => {
    if (caption) await navigator.clipboard.writeText(caption);
  };

  return (
    <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Telegram-style channel header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#2AABEE", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
          {(displayName || "T")[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--fg)", lineHeight: 1.3 }}>{displayName}</div>
          <div style={{ fontSize: 11, color: "var(--dim)" }}>канал</div>
        </div>
      </div>
      {/* Image */}
      {imageUrl && (
        <div style={{ width: "100%", aspectRatio: "1/1", background: "#f0f0f0", overflow: "hidden" }}>
          <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
      )}
      {/* Caption */}
      {caption && (
        <div style={{ padding: "8px 16px", position: "relative", fontSize: 14, lineHeight: 1.5, color: "var(--fg)" }}>
          <button onClick={copyCaption} className="preview-copy-btn" title="Копировать текст">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </button>
          {renderMarkdown(caption)}
        </div>
      )}
      {/* View count footer (Telegram-style) */}
      <div style={{ padding: "4px 16px 12px", fontSize: 11, color: "var(--dim)", display: "flex", alignItems: "center", gap: 16 }}>
        <span>👁 0</span>
        <button onClick={copyCaption} style={{ background: "none", border: "none", cursor: "pointer", color: "#2AABEE", fontSize: 12, padding: 0 }}>📋 Копировать</button>
      </div>
    </div>
  );
}

function VKPreview({ imageUrl, caption, displayName }: { imageUrl?: string; caption: string; displayName: string }) {
  const copyCaption = async () => {
    if (caption) await navigator.clipboard.writeText(caption);
  };

  return (
    <div style={{ width: "100%", maxWidth: 420, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", background: "#fff" }}>
      {/* VK header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#0077FF", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
          {(displayName || "V")[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#2a5885" }}>{displayName}</div>
          <div style={{ fontSize: 11, color: "#818c99" }}>Сообщество</div>
        </div>
      </div>
      {/* Image */}
      {imageUrl && (
        <div style={{ width: "100%", aspectRatio: "1/1", background: "#f0f0f0" }}>
          <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
      )}
      {/* Caption */}
      {caption && (
        <div style={{ padding: "8px 16px", position: "relative", fontSize: 13, lineHeight: 1.5, color: "#000" }}>
          <button onClick={copyCaption} className="preview-copy-btn" title="Копировать текст">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </button>
          {renderMarkdown(caption)}
        </div>
      )}
      {/* VK action bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "8px 16px 12px", fontSize: 12, color: "#818c99" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>❤ 0</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>💬 0</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>↗ 0</span>
        <span style={{ flex: 1 }} />
        <button onClick={copyCaption} style={{ background: "none", border: "none", cursor: "pointer", color: "#818c99", fontSize: 12, padding: 0 }}>📋</button>
      </div>
    </div>
  );
}

function YouTubePreview({ imageUrl, caption, displayName }: { imageUrl?: string; caption: string; displayName: string }) {
  const copyCaption = async () => {
    if (caption) await navigator.clipboard.writeText(caption);
  };

  return (
    <div style={{ width: "100%", maxWidth: 420 }}>
      {/* Thumbnail */}
      <div style={{ width: "100%", aspectRatio: "16/9", background: "#111", borderRadius: 12, overflow: "hidden", position: "relative" }}>
        {imageUrl ? (
          <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 13 }}>
            Нет превью
          </div>
        )}
        {/* Play button overlay */}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 48, height: 48, background: "rgba(0,0,0,0.7)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><polygon points="8,5 19,12 8,19" /></svg>
        </div>
        {/* Duration badge */}
        <div style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(0,0,0,0.8)", color: "#fff", fontSize: 11, padding: "2px 6px", borderRadius: 4 }}>0:00</div>
      </div>
      {/* Info row */}
      <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#555", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 700 }}>
          {(displayName || "Y")[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3, color: "var(--fg)", marginBottom: 4 }}>{caption.slice(0, 80) || "Заголовок видео"}</div>
          <div style={{ fontSize: 12, color: "var(--dim)" }}>{displayName}</div>
          <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 2 }}>0 просмотров</div>
        </div>
      </div>
      {/* Like/dislike bar */}
      {caption && (
        <div style={{ marginTop: 8, padding: "6px 0", fontSize: 12, color: "var(--dim)", display: "flex", alignItems: "center", gap: 12 }}>
          <span>👍 0</span>
          <span>👎 0</span>
          <span style={{ flex: 1 }} />
          <button onClick={copyCaption} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dim)", fontSize: 12, padding: 0 }}>📋</button>
        </div>
      )}
    </div>
  );
}

function PostPreview({ imageUrl, caption, displayName }: { imageUrl?: string; caption: string; displayName: string }) {
  const downloadImage = async () => {
    if (!imageUrl) return;
    const ext = imageUrl.split(".").pop() || "png";
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `image.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const copyCaption = async () => {
    if (caption) await navigator.clipboard.writeText(caption);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div style={{
        width: "100%", maxWidth: 400, borderRadius: 12, overflow: "hidden",
        border: "1px solid var(--border)", background: "#fff",
      }}>
        {/* Аватар + имя */}
        <div className="flex items-center gap-2" style={{ padding: "10px 14px" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 600 }}>
            Б
          </div>
          <span style={{ fontWeight: 600, fontSize: 13, color: "#262626" }}>@{displayName}</span>
        </div>

        {/* Изображение */}
        <div style={{ position: "relative", aspectRatio: "1/1", background: "#f0f0f0" }}>
          {imageUrl ? (
            <>
              <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <button onClick={downloadImage} className="preview-dl-btn" title="Скачать">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#999", fontSize: 13 }}>
              Нет картинки
            </div>
          )}
        </div>

        {/* Иконки действий (заглушки) */}
        <div className="flex items-center gap-3" style={{ padding: "8px 14px" }}>
          <span style={{ fontSize: 22 }}>🤍</span>
          <span style={{ fontSize: 22 }}>💬</span>
          <span style={{ fontSize: 22 }}>↗</span>
        </div>

        {/* Caption */}
        {caption && (
          <div style={{ padding: "0 14px 12px", position: "relative", fontSize: 13, lineHeight: 1.5, color: "#262626" }}>
<button onClick={copyCaption} className="preview-copy-btn" title="Копировать текст">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </button>
            <strong style={{ fontWeight: 600 }}>@{displayName}</strong> {renderMarkdown(caption)}
          </div>
        )}
      </div>
    </div>
  );
}

function StoriesPreview({ cards }: { cards: any[] }) {
  const [idx, setIdx] = useState(0);
  const current = cards[idx];

  if (!current) return <div className="text-dim text-sm">Нет карточек для предпросмотра</div>;

  return (
    <div className="flex flex-col items-center gap-3">
      <div style={{
        width: 240, aspectRatio: "9/16", borderRadius: 16, overflow: "hidden",
        border: "1px solid var(--border)", background: "#f0f0f0", position: "relative",
      }}>
        {/* Прогресс-бары */}
        <div className="flex gap-1" style={{ position: "absolute", top: 8, left: 8, right: 8, zIndex: 2 }}>
          {cards.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 2, borderRadius: 1, background: i <= idx ? "#fff" : "rgba(255,255,255,0.4)" }} />
          ))}
        </div>

        {/* Изображение */}
        {current.imageUrl ? (
          <img src={current.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#999", fontSize: 13 }}>
            Нет картинки
          </div>
        )}

        {/* Текст на экране */}
        {current.text && (
          <div style={{
            position: "absolute", bottom: 40, left: 16, right: 16,
            color: "#fff", fontSize: 16, fontWeight: 600, textAlign: "center",
            textShadow: "0 1px 4px rgba(0,0,0,0.5)", lineHeight: 1.3,
          }}>
            {current.text}
          </div>
        )}

        {/* Навигация */}
        <button onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0} style={{
          position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)",
          background: "rgba(255,255,255,0.3)", border: "none", borderRadius: "50%",
          width: 24, height: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 14, opacity: idx === 0 ? 0.3 : 1,
        }}>‹</button>
        <button onClick={() => setIdx(Math.min(cards.length - 1, idx + 1))} disabled={idx === cards.length - 1} style={{
          position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
          background: "rgba(255,255,255,0.3)", border: "none", borderRadius: "50%",
          width: 24, height: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 14, opacity: idx === cards.length - 1 ? 0.3 : 1,
        }}>›</button>
      </div>
      <div className="text-xs text-dim">{idx + 1} / {cards.length}</div>
    </div>
  );
}

function ReelPreview({ script }: { script: any[] }) {
  const [idx, setIdx] = useState(0);
  const current = script[idx];

  if (!current) return <div className="text-dim text-sm">Нет сценария для предпросмотра</div>;

  return (
    <div className="flex flex-col items-center gap-3">
      <div style={{
        width: 240, aspectRatio: "9/16", borderRadius: 16, overflow: "hidden",
        border: "1px solid var(--border)", background: "linear-gradient(180deg, #1a1a2e, #16213e)",
        position: "relative",
      }}>
        {/* Информация о кадре */}
        <div style={{ padding: 16, color: "#fff" }}>
          {current.time && (
            <span style={{
              background: "rgba(255,255,255,0.15)", padding: "2px 8px", borderRadius: 4,
              fontSize: 11, display: "inline-block", marginBottom: 8,
            }}>
              {current.time}
            </span>
          )}
          {current.visual && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 12, lineHeight: 1.4 }}>
              🎬 {current.visual}
            </div>
          )}
          {current.text && (
            <div style={{ fontSize: 14, lineHeight: 1.5, color: "#fff", marginBottom: 8 }}>
              🔊 {current.text}
            </div>
          )}
          {current.textOnScreen && (
            <div style={{
              fontSize: 13, lineHeight: 1.4, color: "#fff",
              background: "rgba(0,0,0,0.4)", padding: "8px 12px", borderRadius: 8,
              textAlign: "center",
            }}>
              {current.textOnScreen}
            </div>
          )}
        </div>

        {/* Прогресс-бар */}
        <div style={{
          position: "absolute", bottom: 16, left: 16, right: 16,
        }}>
          <div style={{
            width: "100%", height: 3, background: "rgba(255,255,255,0.2)", borderRadius: 2,
            overflow: "hidden",
          }}>
            <div style={{
              width: `${((idx + 1) / script.length) * 100}%`, height: "100%",
              background: "#fff", borderRadius: 2, transition: "width 0.3s",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <button onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0} style={{
              background: "none", border: "none", color: "#fff", cursor: "pointer", opacity: idx === 0 ? 0.3 : 1, fontSize: 16,
            }}>⏮</button>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{idx + 1}/{script.length}</span>
            <button onClick={() => setIdx(Math.min(script.length - 1, idx + 1))} disabled={idx === script.length - 1} style={{
              background: "none", border: "none", color: "#fff", cursor: "pointer", opacity: idx === script.length - 1 ? 0.3 : 1, fontSize: 16,
            }}>⏭</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PublicationTab({
  post, updatePost, assets, pipeline, drafts,
}: {
  post: any; updatePost: any; assets: any[] | undefined; pipeline: any[] | undefined; drafts: any[] | undefined;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const contentTypeCode = post.contentTypeCode || "post";

  // Read draft data for preview — prefer the one marked as active
  function pickDraft(stage: string) {
    if (!drafts) return undefined;
    const active = drafts.find((d) => d.stage === stage && d.id === post.versionCurrentId);
    return active || drafts.find((d) => d.stage === stage);
  }
  const captionDraft = pickDraft("caption");
  const carouselDraft = pickDraft("carousel");
  const storiesDraft = pickDraft("stories");
  const reelDraft = pickDraft("reel");

  let carouselSlides: any[] = [];
  try { if (carouselDraft?.contentJson) carouselSlides = JSON.parse(carouselDraft.contentJson).slides || []; } catch {}

  let storyCards: any[] = [];
  try { if (storiesDraft?.contentJson) storyCards = JSON.parse(storiesDraft.contentJson).stories || []; } catch {}

  let reelScript: any[] = [];
  try { if (reelDraft?.contentJson) reelScript = JSON.parse(reelDraft.contentJson).script || []; } catch {}

  const caption = captionDraft?.contentMarkdown || "";

  let selectedImageUrl = "";
  try {
    if (captionDraft?.contentJson) {
      const parsed = JSON.parse(captionDraft.contentJson);
      if (parsed.imageUrl) selectedImageUrl = parsed.imageUrl;
    }
  } catch {}
  if (!selectedImageUrl) {
    const imageAssets = (assets || []).filter((a: any) => a.type === "image");
    const last = imageAssets.sort((a: any, b: any) => (a.createdAt || a.id) > (b.createdAt || b.id) ? 1 : -1).at(-1);
    selectedImageUrl = last?.sourceUrl || "";
  }

  const displayName = post.platformAccountHandle || post.platformName || "username";

  const [downloading, setDownloading] = useState(false);

  const downloadAllAssets = async () => {
    if (!assets || assets.length === 0) return;
    setDownloading(true);
    try {
      const images = assets.filter((a: any) => a.type === "image" && a.sourceUrl);
      const slug = (post.title || "post").slice(0, 30).replace(/[^a-zA-Zа-яА-Я0-9-_]/g, "_").toLowerCase();
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const ext = img.sourceUrl.split(".").pop() || "png";
        const filename = `${slug}-${i + 1}.${ext}`;
        const a = document.createElement("a");
        a.href = img.sourceUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        await new Promise((r) => setTimeout(r, 200));
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("postItemId", post.id);
      form.append("type", file.type.startsWith("video") ? "video" : "image");
      form.append("sourceType", "manual_upload");
      const res = await fetch("/api/assets/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error(((await res.json()).error) || "Upload failed");
    } catch (err: any) {
      alert("❌ " + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Панель статуса — Прогресс публикации */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📋 Прогресс публикации</span>
          <span className={`tag ${statusColors[post.status]}`} style={{ fontSize: 14, padding: "4px 12px" }}>
            {statusLabels[post.status]}
          </span>
        </div>

        {(() => {
          const hasContent = contentTypeCode === "carousel" ? carouselSlides.length > 0
            : contentTypeCode === "stories" ? storyCards.length > 0
            : contentTypeCode === "reel" ? reelScript.length > 0
            : !!captionDraft?.contentMarkdown;

          const stages = [
            { key: "brief", icon: "📝", label: "Бриф", tip: "Заполните цель, хук и ключевое сообщение на вкладке «Метаданные»" },
            { key: "content", icon: "🎨", label: "Контент", tip: "Создайте контент в редакторе" },
            { key: "visuals", icon: "🖼", label: "Визуалы", tip: "Загрузите изображения в разделе ниже" },
            { key: "ready", icon: "✅", label: "Готов", tip: "Проверьте пост и нажмите «Пометить готовым»" },
            { key: "scheduled", icon: "📅", label: "Запл.", tip: "Назначьте дату публикации" },
          ];

          const currentStageIdx = (() => {
            if (!(post.goal && post.hook && post.keyMessage)) return 0;
            if (!hasContent) return 1;
            if (!assets || assets.length === 0) return 2;
            if (!["ready", "scheduled", "published"].includes(post.status)) return 3;
            if (!post.scheduledDate) return 4;
            return 5;
          })();

          return (
            <>
              <div style={{ display: "flex", alignItems: "center", width: "100%", margin: "16px 0 8px" }}>
                {stages.map((s, i) => {
                  const done = i < currentStageIdx;
                  const current = i === currentStageIdx;
                  return (
                    <React.Fragment key={s.key}>
                      {i > 0 && (
                        <div style={{
                          flex: 1, height: 2,
                          background: done ? "var(--accent)" : "var(--border)",
                          alignSelf: "center",
                          marginBottom: 24,
                        }} />
                      )}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 16, fontWeight: 600,
                          background: done ? "var(--accent)" : current ? "rgba(99,102,241,0.15)" : "var(--bg-hover)",
                          border: current ? "2px solid var(--accent)" : "2px solid transparent",
                          color: done ? "#fff" : current ? "var(--accent)" : "var(--dim)",
                          transition: "all 0.3s",
                        }}>
                          {done ? "✓" : s.icon}
                        </div>
                        <span style={{
                          fontSize: 11, marginTop: 6, whiteSpace: "nowrap",
                          color: done ? "var(--text)" : current ? "var(--accent)" : "var(--dim)",
                          fontWeight: current ? 600 : 400,
                        }}>
                          {s.label}
                        </span>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>

              <div style={{ margin: "8px 0 12px" }}>
                <div style={{
                  width: "100%", height: 4, background: "var(--bg-hover)", borderRadius: 2,
                  overflow: "hidden",
                }}>
                  <div style={{
                    width: `${(currentStageIdx / stages.length) * 100}%`, height: "100%",
                    background: "var(--accent)", borderRadius: 2,
                    transition: "width 0.4s ease",
                  }} />
                </div>
                <div className="text-xs text-dim" style={{ marginTop: 4, textAlign: "right" }}>
                  {currentStageIdx}/{stages.length} этапов
                </div>
              </div>

              {currentStageIdx < stages.length && (
                <div style={{
                  fontSize: 12, padding: "8px 12px",
                  background: "var(--bg-hover)", borderRadius: 8,
                  color: "var(--text-dim)", marginBottom: 16, lineHeight: 1.4,
                }}>
                  💡 <strong>Следующий шаг:</strong> {stages[currentStageIdx].tip}
                </div>
              )}

              <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
                <span className="text-xs text-dim">Ручное управление:</span>
                <select
                  className="input"
                  style={{ width: 160, fontSize: 12 }}
                  value={post.status}
                  onChange={(e) => updatePost.mutate({ status: e.target.value })}
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>{statusLabels[s]}</option>
                  ))}
                </select>
                <input
                  className="input"
                  type="date"
                  value={post.scheduledDate || ""}
                  onChange={(e) => {
                    const updates: any = { scheduledDate: e.target.value };
                    if (post.status === "ready" && e.target.value) {
                      updates.status = "scheduled";
                    }
                    updatePost.mutate(updates);
                  }}
                  style={{ width: 160, fontSize: 12 }}
                />
              </div>
            </>
          );
        })()}
      </div>

      {/* Загрузка внешних файлов */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Загрузка файлов</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleUpload}
            style={{ display: "none" }}
          />
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? "Загрузка..." : "📁 Загрузить изображение / видео"}
          </button>
          <span className="text-xs text-dim">PNG, JPG, GIF, WEBP, MP4, MOV</span>
        </div>
      </div>

      {/* Ассеты — сетка превью */}
      {assets && assets.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Ассеты ({assets.length})</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
            {assets.map((a: any) => (
              <div key={a.id} style={{ borderRadius: 8, overflow: "hidden", background: "var(--bg-hover)", position: "relative" }}>
                {a.sourceUrl ? (
                  a.type === "video" ? (
                    <video src={a.sourceUrl} style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover" }} />
                  ) : (
                    <img src={a.sourceUrl} alt="" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
                  )
                ) : (
                  <div style={{ width: "100%", aspectRatio: "1/1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--dim)" }}>
                    {a.type}
                  </div>
                )}
                <div style={{ fontSize: 10, padding: "2px 6px 4px", color: "var(--dim)", textAlign: "center" }}>
                  {a.sourceType === "ai_generated" ? "AI" : "Загружено"}
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ position: "absolute", top: 2, right: 2, fontSize: 11, padding: "2px 6px", color: "var(--red)", background: "rgba(0,0,0,0.5)" }}
                  onClick={async () => {
                    if (!confirm("Удалить ассет?")) return;
                    await fetch(`/api/assets/${a.id}`, { method: "DELETE" });
                    queryClient.invalidateQueries({ queryKey: ["assets", post.id] });
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Действия — Скачать / Опубликовать */}
      {post.status === "ready" && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">🚀 Публикация</span>
          </div>
          <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={downloadAllAssets} disabled={downloading}>
              {downloading ? "⏳ Скачивание..." : "📥 Скачать всё"}
            </button>
            <span className="text-xs text-dim">Сохранить все изображения для ручной публикации</span>
            <div style={{ flex: 1 }} />
            <button
              className="btn btn-accent"
              onClick={() => {
                const today = new Date().toISOString().split("T")[0];
                updatePost.mutate({ status: "published", scheduledDate: post.scheduledDate || today });
              }}
            >
              🚀 Опубликовать
            </button>
            <span className="text-xs text-dim">Пост появится в ленте подписчиков</span>
          </div>
        </div>
      )}

      {/* Предпросмотр — эмуляция платформы */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">👁 Предпросмотр в {post.platformName || "Instagram"}</span>
          <span className="text-xs text-dim">{contentTypeCode === "carousel" ? "Карусель" : contentTypeCode === "stories" ? "Stories" : contentTypeCode === "reel" ? "Reels" : "Пост"}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
          {(() => {
            const platform = (post.platformType || post.platformName || "").toLowerCase();
            if (platform === "telegram" && contentTypeCode !== "carousel" && contentTypeCode !== "stories" && contentTypeCode !== "reel") {
              return (
                <TelegramPreview
                  imageUrl={selectedImageUrl}
                  caption={caption}
                  displayName={displayName}
                />
              );
            }
            if (platform === "youtube") {
              return (
                <YouTubePreview
                  imageUrl={selectedImageUrl}
                  caption={caption}
                  displayName={displayName}
                />
              );
            }
            if (platform === "vk" && contentTypeCode !== "carousel" && contentTypeCode !== "stories" && contentTypeCode !== "reel") {
              return (
                <VKPreview
                  imageUrl={selectedImageUrl}
                  caption={caption}
                  displayName={displayName}
                />
              );
            }
            if (contentTypeCode === "carousel") {
              return <CarouselPreview slides={carouselSlides} caption={caption} displayName={displayName} />;
            }
            if (contentTypeCode === "stories") {
              return <StoriesPreview cards={storyCards} />;
            }
            if (contentTypeCode === "reel") {
              return <ReelPreview script={reelScript} />;
            }
            return (
              <PostPreview
                imageUrl={selectedImageUrl}
                caption={caption}
                displayName={displayName}
              />
            );
          })()}
        </div>
        {/* Подсказка если данных нет */}
        {contentTypeCode === "carousel" && carouselSlides.length === 0 && (
          <p className="text-xs text-dim" style={{ textAlign: "center" }}>
            Сначала сгенерируйте контент на вкладке «Контент»
          </p>
        )}
        {contentTypeCode === "post" && !caption && (
          <p className="text-xs text-dim" style={{ textAlign: "center" }}>
            Сначала сгенерируйте текст на вкладке «Контент»
          </p>
        )}
      </div>
    </div>
  );
}
