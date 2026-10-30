import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Search, LayoutDashboard, GitGraph, Eye, Code2, Users, Sparkles, X, Bot, GitPullRequest, Lock } from "lucide-react";


interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const nav = (to: string) => { navigate(to); onClose(); };

  const allItems: CommandItem[] = [
    { id: "home", label: "Home", description: "Analyze a repository", icon: <LayoutDashboard size={14} />, action: () => nav("/") },
    ...(id
      ? [
          { id: "overview", label: "Overview", description: "Dashboard", icon: <LayoutDashboard size={14} />, action: () => nav(`/repo/${id}`) },
          { id: "chat", label: "AI Assistant", description: "Chat with codebase (RAG)", icon: <Bot size={14} />, action: () => nav(`/repo/${id}/chat`) },
          { id: "commits", label: "Commits", description: "Commit history & DAG", icon: <GitGraph size={14} />, action: () => nav(`/repo/${id}/commits`) },
          { id: "prs", label: "Pull Requests", description: "Pull requests & automated AI diff reviews", icon: <GitPullRequest size={14} />, action: () => nav(`/repo/${id}/prs`) },
          { id: "collaboration", label: "Collaboration", description: "Reviews & contributor graph", icon: <Eye size={14} />, action: () => nav(`/repo/${id}/collaboration`) },

          { id: "code", label: "Code Explorer", description: "Browse source files", icon: <Code2 size={14} />, action: () => nav(`/repo/${id}/code`) },
          { id: "symbols", label: "Symbols", description: "AST classes, functions & methods", icon: <Sparkles size={14} />, action: () => nav(`/repo/${id}/symbols`) },
          { id: "search", label: "Semantic Search", description: "AI-powered code search", icon: <Sparkles size={14} />, action: () => nav(`/repo/${id}/search`) },
          { id: "security", label: "Security", description: "Secrets & risky pattern scan", icon: <Lock size={14} />, action: () => nav(`/repo/${id}/security`) },
          { id: "intelligence", label: "Intelligence", description: "Ownership & risk analysis", icon: <Users size={14} />, action: () => nav(`/repo/${id}/intelligence`) },
        ]
      : []),
  ];

  const filtered = query.trim()
    ? allItems.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          (item.description?.toLowerCase().includes(query.toLowerCase()) ?? false)
      )
    : allItems;

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, filtered.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
      if (e.key === "Enter")     { e.preventDefault(); filtered[selected]?.action(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, selected]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "15vh",
      }}
      className="animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 90vw)",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "10px",
          boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
        className="animate-scale-in"
      >
        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "12px 16px",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <Search size={16} style={{ color: "var(--color-muted)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, actions…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--color-text)",
              fontSize: "14px",
              fontFamily: "var(--font-sans)",
            }}
          />
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--color-muted)", cursor: "pointer", padding: 0 }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div style={{ maxHeight: "340px", overflowY: "auto" }}>
          {filtered.length === 0 && (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--color-muted)", fontSize: "13px" }}>
              No results for "{query}"
            </div>
          )}
          {filtered.map((item, i) => (
            <button
              key={item.id}
              onClick={item.action}
              onMouseEnter={() => setSelected(i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                padding: "10px 16px",
                background: i === selected ? "rgba(88,166,255,0.08)" : "transparent",
                border: "none",
                borderLeft: i === selected ? "2px solid var(--color-blue)" : "2px solid transparent",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span style={{ color: i === selected ? "var(--color-blue)" : "var(--color-muted)", flexShrink: 0 }}>
                {item.icon}
              </span>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text)" }}>{item.label}</div>
                {item.description && (
                  <div style={{ fontSize: "11px", color: "var(--color-muted)" }}>{item.description}</div>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            gap: "16px",
            fontSize: "11px",
            color: "var(--color-muted)",
          }}
        >
          {[["↑↓", "navigate"], ["↵", "select"], ["Esc", "close"]].map(([key, label]) => (
            <span key={key} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <kbd
                style={{
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "3px",
                  padding: "1px 5px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                }}
              >
                {key}
              </kbd>
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
