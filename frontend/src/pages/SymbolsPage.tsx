import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getCodeMetrics,
  getStatus,
  getSummary,
  getSymbols,
  type CodeMetrics,
  type CodeSymbol,
  type Summary,
} from "../api/client";
import { AppShell } from "../components/shell/AppShell";
import { CommandPalette } from "../components/CommandPalette";
import { LoadingState } from "../components/ui/LoadingState";
import { ErrorState } from "../components/ui/ErrorState";
import { EmptyState } from "../components/ui/EmptyState";
import { usePolling } from "../hooks/usePolling";
import { useCommandPalette } from "../hooks/useCommandPalette";
import { Braces, Box, FunctionSquare, Search, Shapes } from "lucide-react";

type SymbolFilter = "all" | "class" | "function" | "method";

const TYPE_META: Record<string, { label: string; color: string }> = {
  class: { label: "Class", color: "#a78bfa" },
  function: { label: "Function", color: "#34d399" },
  method: { label: "Method", color: "#60a5fa" },
};

function formatLineRange(start: number, end: number) {
  // Guard against corrupt AST ranges (occasional Tree-sitter overflow values).
  const safeEnd = end >= start && end - start < 100_000 ? end : start;
  return safeEnd !== start ? `${start}–${safeEnd}` : `${start}`;
}

function TypeBadge({ type }: { type: string }) {
  const meta = TYPE_META[type] ?? { label: type, color: "var(--color-muted)" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: "var(--font-mono)",
        color: meta.color,
        background: `${meta.color}22`,
        border: `1px solid ${meta.color}44`,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {meta.label}
    </span>
  );
}

