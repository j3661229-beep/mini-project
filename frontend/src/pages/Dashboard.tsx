import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getAllCommits,
  getHeatmap,
  getOwnership,
  getReviews,
  getStatus,
  getSummary,
  type Commit,
  type FileOwnership,
  type HeatmapResponse,
  type ReviewGraph,
  type Summary,
} from "../api/client";
import { AppShell } from "../components/shell/AppShell";
import { CommandPalette } from "../components/CommandPalette";
import { MetricCard } from "../components/ui/MetricCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import { LoadingState } from "../components/ui/LoadingState";
import { ErrorState } from "../components/ui/ErrorState";
import { CommitGraph } from "../components/CommitGraph";
import { BranchTimeline } from "../components/BranchTimeline";
import { usePolling } from "../hooks/usePolling";
import { useCommandPalette } from "../hooks/useCommandPalette";
import { GitGraph, Users, Eye, ShieldAlert, ArrowRight } from "lucide-react";

interface DashboardProps {
  section?: string;
}

export function Dashboard({ section }: DashboardProps) {
  const { id } = useParams();
  const repoId = Number(id);
  const palette = useCommandPalette();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [_ownership, _setOwnership] = useState<FileOwnership[]>([]);
  const [_reviews, _setReviews] = useState<ReviewGraph | null>(null);
  const [_heatmap, _setHeatmap] = useState<HeatmapResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);

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
    setLoadingData(true);
    setLoadError(null);
    (async () => {
      try {
        const [sum, allCommits, own, rev, heat] = await Promise.all([
          getSummary(repoId),
          getAllCommits(repoId),
          getOwnership(repoId),
          getReviews(repoId),
          getHeatmap(repoId),
        ]);
        if (cancelled) return;
        setSummary(sum);
        setCommits(allCommits);
        _setOwnership(own);
        _setReviews(rev);
        _setHeatmap(heat);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ready, repoId]);

  const syncStatus =
    status?.status === "complete" ? "success" :
    status?.status === "processing" || status?.status === "pending" ? "processing" :
    status?.status === "failed" ? "error" : "neutral";

  return (
    <>
      <CommandPalette open={palette.open} onClose={palette.close} />
      <AppShell
        repoId={repoId}
        summary={summary}
        status={status}
        onCommandPalette={palette.show}
      >
        <div style={{ padding: "28px 32px", maxWidth: 1100 }}>

          {/* ── Ingestion progress ── */}
          {!ready && status?.status !== "failed" && (
            <IngestionProgress status={status?.status ?? "pending"} />
          )}

          {status?.status === "failed" && (
            <div style={{ marginBottom: "24px" }}>
              <ErrorState
                message={status.error_message ?? "Repository ingestion failed."}
                onRetry={() => window.location.reload()}
              />
            </div>
          )}

          {/* ── Header ── */}
          {summary && (
            <div style={{ marginBottom: "32px" }} className="animate-fade-up">
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
                <h1
                  style={{
                    margin: 0,
                    fontSize: "22px",
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    fontFamily: "var(--font-display)",
                    color: "var(--color-text)",
                  }}
                >
                  {summary.owner}/
                  <span style={{ color: "var(--color-green)" }}>{summary.name}</span>
                </h1>
                <StatusBadge
                  variant={syncStatus}
                  label={
                    status?.status === "complete" ? "Synced" :
                    status?.status === "processing" ? "Syncing" :
                    status?.status === "pending" ? "Queued" : "Failed"
                  }
                />
                {summary.commit_cap_reached && (
                  <StatusBadge variant="warning" label="Partial (capped)" />
                )}
              </div>
              <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "13px" }}>
                Last analysis:{" "}
                {summary.last_ingested_at
                  ? new Date(summary.last_ingested_at).toLocaleString()
                  : "—"}
              </p>
            </div>
          )}

          {/* ── Metrics row ── */}
          {summary && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "24px",
                marginBottom: "36px",
                padding: "24px",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "10px",
              }}
              className="animate-fade-up"
            >
              <MetricCard label="Commits" value={summary.commit_count} accent="default" />
              <MetricCard label="Contributors" value={summary.contributor_count} accent="blue" />
              <MetricCard label="Pull Requests" value={summary.pr_count} accent="default" />
              <MetricCard
                label="At-Risk Files"
                value={summary.at_risk_file_count}
                accent={summary.at_risk_file_count > 0 ? "red" : "default"}
                sub={summary.at_risk_file_count > 0 ? "⚠ bus factor risk" : undefined}
              />
              <MetricCard
                label="Bottlenecks"
                value={summary.bottleneck_count}
                accent={summary.bottleneck_count > 0 ? "yellow" : "default"}
              />
            </div>
          )}

          {/* ── Loading ── */}
          {ready && loadingData && (
            <LoadingState message="Loading visualization data…" />
          )}

          {loadError && <ErrorState message={loadError} />}

          {/* ── Visualizations ── */}
          {ready && summary && !loadingData && (
            <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
              {/* Commit Graph */}
              <CommitGraph commits={commits} />

              {/* Branch Timeline */}
              {(section === "branches" || !section) && (
                <BranchTimeline commits={commits} />
              )}

              {/* Quick nav to other sections */}
              <QuickNav repoId={repoId} summary={summary} />
            </div>
          )}
        </div>
      </AppShell>
    </>
  );
}

