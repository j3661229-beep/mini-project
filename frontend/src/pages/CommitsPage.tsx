import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getAllCommits, getStatus, getSummary, type Commit, type Summary } from "../api/client";
import { AppShell } from "../components/shell/AppShell";
import { CommandPalette } from "../components/CommandPalette";
import { CommitGraph } from "../components/CommitGraph";
import { BranchTimeline } from "../components/BranchTimeline";
import { LoadingState } from "../components/ui/LoadingState";
import { ErrorState } from "../components/ui/ErrorState";
import { usePolling } from "../hooks/usePolling";
import { useCommandPalette } from "../hooks/useCommandPalette";

export function CommitsPage() {
  const { id } = useParams();
  const repoId = Number(id);
  const palette = useCommandPalette();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
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
        const [sum, all] = await Promise.all([getSummary(repoId), getAllCommits(repoId)]);
        if (!cancelled) { setSummary(sum); setCommits(all); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
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
          <h1 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 24px", fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>
            Commit History
          </h1>
          {loading && <LoadingState message="Loading commits…" />}
          {error && <ErrorState message={error} />}
          {!loading && !error && commits.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
              <CommitGraph commits={commits} />
              <BranchTimeline commits={commits} />
              {/* Commit log table */}
              <div className="panel" style={{ overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border)", fontSize: "12px", color: "var(--color-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {commits.length} commits
                </div>
                <div style={{ overflowY: "auto", maxHeight: 480 }}>
                  {commits.slice().reverse().map((c) => (
                    <div
                      key={c.hash}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "80px 1fr auto",
                        gap: "12px",
                        padding: "10px 16px",
                        borderBottom: "1px solid var(--color-border)",
                        alignItems: "center",
                        fontSize: "13px",
                      }}
                    >
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--color-blue)" }}>
                        {c.hash.slice(0, 7)}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text)" }}>
                          {c.message.split("\n")[0]}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--color-muted)", marginTop: "2px" }}>
                          {c.author_name}
                        </div>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--color-muted)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                        {new Date(c.committed_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </AppShell>
    </>
  );
}
