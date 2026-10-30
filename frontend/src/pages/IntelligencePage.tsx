import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getActivity, getDirectoryOwnership, getDirectoryTree, getOwnership, getReviews, getRiskReportPdfUrl, getRiskReportUrl, getStatus, getSummary,
  type ActivityResponse, type DirectoryOwnership, type DirectoryTreeResponse, type FileOwnership, type ReviewGraph, type Summary,
} from "../api/client";
import { AppShell } from "../components/shell/AppShell";
import { CommandPalette } from "../components/CommandPalette";
import { BusFactorPanel } from "../components/BusFactorPanel";
import { ActivityCalendar } from "../components/ActivityCalendar";
import { DirectoryOwnershipPanel } from "../components/DirectoryOwnershipPanel";
import { CodebaseTreemap } from "../components/CodebaseTreemap";
import { LoadingState } from "../components/ui/LoadingState";
import { ErrorState } from "../components/ui/ErrorState";
import { MetricCard } from "../components/ui/MetricCard";
import { usePolling } from "../hooks/usePolling";
import { useCommandPalette } from "../hooks/useCommandPalette";
import { ShieldAlert, Lock, TrendingUp, Bot } from "lucide-react";

export function IntelligencePage() {
  const { id } = useParams();
  const repoId = Number(id);
  const palette = useCommandPalette();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ownership, setOwnership] = useState<FileOwnership[]>([]);
  const [reviews, setReviews] = useState<ReviewGraph | null>(null);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [directories, setDirectories] = useState<DirectoryOwnership[]>([]);
  const [directoryTree, setDirectoryTree] = useState<DirectoryTreeResponse | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [activityDays, setActivityDays] = useState(365);
  const [activityContributor, setActivityContributor] = useState<string | undefined>();
  const [downloadState, setDownloadState] = useState<"idle" | "downloading" | "success" | "error">("idle");
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
    (async () => {
      try {
        const [sum, own, rev, activityData, directoryData, treeData] = await Promise.all([
          getSummary(repoId), getOwnership(repoId), getReviews(repoId), getActivity(repoId, activityDays, activityContributor), getDirectoryOwnership(repoId), getDirectoryTree(repoId),
        ]);
        if (!cancelled) { setSummary(sum); setOwnership(own); setReviews(rev); setActivity(activityData); setDirectories(directoryData.results); setDirectoryTree(treeData); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ready, repoId, activityDays, activityContributor]);

  const handleTreePathChange = (path: string) => {
    setTreeLoading(true);
    getDirectoryTree(repoId, path)
      .then((res) => setDirectoryTree(res))
      .catch(() => {})
      .finally(() => setTreeLoading(false));
  };

  const bottlenecks = reviews?.nodes.filter((n) => n.is_bottleneck) ?? [];

  return (
    <>
      <CommandPalette open={palette.open} onClose={palette.close} />
      <AppShell repoId={repoId} summary={summary} status={status} onCommandPalette={palette.show}>
        <div style={{ padding: "28px 32px", maxWidth: 1100 }}>
          <div style={{ marginBottom: "28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <ShieldAlert size={18} style={{ color: "var(--color-red)" }} />
              <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0, fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>
                Intelligence
              </h1>
            </div>
            <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "13px" }}>
              Ownership concentration, knowledge risk, and review patterns.
            </p>
            {ready && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                <a href={getRiskReportUrl(repoId)} download style={reportButtonStyle}>Download JSON report</a>
                <button onClick={() => downloadPdf(getRiskReportPdfUrl(repoId), repoId, setDownloadState)} disabled={downloadState === "downloading"} style={reportButtonStyle}>{downloadState === "downloading" ? "Preparing PDF…" : downloadState === "success" ? "PDF downloaded" : "Download PDF report"}</button>
                {downloadState === "error" && <span style={{ color: "var(--color-red)", fontSize: "12px" }}>PDF download failed. Try again.</span>}
              </div>
            )}
          </div>

          {/* Risk metrics */}
          {summary && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "24px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "10px", padding: "20px", marginBottom: "28px" }}>
              <MetricCard
                label="At-Risk Files"
                value={summary.at_risk_file_count}
                accent={summary.at_risk_file_count > 0 ? "red" : "default"}
                sub="Ã¢â€°Â¥80% single-owner churn"
              />
              <MetricCard
                label="Bottleneck Reviewers"
                value={summary.bottleneck_count}
                accent={summary.bottleneck_count > 0 ? "yellow" : "default"}
              />
              <MetricCard label="Contributors" value={summary.contributor_count} accent="blue" />
              <MetricCard label="Total Files" value={ownership.length} accent="default" />
            </div>
          )}

          {loading && <LoadingState message="Loading intelligence dataÃ¢â‚¬Â¦" />}
          {error && <ErrorState message={error} />}

          {!loading && !error && (
            <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
              {/* Bottleneck reviewers list */}
              {bottlenecks.length > 0 && (
                <div className="panel" style={{ padding: "20px" }}>
                  <h2 style={{ margin: "0 0 16px", fontSize: "15px", fontWeight: 600 }}>Review Bottlenecks</h2>
                  {bottlenecks.map((node) => (
                    <div key={node.login} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: "1px solid var(--color-border)" }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--color-yellow)", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", flex: 1 }}>{node.login}</span>
                      <span style={{ fontSize: "12px", color: "var(--color-muted)" }}>
                        {node.in_degree} review{node.in_degree !== 1 ? "s" : ""} given
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {activity && <ActivityCalendar data={activity} onWindowChange={setActivityDays} onContributorChange={setActivityContributor} />}
              {directoryTree && <CodebaseTreemap data={directoryTree} onPathChange={handleTreePathChange} isLoading={treeLoading} />}
              {directories.length > 0 && <DirectoryOwnershipPanel rows={directories} />}
              {/* File ownership */}
              {ownership.length > 0 && (
                <section>
                  <h2 style={{ margin: "0 0 14px", fontSize: "15px", fontWeight: 600 }}>File Ownership Risk</h2>
                  <BusFactorPanel ownership={ownership} />
                </section>
              )}

              {/* Related / upcoming */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                <a
                  href={`/repo/${repoId}/security`}
                  style={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "10px",
                    padding: "20px",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", color: "var(--color-red)" }}>
                    <Lock size={16} />
                    <span style={{ fontWeight: 600, fontSize: "14px" }}>Security Intelligence</span>
                  </div>
                  <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--color-muted)" }}>
                    Secret scanning and risky pattern detection.
                  </p>
                  <span style={{ fontSize: "11px", background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.35)", borderRadius: "20px", padding: "3px 10px", color: "var(--color-green)" }}>
                    Available
                  </span>
                </a>
                <a
                  href={`/repo/${repoId}/risk`}
                  style={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "10px",
                    padding: "20px",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", color: "var(--color-yellow)" }}>
                    <TrendingUp size={16} />
                    <span style={{ fontWeight: 600, fontSize: "14px" }}>Change Risk Prediction</span>
                  </div>
                  <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--color-muted)" }}>
                    Rank files and PRs by predicted change risk.
                  </p>
                  <span style={{ fontSize: "11px", background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.35)", borderRadius: "20px", padding: "3px 10px", color: "var(--color-green)" }}>
                    Available
                  </span>
                </a>
                <div
                  style={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "10px",
                    padding: "20px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", color: "var(--color-purple)" }}>
                    <Bot size={16} />
                    <span style={{ fontWeight: 600, fontSize: "14px" }}>AI PR Reviewer</span>
                  </div>
                  <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--color-muted)" }}>
                    Automated review suggestions on the PRs page.
                  </p>
                  <span style={{ fontSize: "11px", background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: "20px", padding: "3px 10px", color: "var(--color-muted)" }}>
                    See Pull Requests
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </AppShell>
    </>
  );
}

const reportButtonStyle = { padding: "7px 10px", border: "1px solid var(--color-border)", borderRadius: "7px", color: "var(--color-text)", background: "var(--color-surface-2)", fontSize: "12px", textDecoration: "none", cursor: "pointer" } as const;
async function downloadPdf(url: string, repoId: number, setState: (state: "idle" | "downloading" | "success" | "error") => void) { try { setState("downloading"); const response = await fetch(url); if (!response.ok) throw new Error("download failed"); const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(await response.blob()); anchor.download = `gitpulse-risk-report-${repoId}.pdf`; anchor.click(); URL.revokeObjectURL(anchor.href); setState("success"); } catch { setState("error"); } }