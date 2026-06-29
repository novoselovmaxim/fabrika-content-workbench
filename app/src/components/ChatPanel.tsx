import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface ChatPanelProps {
  projectId: string;
  platformId?: string;
  contextStep?: string;
  sessionId?: string;
  forceOpen?: boolean;
  onClose?: () => void;
}

export default function ChatPanel({ projectId, platformId, contextStep, forceOpen, onClose }: ChatPanelProps) {
  const [open, setOpen] = useState(forceOpen ?? false);
  const [input, setInput] = useState("");
  const [localSessionId] = useState(() => crypto.randomUUID());
  const queryClient = useQueryClient();
  const listRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["chat", projectId, localSessionId],
    queryFn: () => {
      return fetch(`/api/chat/project/${projectId}?sessionId=${localSessionId}`).then((r) => r.json());
    },
    enabled: open,
    refetchInterval: 2000,
  });

  const sendMsg = useMutation({
    mutationFn: (text: string) =>
      fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          platformId: platformId || null,
          sessionId: localSessionId,
          content: text,
          contextStep: contextStep || null,
        }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", projectId, localSessionId] });
      setInput("");
    },
  });

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  // Sync internal state when forceOpen changes
  useEffect(() => {
    if (forceOpen !== undefined) setOpen(forceOpen);
  }, [forceOpen]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 9999,
          width: 52, height: 52, borderRadius: 26,
          background: "var(--accent)", border: "none", cursor: "pointer",
          fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 16px rgba(99,102,241,0.4)",
        }}
        title="AI Чат"
      >
        🤖
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed", bottom: 0, right: 0, zIndex: 9999,
        width: 400, height: "100vh",
        background: "var(--bg-card)",
        borderLeft: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.3)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px", borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>🤖 AI Ассистент</span>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
            {contextStep ? `Шаг: ${contextStep}` : "Общий чат"}
          </div>
        </div>
        <button className="btn btn-ghost" onClick={() => { setOpen(false); onClose?.(); }} style={{ fontSize: 18 }}>
          ✕
        </button>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        style={{
          flex: 1, overflowY: "auto", padding: 16,
          display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 13, marginTop: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
            <div>Спросите AI о стратегии, контенте или идеях</div>
            <div style={{ fontSize: 12, marginTop: 8, opacity: 0.6 }}>
              Ответы можно применить к текущему шагу
            </div>
          </div>
        )}
        {messages.map((m: any) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              background: m.role === "user" ? "var(--accent)" : "var(--bg-hover)",
              borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              padding: "10px 14px",
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            <div>{m.content}</div>
            <div
              style={{
                fontSize: 10, color: "var(--text-dim)", marginTop: 4,
                display: "flex", justifyContent: "space-between",
              }}
            >
              <span>{new Date(m.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}</span>
              {m.role === "assistant" && !m.applied && (
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 10, padding: "2px 6px" }}
                  onClick={() => {
                    fetch("/api/chat/apply", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ messageId: m.id, strategyBlockId: m.strategyBlockId || "" }),
                    }).then(async (r) => {
                      if (!r.ok) {
                        const err = await r.json();
                        console.error("[chat/apply] error:", err);
                      }
                    }).catch((err) => console.error("[chat/apply] network error:", err));
                  }}
                >
                  📋 Применить
                </button>
              )}
            </div>
          </div>
        ))}
        {sendMsg.isPending && (
          <div
            style={{
              alignSelf: "flex-start", maxWidth: "85%",
              background: "var(--bg-hover)", borderRadius: "16px 16px 16px 4px",
              padding: "10px 14px", fontSize: 13,
            }}
          >
            <span style={{ opacity: 0.6 }}>AI печатает</span>
            <span style={{ animation: "pulse 1s infinite" }}>...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            placeholder="Напишите сообщение..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && input.trim()) {
                e.preventDefault();
                sendMsg.mutate(input.trim());
              }
            }}
            disabled={sendMsg.isPending}
          />
          <button
            className="btn btn-primary"
            onClick={() => input.trim() && sendMsg.mutate(input.trim())}
            disabled={!input.trim() || sendMsg.isPending}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
