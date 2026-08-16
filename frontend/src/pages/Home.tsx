import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createRepository } from "../api/client";
import { GitGraph, Code2, Sparkles, ArrowRight, Search } from "lucide-react";

const PILLARS = [
  {
    icon: <GitGraph size={20} />,
    title: "Graph",
    items: ["Commit DAG animation", "Branch visualization", "Merge tracking", "Contributor network"],
    color: "var(--color-green)",
  },
  {
    icon: <Code2 size={20} />,
    title: "Code",
    items: ["Source explorer", "AST symbols", "Dependency imports", "Code metrics"],
    color: "var(--color-blue)",
  },
  {
    icon: <Sparkles size={20} />,
    title: "Intelligence",
    items: ["Semantic search", "Bus factor risk", "Review bottlenecks", "Ownership analysis"],
    color: "var(--color-purple)",
  },
];

const GITHUB_RE = /^(https?:\/\/)?(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/i;

export function Home() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("https://github.com/pallets/click");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!GITHUB_RE.test(trimmed.replace(/\.git$/, ""))) {
      setError("Enter a valid public GitHub URL (github.com/owner/repo).");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const repo = await createRepository(trimmed);
      navigate(`/repo/${repo.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start ingestion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Topbar */}
      <header
        style={{
          height: 48,
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          gap: "12px",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: "15px",
            color: "var(--color-green)",
            letterSpacing: "-0.02em",
            fontFamily: "var(--font-display)",
          }}
        >
          GitPulse
        </span>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--color-muted)",
            letterSpacing: "0.08em",
          }}
        >
          v1 · public repos
        </span>
      </header>

      {/* Hero */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px 64px" }}>
        <div style={{ maxWidth: 720, width: "100%", textAlign: "center" }} className="animate-fade-up">

          {/* Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(63,185,80,0.1)",
              border: "1px solid rgba(63,185,80,0.3)",
              borderRadius: "20px",
              padding: "4px 12px",
              fontSize: "12px",
              color: "var(--color-green)",
              marginBottom: "24px",
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--color-green)",
              }}
              className="animate-pulse-soft"
            />
            AI-powered Software Engineering Intelligence
          </div>

          <h1
            style={{
              fontSize: "clamp(36px, 6vw, 64px)",
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
              margin: "0 0 20px",
              fontFamily: "var(--font-display)",
              color: "var(--color-text)",
            }}
          >
            GitHub Collaboration
            <br />
            <span style={{ color: "var(--color-green)" }}>Visualized</span>
          </h1>

          <p
            style={{
              fontSize: "16px",
              color: "var(--color-muted)",
              maxWidth: "540px",
              margin: "0 auto 40px",
              lineHeight: 1.6,
            }}
          >
            Commit DAG · Branch evolution · Contributor networks · Bus factor risk ·
            AST analysis · Semantic code search. One platform.
          </p>

          {/* Input form */}
          <form
            onSubmit={handleSubmit}
            style={{
              display: "flex",
              gap: "8px",
              maxWidth: 520,
              margin: "0 auto",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                flex: 1,
                minWidth: 280,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                padding: "0 12px",
                transition: "border-color 0.15s",
              }}
              onFocusCapture={(e) => (e.currentTarget.style.borderColor = "var(--color-green)")}
              onBlurCapture={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
            >
              <Search size={14} style={{ color: "var(--color-muted)", flexShrink: 0 }} />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                disabled={loading}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--color-text)",
                  fontSize: "13px",
                  fontFamily: "var(--font-mono)",
                  padding: "12px 0",
                }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "var(--color-green)",
                border: "none",
                borderRadius: "8px",
                padding: "12px 20px",
                color: "#0d1117",
                fontWeight: 700,
                fontSize: "13px",
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.7 : 1,
                transition: "opacity 0.15s, background 0.15s",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "var(--color-green-dim, #238636)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--color-green)";
              }}
            >
              {loading ? "Starting…" : <>Analyze <ArrowRight size={14} /></>}
            </button>
          </form>

          {error && (
            <p
              style={{
                color: "var(--color-red)",
                fontSize: "13px",
                marginTop: "10px",
              }}
            >
              {error}
            </p>
          )}
        </div>

        {/* Feature pillars */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
            maxWidth: 780,
            width: "100%",
            marginTop: "64px",
          }}
        >
          {PILLARS.map((pillar, i) => (
            <div
              key={pillar.title}
              className="animate-fade-up"
              style={{
                animationDelay: `${i * 0.1}s`,
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "10px",
                padding: "20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "14px",
                  color: pillar.color,
                }}
              >
                {pillar.icon}
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: "14px",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  {pillar.title}
                </span>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
                {pillar.items.map((item) => (
                  <li
                    key={item}
                    style={{
                      fontSize: "13px",
                      color: "var(--color-muted)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span style={{ color: pillar.color, fontSize: "10px" }}>▸</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