function IngestionProgress({ status }: { status: string }) {
  const stages = [
    { label: "Cloning repository", key: "cloning" },
    { label: "Parsing commits", key: "commits" },
    { label: "Pull requests & reviews", key: "prs" },
    { label: "Source extraction", key: "source" },
    { label: "AST analysis", key: "ast" },
    { label: "Semantic indexing", key: "semantic" },
  ];

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "10px",
        padding: "24px",
        marginBottom: "24px",
      }}
      className="animate-fade-up"
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "var(--color-yellow)",
          }}
          className="animate-pulse-soft"
        />
        <span style={{ fontWeight: 600, color: "var(--color-text)" }}>
          {status === "pending" ? "Analysis queued" : "Analyzing repository…"}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {stages.map((stage, i) => (
          <div key={stage.key} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: i === 0 ? "var(--color-green)" : "var(--color-border)",
                border: i === 1 ? "2px solid var(--color-yellow)" : "none",
                flexShrink: 0,
              }}
              className={i === 1 ? "animate-pulse-soft" : ""}
            />
            <span
              style={{
                fontSize: "13px",
                color: i === 0 ? "var(--color-green)" : i === 1 ? "var(--color-text)" : "var(--color-muted)",
              }}
            >
              {stage.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickNav({ repoId, summary }: { repoId: number; summary: Summary }) {
  const sections = [
    {
      to: `/repo/${repoId}/collaboration`,
      icon: <Users size={18} />,
      label: "Collaboration",
      desc: `${summary.bottleneck_count} bottleneck${summary.bottleneck_count !== 1 ? "s" : ""}`,
      accent: "var(--color-blue)",
    },
    {
      to: `/repo/${repoId}/code`,
      icon: <GitGraph size={18} />,
      label: "Code Explorer",
      desc: "Browse source files",
      accent: "var(--color-green)",
    },
    {
      to: `/repo/${repoId}/search`,
      icon: <Eye size={18} />,
      label: "Semantic Search",
      desc: "Search code by meaning",
      accent: "var(--color-purple)",
    },
    {
      to: `/repo/${repoId}/intelligence`,
      icon: <ShieldAlert size={18} />,
      label: "Intelligence",
      desc: `${summary.at_risk_file_count} at-risk file${summary.at_risk_file_count !== 1 ? "s" : ""}`,
      accent: summary.at_risk_file_count > 0 ? "var(--color-red)" : "var(--color-yellow)",
    },
  ];

  return (
    <div>
      <h2
        style={{
          margin: "0 0 16px",
          fontSize: "13px",
          fontWeight: 600,
          color: "var(--color-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        Explore
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
        {sections.map((sec) => (
          <Link
            key={sec.to}
            to={sec.to}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              padding: "14px 16px",
              textDecoration: "none",
              color: "var(--color-text)",
              transition: "border-color 0.15s, background 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.borderColor = sec.accent;
              (e.currentTarget as HTMLAnchorElement).style.background = "var(--color-surface-2)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--color-border)";
              (e.currentTarget as HTMLAnchorElement).style.background = "var(--color-surface)";
            }}
          >
            <span style={{ color: sec.accent }}>{sec.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: "13px" }}>{sec.label}</div>
              <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>{sec.desc}</div>
            </div>
            <ArrowRight size={14} style={{ color: "var(--color-muted)", flexShrink: 0 }} />
          </Link>
        ))}
      </div>
    </div>
  );
}
