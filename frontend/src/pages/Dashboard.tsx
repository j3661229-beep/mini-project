import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getAllCommits,
  getOwnership,
  getReviews,
  getStatus,
  getSummary,
  type Commit,
  type FileOwnership,
  type ReviewGraph,
  type Summary,
} from "../api/client";
import { BranchTimeline } from "../components/BranchTimeline";
import { BusFactorPanel } from "../components/BusFactorPanel";
import { CommitGraph } from "../components/CommitGraph";
import { DashboardSummary } from "../components/DashboardSummary";
import { IngestionStatus } from "../components/IngestionStatus";
import { ReviewBottleneckGraph } from "../components/ReviewBottleneckGraph";
import { usePolling } from "../hooks/usePolling";

export function Dashboard() {
  const { id } = useParams();
  const repoId = Number(id);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [ownership, setOwnership] = useState<FileOwnership[]>([]);
  const [reviews, setReviews] = useState<ReviewGraph | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  const { data: status, error: pollError } = usePolling({
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
        const [sum, allCommits, own, rev] = await Promise.all([
          getSummary(repoId),
          getAllCommits(repoId),
          getOwnership(repoId),
          getReviews(repoId),
        ]);
        if (cancelled) return;
        setSummary(sum);
        setCommits(allCommits);
        setOwnership(own);
        setReviews(rev);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load dashboard data");
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, repoId]);

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-6 py-8">
      <nav className="mb-8 flex items-center justify-between">
        <Link to="/" className="font-display text-lg font-bold text-[var(--color-moss)]">
          GitPulse
        </Link>
        <Link to="/" className="text-sm text-[var(--color-slate)] hover:text-[var(--color-leaf)]">
          Analyze another repo
        </Link>
      </nav>

      {!ready && status?.status !== "failed" && (
        <IngestionStatus status={status} error={pollError} />
      )}

      {status?.status === "failed" && (
        <IngestionStatus status={status} error={pollError} />
      )}

      {ready && loadingData && (
        <p className="animate-pulse-soft text-sm text-[var(--color-slate)]">
          Loading visualization data…
        </p>
      )}

      {loadError && <p className="text-sm text-[var(--color-coral)]">{loadError}</p>}

      {ready && summary && !loadingData && (
        <div className="flex flex-col gap-12">
          <DashboardSummary summary={summary} />
          <CommitGraph commits={commits} />
          <BranchTimeline commits={commits} />
          <div className="grid gap-12 lg:grid-cols-2">
            <BusFactorPanel ownership={ownership} />
            {reviews && <ReviewBottleneckGraph graph={reviews} />}
          </div>
        </div>
      )}
    </div>
  );
}
