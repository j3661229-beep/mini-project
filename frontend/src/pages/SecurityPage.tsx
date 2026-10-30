import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { useParams } from "react-router-dom";
import {
  getSecurity,
  getStatus,
  getSummary,
  refreshSecurity,
  type SecurityFinding,
  type SecurityResponse,
  type Summary,
} from "../api/client";
import { AppShell } from "../components/shell/AppShell";
import { CommandPalette } from "../components/CommandPalette";
import { LoadingState } from "../components/ui/LoadingState";
import { ErrorState } from "../components/ui/ErrorState";
import { EmptyState } from "../components/ui/EmptyState";
import { usePolling } from "../hooks/usePolling";
import { useCommandPalette } from "../hooks/useCommandPalette";
import { KeyRound, Lock, RefreshCw, Search, ShieldAlert, Siren } from "lucide-react";

type SeverityFilter = "all" | "critical" | "high" | "medium" | "low" | "info";
type CategoryFilter = "all" | "secret" | "vulnerability" | "misconfig";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#ef233c",
  high: "#f97316",
  medium: "#eab308",
  low: "#60a5fa",
  info: "var(--color-muted)",
};

const CATEGORY_LABEL: Record<string, string> = {
  secret: "Secret",
  vulnerability: "Vulnerability",
  misconfig: "Misconfig",
};

function SeverityBadge({ severity }: { severity: string }) {
  const color = SEVERITY_COLOR[severity] ?? "var(--color-muted)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        fontFamily: "var(--font-mono)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        color,
        background: `${color}22`,
        border: `1px solid ${color}55`,
      }}
    >
      {severity}
    </span>
  );
}

