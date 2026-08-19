import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getActivity, getAllCommits, getCodeMetrics, getHeatmap, getOwnership, getReviews, getStatus, getSummary, type ActivityResponse, type CodeMetrics, type Commit, type FileOwnership, type HeatmapResponse, type ReviewGraph, type Summary } from "../api/client";
import { AppShell } from "../components/shell/AppShell";
import { CommandPalette } from "../components/CommandPalette";
import { MetricCard } from "../components/ui/MetricCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import { LoadingState } from "../components/ui/LoadingState";
import { ErrorState } from "../components/ui/ErrorState";
import { CommitGraph } from "../components/CommitGraph";
import { BranchTimeline } from "../components/BranchTimeline";
import { ActivityCalendar } from "../components/ActivityCalendar";
import { HeatmapPanel } from "../components/HeatmapPanel";
import { usePolling } from "../hooks/usePolling";
import { useCommandPalette } from "../hooks/useCommandPalette";
import { FileWarning, Users, Eye, ShieldAlert, ArrowRight, Code2 } from "lucide-react";

interface DashboardProps { section?: string; }

export function Dashboard({ section }: DashboardProps) {
  const { id } = useParams();
  const repoId = Number(id);
  const palette = useCommandPalette();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [ownership, setOwnership] = useState<FileOwnership[]>([]);
  const [_reviews, setReviews] = useState<ReviewGraph | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapResponse | null>(null);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [activityDays, setActivityDays] = useState(365);
  const [activityContributor, setActivityContributor] = useState<string | undefined>();
  const [codeMetrics, setCodeMetrics] = useState<CodeMetrics | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);

  const { data: status } = usePolling({ enabled: Number.isFinite(repoId) && repoId > 0, intervalMs: 2000, fetcher: () => getStatus(repoId), shouldStop: (nextStatus) => nextStatus.status === "complete" || nextStatus.status === "failed" });
  const ready = status?.status === "complete";

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoadingData(true); setLoadError(null);
    Promise.all([getSummary(repoId), getAllCommits(repoId), getOwnership(repoId), getReviews(repoId), getHeatmap(repoId), getCodeMetrics(repoId)])
      .then(([nextSummary, nextCommits, nextOwnership, nextReviews, nextHeatmap, nextCodeMetrics]) => { if (cancelled) return; setSummary(nextSummary); setCommits(nextCommits); setOwnership(nextOwnership); setReviews(nextReviews); setHeatmap(nextHeatmap); setCodeMetrics(nextCodeMetrics); })
      .catch((error: unknown) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "Failed to load repository intelligence."); })
      .finally(() => { if (!cancelled) setLoadingData(false); });
    return () => { cancelled = true; };
  }, [ready, repoId]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoadingActivity(true);
    getActivity(repoId, activityDays, activityContributor)
      .then((nextActivity) => { if (!cancelled) setActivity(nextActivity); })
      .catch((error: unknown) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "Failed to load repository activity."); })
      .finally(() => { if (!cancelled) setLoadingActivity(false); });
    return () => { cancelled = true; };
  }, [ready, repoId, activityDays, activityContributor]);

  const syncStatus = status?.status === "complete" ? "success" : status?.status === "processing" || status?.status === "pending" ? "processing" : status?.status === "failed" ? "error" : "neutral";
  const topContributors = useMemo(() => activity?.contributors.slice(0, 5) ?? [], [activity]);
  const activeFiles = useMemo(() => [...ownership].sort((first, second) => second.total_churn - first.total_churn).slice(0, 5), [ownership]);

  return <><CommandPalette open={palette.open} onClose={palette.close} /><AppShell repoId={repoId} summary={summary} status={status} onCommandPalette={palette.show}><main className="dashboard-workspace">
    {!ready && status?.status !== "failed" && <IngestionProgress status={status?.status ?? "pending"} stage={status?.ingestion_stage ?? "queued"} progress={status?.ingestion_progress} heartbeatAt={status?.ingestion_heartbeat_at} />}
    {status?.status === "failed" && <div className="dashboard-block"><ErrorState message={status.error_message ?? "Repository ingestion failed."} onRetry={() => window.location.reload()} /></div>}
    {summary && <header className="dashboard-title animate-fade-up"><div><div className="dashboard-title__line"><h1>{summary.owner}/<span>{summary.name}</span></h1><StatusBadge variant={syncStatus} label={status?.status === "complete" ? "Synced" : status?.status === "processing" ? "Syncing" : status?.status === "pending" ? "Queued" : "Failed"} />{summary.commit_cap_reached && <StatusBadge variant="warning" label="Partial analysis" />}</div><p>Repository intelligence from recorded Git history and completed analysis.</p></div><small>Last analyzed: {summary.last_ingested_at ? new Date(summary.last_ingested_at).toLocaleString() : "Not available"}</small></header>}
    {summary && <section className="dashboard-kpis animate-fade-up" aria-label="Repository summary"><MetricCard label="Commits" value={summary.commit_count} accent="default" /><MetricCard label="Contributors" value={summary.contributor_count} accent="blue" /><MetricCard label="Pull Requests" value={summary.pr_count} accent="default" /><MetricCard label="At-Risk Files" value={summary.at_risk_file_count} accent={summary.at_risk_file_count ? "red" : "default"} sub={summary.at_risk_file_count ? "Bus-factor risk" : undefined} /><MetricCard label="Bottlenecks" value={summary.bottleneck_count} accent={summary.bottleneck_count ? "yellow" : "default"} />{codeMetrics && codeMetrics.parsed_files > 0 && <MetricCard label="Parsed Files" value={codeMetrics.parsed_files} accent="blue" sub="AST analysis" />}</section>}
    {ready && loadingData && <LoadingState message="Loading repository intelligence" />}{loadError && <div className="dashboard-block"><ErrorState message={loadError} onRetry={() => window.location.reload()} /></div>}
    {ready && summary && !loadingData && !loadError && <div className="dashboard-sections">
      <section className="dashboard-insight-grid"><div className="dashboard-insight-card">{loadingActivity ? <LoadingState message="Preparing activity timeline" /> : activity ? <ActivityCalendar data={activity} onWindowChange={setActivityDays} onContributorChange={setActivityContributor} /> : <div className="panel dashboard-empty-panel">No activity data available yet.</div>}</div>
        <aside className="panel dashboard-insight-card dashboard-insight-card--stack"><DashboardList title="Top contributors" subtitle="By commits in the selected activity window." icon={<Users size={16} />} empty="No contributor activity available.">{topContributors.map((contributor) => <div className="dashboard-list__row" key={contributor.author_name}><span className="dashboard-avatar">{contributor.author_name.slice(0, 2).toUpperCase()}</span><span className="dashboard-list__name">{contributor.author_name}</span><strong>{contributor.commits.toLocaleString()}</strong></div>)}</DashboardList><DashboardList title="Most active files" subtitle="Highest recorded line churn." icon={<FileWarning size={16} />} empty="No file churn data available.">{activeFiles.map((file) => <div className="dashboard-list__row" key={file.file_path} title={file.file_path}><span className={file.bus_factor_risk ? "dashboard-risk-dot dashboard-risk-dot--warning" : "dashboard-risk-dot"} /><span className="dashboard-list__name dashboard-list__name--mono">{file.file_path}</span><strong>{file.total_churn.toLocaleString()}</strong></div>)}</DashboardList></aside>
      </section>
      {heatmap && <HeatmapPanel data={heatmap} ownership={ownership} />}
      <CommitGraph commits={commits} />
      {(section === "branches" || !section) && <BranchTimeline commits={commits} />}
      <QuickNav repoId={repoId} summary={summary} />
    </div>}
  </main></AppShell></>;
}

