import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  getStatus,
  getSummary,
  askRepoChat,
  getChatStatus,
  type Summary,
  type RAGMessage,
  type RAGSource,
  type RAGStatus,
} from "../api/client";
import { AppShell } from "../components/shell/AppShell";
import { CommandPalette } from "../components/CommandPalette";
import { LoadingState } from "../components/ui/LoadingState";
import { usePolling } from "../hooks/usePolling";
import { useCommandPalette } from "../hooks/useCommandPalette";
import {
  Bot,
  Send,
  Sparkles,
  RotateCcw,
  Code2,
  FileCode,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  ArrowRight,
  Copy,
  Check,
} from "lucide-react";

interface MessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: RAGSource[];
  model?: string;
  timestamp: Date;
}

const DEFAULT_PROMPTS = [
  "How does the repository ingestion and commit parsing pipeline work?",
  "Which files or directories have the highest bus-factor risk?",
  "Explain the core data models and database architecture.",
  "How are pull request reviews and bottleneck graphs computed?",
];

export function ChatPage() {
  const { id } = useParams();
  const repoId = Number(id);
  const palette = useCommandPalette();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [chatStatus, setChatStatus] = useState<RAGStatus | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: status } = usePolling({
    enabled: Number.isFinite(repoId) && repoId > 0,
    intervalMs: 3000,
    fetcher: () => getStatus(repoId),
    shouldStop: (s) => s.status === "complete" || s.status === "failed",
  });

  useEffect(() => {
    if (status?.status === "complete") {
      getSummary(repoId).then(setSummary).catch(() => {});
      getChatStatus(repoId).then(setChatStatus).catch(() => {});
    }
  }, [status?.status, repoId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = useCallback(
    async (textToSend?: string) => {
      const q = (textToSend ?? input).trim();
      if (!q || loading) return;

      setInput("");
      setError(null);

      const userMsg: MessageItem = {
        id: `user-${Date.now()}`,
        role: "user",
        content: q,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      // Build history payload from previous messages
      const historyPayload: RAGMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const response = await askRepoChat(repoId, q, historyPayload);
        const assistantMsg: MessageItem = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: response.answer,
          sources: response.sources,
          model: response.model,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Failed to obtain response from assistant.";
        setError(errMsg);
      } finally {
        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [input, loading, messages, repoId]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([]);
    setError(null);
    setInput("");
  };

  const toggleSourceExpand = (sourceKey: string) => {
    setExpandedSources((prev) => ({
      ...prev,
      [sourceKey]: !prev[sourceKey],
    }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const ready = status?.status === "complete";

  return (
    <>
      <CommandPalette open={palette.open} onClose={palette.close} />
      <AppShell repoId={repoId} summary={summary} status={status} onCommandPalette={palette.show}>
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 28px 48px", display: "flex", flexDirection: "column", minHeight: "calc(100vh - 65px)" }}>
          
          {/* Header Bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(239, 35, 60, 0.14)", border: "1px solid rgba(239, 35, 60, 0.35)", display: "grid", placeItems: "center", color: "var(--color-red)" }}>
                  <Bot size={17} />
                </div>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>
                  GitPulse AI <span style={{ color: "var(--color-red)" }}>Assistant</span>
                </h1>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(255,255,255,0.06)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
                  RAG • Codebase Grounded
                </span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-muted)" }}>
                Ask architectural, logic, and risk questions over this repository. Answers are backed by AST symbols and vector embeddings.
              </p>
            </div>

            {/* Diagnostic Badges & Actions */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {chatStatus && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--color-muted)", background: "var(--color-surface)", border: "1px solid var(--color-border)", padding: "4px 10px", borderRadius: 999 }}>
                  <Cpu size={12} style={{ color: "var(--color-blue)" }} />
                  <span>{chatStatus.llm_model}</span>
                  <span style={{ color: "var(--color-border)" }}>•</span>
                  <Layers size={12} style={{ color: "var(--color-purple)" }} />
                  <span>{chatStatus.total_chunks} Chunks</span>
                </div>
              )}
              {messages.length > 0 && (
                <button
                  onClick={handleClear}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 8, border: "1px solid var(--color-border)", background: "transparent", color: "var(--color-muted)", fontSize: 12, transition: "0.15s" }}
                  title="Clear conversation history"
                >
                  <RotateCcw size={12} />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          {!ready && (
            <div style={{ padding: "40px 0" }}>
              <LoadingState message="Repository analysis is in progress. The AI Assistant will be fully accessible once ingestion is complete." />
            </div>
          )}

          {ready && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              
              {/* Messages Container */}
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20, marginBottom: 20 }}>
                
                {/* Empty State / Prompt Suggestions */}
                {messages.length === 0 && (
                  <div style={{ margin: "auto 0", padding: "36px 24px", textAlign: "center", background: "linear-gradient(145deg, #131111, #0c0a0a)", border: "1px solid var(--color-border)", borderRadius: 16 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(239, 35, 60, 0.12)", border: "1px solid rgba(239, 35, 60, 0.3)", display: "grid", placeItems: "center", margin: "0 auto 16px", color: "var(--color-red)" }}>
                      <Sparkles size={24} />
                    </div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px", fontFamily: "var(--font-display)" }}>
                      Chat with this Codebase
                    </h2>
                    <p style={{ margin: "0 auto 24px", maxWidth: 540, fontSize: 13, color: "var(--color-muted)", lineHeight: 1.5 }}>
                      Ask questions regarding project structure, key algorithms, bug patterns, or file ownership. The assistant searches parsed AST chunks and synthesizes grounded answers.
                    </p>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, maxWidth: 680, margin: "0 auto", textAlign: "left" }}>
                      {DEFAULT_PROMPTS.map((promptText, i) => (
                        <button
                          key={i}
                          onClick={() => handleSend(promptText)}
                          style={{
                            padding: "12px 14px",
                            borderRadius: 10,
                            background: "var(--color-surface)",
                            border: "1px solid var(--color-border)",
                            color: "var(--color-text)",
                            fontSize: 12,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            transition: "all 0.15s ease",
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = "var(--color-red)";
                            e.currentTarget.style.transform = "translateY(-1px)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "var(--color-border)";
                            e.currentTarget.style.transform = "none";
                          }}
                        >
                          <span>{promptText}</span>
                          <ArrowRight size={13} style={{ color: "var(--color-muted)", flexShrink: 0 }} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Message Thread */}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 11,
                        color: "var(--color-muted)",
                        margin: "0 4px",
                      }}
                    >
                      {msg.role === "assistant" ? (
                        <>
                          <Bot size={13} style={{ color: "var(--color-red)" }} />
                          <span style={{ fontWeight: 600, color: "var(--color-text)" }}>GitPulse AI</span>
                          {msg.model && <span style={{ opacity: 0.6 }}>• {msg.model}</span>}
                        </>
                      ) : (
                        <span>You</span>
                      )}
                      <span style={{ opacity: 0.5 }}>
                        {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    <div
                      style={{
                        maxWidth: "85%",
                        padding: msg.role === "user" ? "12px 16px" : "16px 20px",
                        borderRadius: 14,
                        background: msg.role === "user" ? "linear-gradient(135deg, #24191a, #1a1213)" : "linear-gradient(145deg, #161414, #100f0f)",
                        border: msg.role === "user" ? "1px solid rgba(239, 35, 60, 0.4)" : "1px solid var(--color-border)",
                        color: "var(--color-text)",
                        fontSize: 13,
                        lineHeight: 1.6,
                        boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
                        position: "relative",
                      }}
                    >
                      {/* Render text with pre-wrap for formatted markdown output */}
                      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {msg.content}
                      </div>

                      {/* Copy action for assistant response */}
                      {msg.role === "assistant" && (
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                          <button
                            onClick={() => copyToClipboard(msg.content, msg.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                              background: "none",
                              border: "none",
                              color: "var(--color-muted)",
                              fontSize: 11,
                              cursor: "pointer",
                              padding: "2px 6px",
                            }}
                          >
                            {copiedId === msg.id ? <Check size={12} style={{ color: "var(--color-green)" }} /> : <Copy size={12} />}
                            <span>{copiedId === msg.id ? "Copied" : "Copy response"}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Grounded Code Citations & Sources */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div style={{ maxWidth: "85%", width: "100%", marginTop: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                          <FileCode size={12} style={{ color: "var(--color-purple)" }} />
                          <span>GROUNDED CODE SOURCES ({msg.sources.length})</span>
                        </div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {msg.sources.map((src, idx) => {
                            const sourceKey = `${msg.id}-${idx}`;
                            const isExpanded = !!expandedSources[sourceKey];
                            return (
                              <div
                                key={idx}
                                style={{
                                  background: "var(--color-surface)",
                                  border: "1px solid var(--color-border)",
                                  borderRadius: 8,
                                  overflow: "hidden",
                                  fontSize: 12,
                                }}
                              >
                                <div
                                  onClick={() => toggleSourceExpand(sourceKey)}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "8px 12px",
                                    cursor: "pointer",
                                    background: "rgba(255,255,255,0.02)",
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, overflow: "hidden" }}>
                                    <Code2 size={13} style={{ color: "var(--color-blue)", flexShrink: 0 }} />
                                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {src.file_path}
                                    </span>
                                    <span style={{ fontSize: 10, color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>
                                      L{src.start_line}–{src.end_line}
                                    </span>
                                    {src.symbol_name && (
                                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(167, 167, 255, 0.12)", color: "var(--color-blue)", fontWeight: 600 }}>
                                        {src.symbol_name}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: src.similarity >= 0.8 ? "var(--color-green)" : "var(--color-muted)", fontFamily: "var(--font-mono)" }}>
                                      {Math.round(src.similarity * 100)}% match
                                    </span>
                                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                  </div>
                                </div>

                                {isExpanded && (
                                  <div style={{ padding: "10px 12px", borderTop: "1px solid var(--color-border)", background: "#0a0909" }}>
                                    <pre style={{ margin: 0, fontSize: 11, fontFamily: "var(--font-mono)", color: "#e0dcdc", overflowX: "auto", whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
                                      {src.snippet}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Loading indicator */}
                {loading && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderRadius: 12, background: "var(--color-surface)", border: "1px solid var(--color-border)", width: "fit-content", color: "var(--color-muted)", fontSize: 12 }}>
                    <Bot size={15} style={{ color: "var(--color-red)", animation: "spin 2s linear infinite" }} />
                    <span>Searching AST code chunks and synthesizing response...</span>
                  </div>
                )}

                {error && (
                  <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(239, 35, 60, 0.1)", border: "1px solid rgba(239, 35, 60, 0.3)", color: "#ff8492", fontSize: 12 }}>
                    <strong>Error:</strong> {error}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input Form Bar */}
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 14,
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 12,
                }}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about this repository (e.g., 'How is authentication implemented?', 'Where is the bus factor calculated?')..."
                  disabled={loading}
                  rows={2}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--color-text)",
                    fontSize: 13,
                    fontFamily: "var(--font-sans)",
                    resize: "none",
                    lineHeight: 1.5,
                  }}
                />

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    onClick={() => handleSend()}
                    disabled={loading || !input.trim()}
                    style={{
                      height: 38,
                      padding: "0 16px",
                      borderRadius: 9,
                      background: input.trim() && !loading ? "var(--color-red)" : "rgba(255,255,255,0.08)",
                      border: "none",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      cursor: input.trim() && !loading ? "pointer" : "default",
                      transition: "0.15s ease",
                    }}
                  >
                    <span>Send</span>
                    <Send size={13} />
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "8px 6px 0", fontSize: 11, color: "var(--color-muted)" }}>
                <span>Press <strong>Enter</strong> to submit, <strong>Shift+Enter</strong> for newline</span>
                <span>Grounding: Tree-sitter AST & Vector Embeddings</span>
              </div>
            </div>
          )}

        </div>
      </AppShell>
    </>
  );
}