export function SymbolsPage() {
  const { id } = useParams();
  const repoId = Number(id);
  const palette = useCommandPalette();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [metrics, setMetrics] = useState<CodeMetrics | null>(null);
  const [symbols, setSymbols] = useState<CodeSymbol[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<SymbolFilter>("all");
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: status } = usePolling({
    enabled: Number.isFinite(repoId) && repoId > 0,
    intervalMs: 2000,
    fetcher: () => getStatus(repoId),
    shouldStop: (s) => s.status === "complete" || s.status === "failed",
  });

  const ready = status?.status === "complete";

  const loadSymbols = useCallback(
    async (opts?: { cursor?: string | null; append?: boolean }) => {
      const type = filter === "all" ? undefined : filter;
      const page = await getSymbols(repoId, {
        cursor: opts?.cursor,
        type,
        q: activeQuery || undefined,
      });
      setSymbols((prev) => (opts?.append ? [...prev, ...page.results] : page.results));
      setNextCursor(
        page.next
          ? new URL(page.next, window.location.origin).searchParams.get("cursor")
          : null
      );
    },
    [repoId, filter, activeQuery]
  );

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const [sum, met] = await Promise.all([
          getSummary(repoId),
          getCodeMetrics(repoId),
        ]);
        if (!cancelled) {
          setSummary(sum);
          setMetrics(met);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load metrics");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, repoId]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        await loadSymbols();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load symbols");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, loadSymbols]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setActiveQuery(query.trim());
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      await loadSymbols({ cursor: nextCursor, append: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  };

  const cards = useMemo(
    () => [
      {
        label: "Classes",
        value: metrics?.total_classes ?? 0,
        icon: <Box size={16} />,
        color: TYPE_META.class.color,
        filter: "class" as SymbolFilter,
      },
      {
        label: "Functions",
        value: metrics?.total_functions ?? 0,
        icon: <FunctionSquare size={16} />,
        color: TYPE_META.function.color,
        filter: "function" as SymbolFilter,
      },
      {
        label: "Methods",
        value: metrics?.total_methods ?? 0,
        icon: <Shapes size={16} />,
        color: TYPE_META.method.color,
        filter: "method" as SymbolFilter,
      },
      {
        label: "Parsed files",
        value: metrics?.parsed_files ?? 0,
        icon: <Braces size={16} />,
        color: "var(--color-muted)",
        filter: "all" as SymbolFilter,
      },
    ],
    [metrics]
  );

  return (
    <>
      <CommandPalette open={palette.open} onClose={palette.close} />
      <AppShell repoId={repoId} summary={summary} status={status} onCommandPalette={palette.show}>
        <div style={{ padding: "28px 32px", maxWidth: 1100 }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Braces size={18} style={{ color: "var(--color-purple)" }} />
              <h1
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  margin: 0,
                  fontFamily: "var(--font-display)",
                  letterSpacing: "-0.02em",
                }}
              >
                Code Symbols
              </h1>
            </div>
            <p style={{ margin: 0, color: "var(--color-muted)", fontSize: 13 }}>
              AST-extracted classes, functions, and methods from parsed source files.
            </p>
          </div>

          {!ready && status?.status !== "failed" && (
            <LoadingState message="Waiting for ingestion…" />
          )}
          {status?.status === "failed" && (
            <ErrorState message={status.error_message || "Ingestion failed"} />
          )}
          {error && <ErrorState message={error} />}
          {ready && loading && <LoadingState message="Loading symbols…" />}

          {ready && !loading && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: 12,
                  marginBottom: 24,
                }}
              >
                {cards.map((card) => {
                  const active = filter === card.filter;
                  return (
                    <button
                      key={card.label}
                      type="button"
                      onClick={() => setFilter(card.filter)}
                      style={{
                        textAlign: "left",
                        padding: "14px 16px",
                        borderRadius: 10,
                        border: `1px solid ${active ? card.color : "var(--color-border)"}`,
                        background: active ? `${card.color}14` : "var(--color-surface)",
                        cursor: "pointer",
                        color: "inherit",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          color: card.color,
                          marginBottom: 8,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {card.icon}
                        {card.label}
                      </div>
                      <div
                        style={{
                          fontSize: 24,
                          fontWeight: 700,
                          fontFamily: "var(--font-display)",
                          letterSpacing: "-0.03em",
                        }}
                      >
                        {card.value.toLocaleString()}
                      </div>
                    </button>
                  );
                })}
              </div>

              <form
                onSubmit={onSearch}
                style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}
              >
                <div
                  style={{
                    flex: 1,
                    minWidth: 220,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0 12px",
                    borderRadius: 8,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-surface)",
                  }}
                >
                  <Search size={14} style={{ color: "var(--color-muted)" }} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name, qualified name, or signature…"
                    style={{
                      flex: 1,
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      color: "inherit",
                      padding: "10px 0",
                      fontSize: 13,
                      fontFamily: "var(--font-mono)",
                    }}
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    padding: "10px 16px",
                    borderRadius: 8,
                    border: "none",
                    background: "var(--color-green)",
                    color: "#04140c",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Search
                </button>
                {(activeQuery || filter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setActiveQuery("");
                      setFilter("all");
                    }}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--color-border)",
                      background: "transparent",
                      color: "var(--color-muted)",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Clear
                  </button>
                )}
              </form>

              {symbols.length === 0 ? (
                <EmptyState
                  title="No symbols found"
                  description={
                    activeQuery || filter !== "all"
                      ? "Try a different filter or search term."
                      : "AST parsing may still be pending, or this repo has no supported source files."
                  }
                />
              ) : (
                <div
                  style={{
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "var(--color-surface)",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "110px 1.2fr 1.6fr 90px",
                      gap: 12,
                      padding: "10px 16px",
                      borderBottom: "1px solid var(--color-border)",
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--color-muted)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    <span>Type</span>
                    <span>Symbol</span>
                    <span>File</span>
                    <span>Lines</span>
                  </div>
                  {symbols.map((sym) => (
                    <div
                      key={sym.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "110px 1.2fr 1.6fr 90px",
                        gap: 12,
                        padding: "12px 16px",
                        borderBottom: "1px solid var(--color-border)",
                        alignItems: "center",
                      }}
                    >
                      <TypeBadge type={sym.symbol_type} />
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            fontFamily: "var(--font-mono)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={sym.qualified_name || sym.name}
                        >
                          {sym.name}
                        </div>
                        {sym.signature && (
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--color-muted)",
                              fontFamily: "var(--font-mono)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              marginTop: 2,
                            }}
                            title={sym.signature}
                          >
                            {sym.signature}
                          </div>
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        {sym.file_id ? (
                          <Link
                            to={`/repo/${repoId}/code`}
                            style={{
                              color: "var(--color-blue, #60a5fa)",
                              textDecoration: "none",
                              fontSize: 12,
                              fontFamily: "var(--font-mono)",
                              display: "block",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={sym.file_path || undefined}
                          >
                            {sym.file_path || "—"}
                          </Link>
                        ) : (
                          <span
                            style={{
                              fontSize: 12,
                              fontFamily: "var(--font-mono)",
                              color: "var(--color-muted)",
                            }}
                          >
                            {sym.file_path || "—"}
                          </span>
                        )}
                        {sym.language && (
                          <div style={{ fontSize: 10, color: "var(--color-muted)", marginTop: 2 }}>
                            {sym.language}
                          </div>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          fontFamily: "var(--font-mono)",
                          color: "var(--color-muted)",
                        }}
                      >
                        {formatLineRange(sym.start_line, sym.end_line)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {nextCursor && (
                <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    style={{
                      padding: "10px 18px",
                      borderRadius: 8,
                      border: "1px solid var(--color-border)",
                      background: "var(--color-surface)",
                      color: "inherit",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: loadingMore ? "wait" : "pointer",
                      opacity: loadingMore ? 0.7 : 1,
                    }}
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </AppShell>
    </>
  );
}