export function SecurityPage() {
  const { id } = useParams();
  const repoId = Number(id);
  const palette = useCommandPalette();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [data, setData] = useState<SecurityResponse | null>(null);
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: status } = usePolling({
    enabled: Number.isFinite(repoId) && repoId > 0,
    intervalMs: 2000,
    fetcher: () => getStatus(repoId),
    shouldStop: (s) => s.status === "complete" || s.status === "failed",
  });

  const ready = status?.status === "complete";

  const load = useCallback(async () => {
    const [sum, sec] = await Promise.all([
      getSummary(repoId),
      getSecurity(repoId, {
        severity: severity === "all" ? undefined : severity,
        category: category === "all" ? undefined : category,
        q: activeQuery || undefined,
      }),
    ]);
    setSummary(sum);
    setData(sec);
  }, [repoId, severity, category, activeQuery]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        await load();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load security findings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, load]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setActiveQuery(query.trim());
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await refreshSecurity(repoId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rescan failed");
    } finally {
      setRefreshing(false);
    }
  };

  const cards = useMemo(() => {
    const s = data?.summary;
    return [
      {
        label: "Critical",
        value: s?.by_severity.critical ?? 0,
        color: SEVERITY_COLOR.critical,
        filter: "critical" as SeverityFilter,
      },
      {
        label: "High",
        value: s?.by_severity.high ?? 0,
        color: SEVERITY_COLOR.high,
        filter: "high" as SeverityFilter,
      },
      {
        label: "Secrets",
        value: s?.by_category.secret ?? 0,
        color: "#a78bfa",
        filterCat: "secret" as CategoryFilter,
      },
      {
        label: "Files affected",
        value: s?.files_affected ?? 0,
        color: "var(--color-muted)",
      },
    ];
  }, [data]);

  const findings: SecurityFinding[] = data?.findings ?? [];

  return (
    <>
      <CommandPalette open={palette.open} onClose={palette.close} />
      <AppShell repoId={repoId} summary={summary} status={status} onCommandPalette={palette.show}>
        <div style={{ padding: "28px 32px", maxWidth: 1100 }}>
          <div
            style={{
              marginBottom: 24,
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
              alignItems: "flex-start",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Lock size={18} style={{ color: "var(--color-red)" }} />
                <h1
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    margin: 0,
                    fontFamily: "var(--font-display)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  Security Intelligence
                </h1>
              </div>
              <p style={{ margin: 0, color: "var(--color-muted)", fontSize: 13 }}>
                Static secret scanning and risky-pattern detection over ingested source files.
              </p>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={!ready || refreshing}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface-2)",
                color: "inherit",
                fontSize: 12,
                fontWeight: 600,
                cursor: refreshing ? "wait" : "pointer",
                opacity: !ready || refreshing ? 0.7 : 1,
              }}
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : undefined} />
              {refreshing ? "Scanning…" : "Rescan"}
            </button>
          </div>

          {!ready && status?.status !== "failed" && (
            <LoadingState message="Waiting for ingestion…" />
          )}
          {status?.status === "failed" && (
            <ErrorState message={status.error_message || "Ingestion failed"} />
          )}
          {error && <ErrorState message={error} />}
          {ready && loading && <LoadingState message="Loading security findings…" />}

          {ready && !loading && data && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 12,
                  marginBottom: 24,
                }}
              >
                {cards.map((card) => (
                  <button
                    key={card.label}
                    type="button"
                    onClick={() => {
                      if ("filter" in card && card.filter) setSeverity(card.filter);
                      if ("filterCat" in card && card.filterCat) setCategory(card.filterCat);
                    }}
                    style={{
                      textAlign: "left",
                      padding: "14px 16px",
                      borderRadius: 10,
                      border: "1px solid var(--color-border)",
                      background: "var(--color-surface)",
                      cursor: "pointer",
                      color: "inherit",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: card.color,
                        marginBottom: 8,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {card.label === "Secrets" ? <KeyRound size={14} /> : <ShieldAlert size={14} />}
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
                ))}
              </div>

              <form
                onSubmit={onSearch}
                style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}
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
                    placeholder="Search title, file, rule, or evidence…"
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
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as SeverityFilter)}
                  style={selectStyle}
                >
                  <option value="all">All severities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="info">Info</option>
                </select>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CategoryFilter)}
                  style={selectStyle}
                >
                  <option value="all">All categories</option>
                  <option value="secret">Secrets</option>
                  <option value="vulnerability">Vulnerabilities</option>
                  <option value="misconfig">Misconfigs</option>
                </select>
                <button type="submit" style={primaryBtnStyle}>
                  Search
                </button>
              </form>

              {findings.length === 0 ? (
                <EmptyState
                  icon={<Siren size={28} />}
                  title="No security findings"
                  description={
                    activeQuery || severity !== "all" || category !== "all"
                      ? "No findings match the current filters."
                      : "Scanner found no secrets or risky patterns in ingested source files."
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
                  {findings.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        padding: "14px 16px",
                        borderBottom: "1px solid var(--color-border)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          flexWrap: "wrap",
                          alignItems: "center",
                          marginBottom: 6,
                        }}
                      >
                        <SeverityBadge severity={f.severity} />
                        <span
                          style={{
                            fontSize: 11,
                            fontFamily: "var(--font-mono)",
                            color: "var(--color-muted)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          {CATEGORY_LABEL[f.category] ?? f.category}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{f.title}</span>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontFamily: "var(--font-mono)",
                          color: "var(--color-blue, #60a5fa)",
                          marginBottom: 6,
                        }}
                      >
                        {f.file_path}
                        {f.line_number > 0 ? `:${f.line_number}` : ""}
                      </div>
                      <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--color-muted)" }}>
                        {f.description}
                      </p>
                      {f.evidence && (
                        <pre
                          style={{
                            margin: 0,
                            padding: "8px 10px",
                            borderRadius: 8,
                            background: "var(--color-surface-2, rgba(255,255,255,0.04))",
                            border: "1px solid var(--color-border)",
                            fontSize: 11,
                            fontFamily: "var(--font-mono)",
                            overflowX: "auto",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                          }}
                        >
                          {f.evidence}
                        </pre>
                      )}
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 10,
                          color: "var(--color-muted)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {f.rule_id}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </AppShell>
    </>
  );
}

const selectStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "inherit",
  fontSize: 13,
};

const primaryBtnStyle: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: "var(--color-green)",
  color: "#04140c",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};
