import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  semanticSearch, getStatus, getSummary,
  type SemanticResult, type Summary,
} from "../api/client";
import { AppShell } from "../components/shell/AppShell";
import { CommandPalette } from "../components/CommandPalette";
import { LoadingState } from "../components/ui/LoadingState";
import { ErrorState } from "../components/ui/ErrorState";
import { EmptyState } from "../components/ui/EmptyState";
import { usePolling } from "../hooks/usePolling";
import { useCommandPalette } from "../hooks/useCommandPalette";
import { Search, Sparkles } from "lucide-react";

const CHUNK_TYPE_LABELS: Record<string, string> = {
  function: "Function", method: "Method", class_context: "Class",
  file_fallback: "File", commit_message: "Commit", pr_patch: "PR Patch",
};

export function SemanticSearchPage() {
  const { id } = useParams();
  const repoId = Number(id);
  const palette = useCommandPalette();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SemanticResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: status } = usePolling({
    enabled: Number.isFinite(repoId) && repoId > 0,
    intervalMs: 2000,
    fetcher: () => getStatus(repoId),
    shouldStop: (s) => s.status === "complete" || s.status === "failed",
  });

  useEffect(() => {
    if (status?.status === "complete") {
      getSummary(repoId).then(setSummary).catch(() => {});
    }
  }, [status?.status, repoId]);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setSearching(true);
    setHasSearched(true);
    setError(null);
    setExpanded(new Set());
    try {
      const res = await semanticSearch(repoId, q);
      setResults(res.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [repoId]);

  const toggleExpand = (id: number) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  function similarityBar(score: number) {
    const pct = Math.round(score * 100);
    const color = pct >= 80 ? "var(--color-green)" : pct >= 60 ? "var(--color-blue)" : "var(--color-muted)";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ width: 80, height: 4, background: "var(--color-border)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
        </div>
        <span style={{ fontSize: "11px", color, fontWeight: 600, fontFamily: "var(--font-mono)" }}>{pct}%</span>
      </div>
    );
  }

  const ready = status?.status === "complete";

  return (
    <>
      <CommandPalette open={palette.open} onClose={palette.close} />
      <AppShell repoId={repoId} summary={summary} status={status} onCommandPalette={palette.show}>
        <div style={{ padding: "28px 32px", maxWidth: 900 }}>
          {/* Header */}
          <div style={{ marginBottom: "28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <Sparkles size={18} style={{ color: "var(--color-purple)" }} />
              <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0, fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>
                Semantic Code Search
              </h1>
            </div>
            <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "13px" }}>
              Search by meaning using vector embeddings. Find code by describing what it does.
            </p>
          </div>

          {/* Search bar */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleSearch(query); }}
            style={{ marginBottom: "28px" }}
          >
            <div
              style={{
                display: "flex",
                gap: "8px",
              }}
            >
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  padding: "0 14px",
                  transition: "border-color 0.15s",
                }}
                onFocusCapture={(e) => (e.currentTarget.style.borderColor = "var(--color-purple)")}
                onBlurCapture={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
              >
                <Search size={15} style={{ color: "var(--color-muted)", flexShrink: 0 }} />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="What handles authentication? How is the database connected? …"
                  disabled={!ready || searching}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--color-text)",
                    fontSize: "14px",
                    padding: "14px 0",
                    fontFamily: "var(--font-sans)",
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={!ready || !query.trim() || searching}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "var(--color-purple)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "0 20px",
                  color: "white",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                  opacity: !ready || !query.trim() || searching ? 0.5 : 1,
                  flexShrink: 0,
                }}
              >
                <Search size={14} />
                {searching ? "Searching…" : "Search"}
              </button>
            </div>
            {!ready && (
              <p style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--color-muted)" }}>
                Waiting for ingestion to complete before search is available.
              </p>
            )}
          </form>

          {/* Results */}
          {searching && <LoadingState message="Running semantic search…" rows={4} />}
          {error && <ErrorState message={error} />}

          {!searching && hasSearched && results.length === 0 && !error && (
            <EmptyState
              icon={<Search size={28} />}
              title="No relevant code found"
              description={`No code chunks matched "${query}". Try rephrasing or broadening your query.`}
            />
          )}

          {!searching && results.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <div style={{ marginBottom: "14px", fontSize: "13px", color: "var(--color-muted)" }}>
                <span style={{ color: "var(--color-text)", fontWeight: 600 }}>{results.length}</span> results for "{query}"
              </div>
              {results.map((r) => {
                const isExpanded = expanded.has(r.id);
                return (
                  <div
                    key={r.id}
                    style={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      overflow: "hidden",
                      marginBottom: "8px",
                    }}
                  >
                    {/* Result header */}
                    <div style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "8px" }}>
                        <div style={{ minWidth: 0 }}>
                          {r.symbol_name && (
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: "var(--color-blue)", marginBottom: "3px" }}>
                              {r.symbol_name}
                            </div>
                          )}
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--color-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.file_path ?? "—"}
                            {r.start_line != null && r.end_line != null && `:${r.start_line}–${r.end_line}`}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                          <span style={{ fontSize: "10px", background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: "4px", padding: "2px 6px", color: "var(--color-muted)" }}>
                            {CHUNK_TYPE_LABELS[r.chunk_type] ?? r.chunk_type}
                          </span>
                          {similarityBar(r.similarity)}
                        </div>
                      </div>
                      {/* Snippet */}
                      <div
                        style={{
                          background: "var(--color-surface-2)",
                          borderRadius: "6px",
                          padding: "10px 12px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "12px",
                          color: "var(--color-muted)",
                          maxHeight: isExpanded ? "none" : "72px",
                          overflow: isExpanded ? "auto" : "hidden",
                          lineHeight: 1.6,
                          cursor: "pointer",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}
                        onClick={() => toggleExpand(r.id)}
                      >
                        {r.chunk_text_snippet}
                      </div>
                      <button
                        onClick={() => toggleExpand(r.id)}
                        style={{ background: "none", border: "none", color: "var(--color-blue)", fontSize: "11px", cursor: "pointer", padding: "4px 0 0", fontFamily: "var(--font-sans)" }}
                      >
                        {isExpanded ? "Show less" : "Show more"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Not-yet-searched empty state */}
          {!hasSearched && !searching && (
            <EmptyState
              icon={<Sparkles size={28} />}
              title="Search your codebase by meaning"
              description="Ask natural language questions about your code. Powered by vector embeddings."
            />
          )}
        </div>
      </AppShell>
    </>
  );
}
