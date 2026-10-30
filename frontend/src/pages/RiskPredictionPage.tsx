import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getRiskPrediction,
  getStatus,
  getSummary,
  type RiskPrediction,
  type Summary,
} from "../api/client";
import { AppShell } from "../components/shell/AppShell";
import { CommandPalette } from "../components/CommandPalette";
import { LoadingState } from "../components/ui/LoadingState";
import { ErrorState } from "../components/ui/ErrorState";
import { EmptyState } from "../components/ui/EmptyState";
import { usePolling } from "../hooks/usePolling";
import { useCommandPalette } from "../hooks/useCommandPalette";
import { AlertTriangle, GitPullRequest, TrendingUp } from "lucide-react";

const LEVEL_COLOR: Record<string, string> = {
  critical: "#ef233c",
  high: "#f97316",
  medium: "#eab308",
  low: "#60a5fa",
  info: "var(--color-muted)",
};

function LevelBadge({ level }: { level: string }) {
  const color = LEVEL_COLOR[level] ?? "var(--color-muted)";
  return (
    <span
      style={{
        display: "inline-flex",
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
      {level}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 75 ? LEVEL_COLOR.critical : pct >= 55 ? LEVEL_COLOR.high : pct >= 35 ? LEVEL_COLOR.medium : LEVEL_COLOR.low;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: 72,
          height: 5,
          borderRadius: 999,
          background: "var(--color-border)",
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color }}>{pct}%</span>
    </div>
  );
}

export function RiskPredictionPage() {
  const { id } = useParams();
  const repoId = Number(id);
  const palette = useCommandPalette();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [data, setData] = useState<RiskPrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: status } = usePolling({
    enabled: Number.isFinite(repoId) && repoId > 0,
    intervalMs: 2000,
    fetcher: () => getStatus(repoId),
    shouldStop: (s) => s.status === "complete" || s.status === "failed",
  });

  const ready = status?.status === "complete";

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [sum, risk] = await Promise.all([
          getSummary(repoId),
          getRiskPrediction(repoId),
        ]);
        if (!cancelled) {
          setSummary(sum);
          setData(risk);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load risk prediction");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, repoId]);

  return (
    <>
      <CommandPalette open={palette.open} onClose={palette.close} />
      <AppShell repoId={repoId} summary={summary} status={status} onCommandPalette={palette.show}>
        <div style={{ padding: "28px 32px", maxWidth: 1100 }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <TrendingUp size={18} style={{ color: LEVEL_COLOR.high }} />
              <h1
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  margin: 0,
                  fontFamily: "var(--font-display)",
                  letterSpacing: "-0.02em",
                }}
              >
                Change Risk Prediction
              </h1>
            </div>
            <p style={{ margin: 0, color: "var(--color-muted)", fontSize: 13, maxWidth: 720 }}>
              Interpretable risk scores for files and pull requests based on ownership concentration,
              churn, recent change frequency, security findings, and PR blast radius.
            </p>
          </div>

          {!ready && status?.status !== "failed" && (
            <LoadingState message="Waiting for ingestion…" />
          )}
          {status?.status === "failed" && (
            <ErrorState message={status.error_message || "Ingestion failed"} />
          )}
          {error && <ErrorState message={error} />}
          {ready && loading && <LoadingState message="Scoring change risk…" />}

          {ready && !loading && data && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: 12,
                  marginBottom: 24,
                  padding: 18,
                  borderRadius: 12,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 6 }}>
                    Overall risk
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <LevelBadge level={data.overall_risk_level} />
                    <ScoreBar score={data.overall_risk_score} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Critical files</div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)" }}>
                    {data.summary.critical_files}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--color-muted)" }}>High-risk files</div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)" }}>
                    {data.summary.high_files}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--color-muted)" }}>High-risk PRs</div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)" }}>
                    {data.summary.high_risk_prs}
                  </div>
                </div>
              </div>

              <p
                style={{
                  fontSize: 12,
                  color: "var(--color-muted)",
                  marginBottom: 20,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px dashed var(--color-border)",
                }}
              >
                {data.method}
              </p>

              <section style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 12px" }}>
                  <AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                  Risky files
                </h2>
                {data.risky_files.length === 0 ? (
                  <EmptyState
                    title="No elevated file risk"
                    description="Ownership and security signals look evenly distributed."
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
                    {data.risky_files.slice(0, 40).map((f) => (
                      <div
                        key={f.file_path}
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
                          <LevelBadge level={f.risk_level} />
                          <ScoreBar score={f.risk_score} />
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 12,
                              color: "var(--color-blue, #60a5fa)",
                            }}
                          >
                            {f.file_path}
                          </span>
                        </div>
                        <ul
                          style={{
                            margin: "0 0 0 18px",
                            padding: 0,
                            color: "var(--color-muted)",
                            fontSize: 12,
                          }}
                        >
                          {f.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 12px" }}>
                  <GitPullRequest size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                  Risky pull requests
                </h2>
                {data.risky_pull_requests.length === 0 ? (
                  <EmptyState
                    title="No PR risk data"
                    description="PR file metadata may be unavailable (rate limits) or this repo has no scored PRs yet."
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
                    {data.risky_pull_requests.map((pr) => (
                      <div
                        key={pr.pr_number}
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
                          <LevelBadge level={pr.risk_level} />
                          <ScoreBar score={pr.risk_score} />
                          <Link
                            to={`/repo/${repoId}/prs/${pr.pr_number}`}
                            style={{
                              color: "inherit",
                              fontWeight: 600,
                              fontSize: 13,
                              textDecoration: "none",
                            }}
                          >
                            #{pr.pr_number} · {pr.author_login}
                          </Link>
                          <span style={{ fontSize: 11, color: "var(--color-muted)" }}>
                            {pr.files_changed} files · +{pr.additions}/-{pr.deletions} · {pr.state}
                          </span>
                        </div>
                        <ul
                          style={{
                            margin: "0 0 0 18px",
                            padding: 0,
                            color: "var(--color-muted)",
                            fontSize: 12,
                          }}
                        >
                          {pr.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </AppShell>
    </>
  );
}