function DashboardList({ title, subtitle, icon, empty, children }: { title: string; subtitle: string; icon: React.ReactNode; empty: string; children: React.ReactNode[] }) {
  return <section><div className="dashboard-section-heading"><div><span>{title}</span><p>{subtitle}</p></div>{icon}</div>{children.length ? <div className="dashboard-list">{children}</div> : <p className="dashboard-empty">{empty}</p>}</section>;
}

function IngestionProgress({ status, stage, progress, heartbeatAt }: { status: string; stage: string; progress?: { processed?: number; total?: number; detail?: string }; heartbeatAt?: string | null }) {
  const stages = [
    { key: "cloning", label: "Cloning repository", description: "Creating an isolated local copy." },
    { key: "commits", label: "Parsing commit history", description: "Reading commits and file changes." },
    { key: "reviews", label: "Pull requests & reviews", description: "Collecting available collaboration data." },
    { key: "ownership", label: "Ownership analysis", description: "Calculating churn and bus-factor risk." },
    { key: "complete", label: "Analysis complete", description: "Preparing repository intelligence." },
  ];
  const current = Math.max(0, stages.findIndex((item) => item.key === stage));
  const processed = progress?.processed;
  const total = progress?.total;
  const hasMeasuredTotal = typeof processed === "number" && typeof total === "number" && total > 0;
  const percent = hasMeasuredTotal ? Math.min(100, processed / total * 100) : null;
  const heartbeatAge = heartbeatAt ? Math.max(0, Math.floor((Date.now() - new Date(heartbeatAt).getTime()) / 1000)) : null;
  const isSlow = heartbeatAge !== null && heartbeatAge > 60 && status === "processing";
  const heartbeatLabel = heartbeatAge === null ? "Waiting for the first worker update" : heartbeatAge < 60 ? "Last update " + heartbeatAge + "s ago" : "Last update " + Math.floor(heartbeatAge / 60) + "m ago";

  return <section className="analysis-progress animate-fade-up" aria-live="polite">
    <header className="analysis-progress__header"><div><span className="analysis-progress__eyebrow"><i /> LIVE ANALYSIS</span><h2>{status === "pending" ? "Analysis queued" : "Analyzing repository"}</h2><p>{progress?.detail || "Progress reflects completed backend work only."}</p></div><span className="analysis-progress__status">{stage.replaceAll("_", " ")}</span></header>
    <div className="analysis-progress__details"><span>{hasMeasuredTotal ? String(processed) + " / " + String(total) + " processed" : typeof processed === "number" ? String(processed) + " processed" : "Preparing work details"}</span><span className={isSlow ? "analysis-progress__heartbeat analysis-progress__heartbeat--slow" : "analysis-progress__heartbeat"}>{isSlow ? "Analysis is taking longer than expected. " : ""}{heartbeatLabel}</span></div>
    <div className={percent === null ? "analysis-progress__track analysis-progress__track--indeterminate" : "analysis-progress__track"} aria-label={percent === null ? "Processing" : String(Math.round(percent)) + "% complete"}><span style={percent === null ? undefined : { width: String(percent) + "%" }} /></div>
    <ol className="analysis-progress__steps">{stages.map((item, index) => { const state = index < current || status === "complete" ? "complete" : index === current && status === "processing" ? "active" : "pending"; const icon = state === "complete" ? "\u2713" : state === "active" ? "\u25c9" : "\u25cb"; return <li className={"analysis-step analysis-step--" + state} key={item.key}><span className="analysis-step__icon">{icon}</span><div><strong>{item.label}</strong><small>{state === "active" ? (progress?.detail || "Processing now") : state === "complete" ? "Complete" : "Waiting"}</small><p>{item.description}</p></div></li>; })}</ol>
  </section>;
}
function QuickNav({ repoId, summary }: { repoId: number; summary: Summary }) {
  const sections = [
    { to: "/repo/" + repoId + "/collaboration", icon: <Users size={18} />, label: "Collaboration", desc: String(summary.bottleneck_count) + " bottleneck" + (summary.bottleneck_count !== 1 ? "s" : ""), accent: "var(--color-blue)" },
    { to: "/repo/" + repoId + "/code", icon: <Code2 size={18} />, label: "Code Explorer", desc: "Browse source files", accent: "var(--color-green)" },
    { to: "/repo/" + repoId + "/search", icon: <Eye size={18} />, label: "Semantic Search", desc: "Search code by meaning", accent: "var(--color-purple)" },
    { to: "/repo/" + repoId + "/intelligence", icon: <ShieldAlert size={18} />, label: "Intelligence", desc: String(summary.at_risk_file_count) + " at-risk file" + (summary.at_risk_file_count !== 1 ? "s" : ""), accent: summary.at_risk_file_count > 0 ? "var(--color-red)" : "var(--color-yellow)" },
  ];
  return <section><h2 className="dashboard-explore-title">Explore</h2><div className="dashboard-explore-grid">{sections.map((item) => <Link className="dashboard-explore-link" key={item.to} to={item.to} style={{ "--section-accent": item.accent } as React.CSSProperties}><span>{item.icon}</span><div><strong>{item.label}</strong><small>{item.desc}</small></div><ArrowRight size={14} /></Link>)}</div></section>;
}