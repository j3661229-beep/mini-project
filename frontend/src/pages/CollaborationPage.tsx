import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getOwnership, getReviews, getHeatmap, getStatus, getSummary,
  type FileOwnership, type ReviewGraph, type HeatmapResponse, type Summary,
} from "../api/client";
import { AppShell } from "../components/shell/AppShell";
import { CommandPalette } from "../components/CommandPalette";
import { BusFactorPanel } from "../components/BusFactorPanel";
import { ReviewBottleneckGraph } from "../components/ReviewBottleneckGraph";
import { HeatmapPanel } from "../components/HeatmapPanel";
import { LoadingState } from "../components/ui/LoadingState";
import { ErrorState } from "../components/ui/ErrorState";
import { MetricCard } from "../components/ui/MetricCard";
import { usePolling } from "../hooks/usePolling";
import { useCommandPalette } from "../hooks/useCommandPalette";

export function CollaborationPage() {
  const { id } = useParams();
  const repoId = Number(id);
  const palette = useCommandPalette();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ownership, setOwnership] = useState<FileOwnership[]>([]);
  const [reviews, setReviews] = useState<ReviewGraph | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapResponse | null>(null);
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
        const [sum, own, rev, heat] = await Promise.all([
          getSummary(repoId), getOwnership(repoId), getReviews(repoId), getHeatmap(repoId),
        ]);
        if (!cancelled) { setSummary(sum); setOwnership(own); setReviews(rev); setHeatmap(heat); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load collaboration data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ready, repoId]);

  return (
    <>
      <CommandPalette open={palette.open} onClose={palette.close} />
      <AppShell repoId={repoId} summary={summary} status={status} onCommandPalette={palette.show}>
        <div style={{ padding: "28px 32px", maxWidth: 1100 }}>
          <div style={{ marginBottom: "28px" }}>
            <h1 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 4px", fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>
              Collaboration
            </h1>
            <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "13px" }}>
              Review networks, ownership concentration, and contributor activity.
            </p>
          </div>

          {summary && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "24px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "10px", padding: "20px", marginBottom: "28px" }}>
              <MetricCard label="Contributors" value={summary.contributor_count} accent="blue" />
              <MetricCard label="Pull Requests" value={summary.pr_count} accent="default" />
              <MetricCard label="Bottlenecks" value={summary.bottleneck_count} accent={summary.bottleneck_count > 0 ? "yellow" : "default"} />
              <MetricCard label="At-Risk Files" value={summary.at_risk_file_count} accent={summary.at_risk_file_count > 0 ? "red" : "default"} />
            </div>
          )}

          {loading && <LoadingState message="Loading collaboration data…" />}
          {error && <ErrorState message={error} />}

          {!loading && !error && (
            <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
              {/* Reviewer Network */}
              {reviews && (
                <section>
                  <SectionHeader title="Reviewer Network" desc="Directed reviewer → author edges. Node size = review reliance (in-degree)." />
                  <ReviewBottleneckGraph graph={reviews} />
                </section>
              )}

              {/* Bus Factor */}
              {ownership.length > 0 && (
                <section>
                  <SectionHeader title="File Ownership" desc="Files where one contributor owns ≥80% of churn — single-owner risk." />
                  <BusFactorPanel ownership={ownership} />
                </section>
              )}

              {/* Heatmap */}
              {heatmap && heatmap.files.length > 0 && (
                <section>
                  <SectionHeader title="Contributor Heatmap" desc="File × author churn matrix for the top 50 most active files." />
                  <HeatmapPanel data={heatmap} />
                </section>
              )}
            </div>
          )}
        </div>
      </AppShell>
    </>
  );
}

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 600, color: "var(--color-text)" }}>{title}</h2>
      <p style={{ margin: 0, fontSize: "12px", color: "var(--color-muted)" }}>{desc}</p>
    </div>
  );
}
