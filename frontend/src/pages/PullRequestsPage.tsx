import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getPullRequests,
  getStatus,
  getSummary,
  type PullRequestSummary,
  type Summary,
} from "../api/client";
import { AppShell } from "../components/shell/AppShell";
import { CommandPalette } from "../components/CommandPalette";
import { LoadingState } from "../components/ui/LoadingState";
import { ErrorState } from "../components/ui/ErrorState";
import { EmptyState } from "../components/ui/EmptyState";
import { usePolling } from "../hooks/usePolling";
import { useCommandPalette } from "../hooks/useCommandPalette";
import {
  GitPullRequest,
  GitMerge,
  Search,
  CheckCircle2,
  AlertCircle,
  FileCode2,
  Calendar,
  User,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export function PullRequestsPage() {
  const { id } = useParams();
  const repoId = Number(id);
  const navigate = useNavigate();
  const palette = useCommandPalette();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [prs, setPrs] = useState<PullRequestSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

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

    Promise.all([
      getSummary(repoId),
      getPullRequests(repoId, { state: "all" }),
    ])
      .then(([sum, prsRes]) => {
        if (!cancelled) {
          setSummary(sum);
          setPrs(prsRes.results || []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load pull requests");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ready, repoId]);

  // Counts by state
  const counts = useMemo(() => {
    const res = { all: prs.length, open: 0, merged: 0, closed: 0 };
    for (const pr of prs) {
      const st = (pr.state || "").toLowerCase();
      if (st === "open") res.open++;
      else if (st === "merged") res.merged++;
      else if (st === "closed") res.closed++;
    }
    return res;
  }, [prs]);

  // Filtered PR list
  const filteredPrs = useMemo(() => {
    return prs.filter((pr) => {
      if (selectedState !== "all" && pr.state?.toLowerCase() !== selectedState) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesNumber = String(pr.pr_number).includes(query.replace("#", ""));
        const matchesAuthor = pr.author_login?.toLowerCase().includes(query);
        return matchesNumber || matchesAuthor;
      }
      return true;
    });
  }, [prs, selectedState, searchQuery]);

  return (
    <>
      <CommandPalette open={palette.open} onClose={palette.close} />
      <AppShell repoId={repoId} summary={summary} status={status} onCommandPalette={palette.show}>
        <div style={{ padding: "28px 32px", maxWidth: 1100, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "8px",
                    background: "rgba(168, 85, 247, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--color-purple)",
                  }}
                >
                  <GitPullRequest size={20} />
                </div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
                  Pull Requests
                </h1>
                <span
                  style={{
                    background: "var(--color-surface-2)",
                    border: "1px solid var(--color-border)",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--color-muted)",
                  }}
                >
                  {prs.length}
                </span>
              </div>
              <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "13px" }}>
                Inspect pull request code diffs, author ownership risks, and automated code review critique.
              </p>
            </div>
          </div>

          {/* Filter Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              marginBottom: "20px",
              flexWrap: "wrap",
            }}
          >
            {/* State Tabs */}
            <div
              style={{
                display: "inline-flex",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                padding: "3px",
                gap: "2px",
              }}
            >
              {[
                { key: "all", label: "All", count: counts.all },
                { key: "open", label: "Open", count: counts.open, color: "#10b981" },
                { key: "merged", label: "Merged", count: counts.merged, color: "#a855f7" },
                { key: "closed", label: "Closed", count: counts.closed, color: "#6b7280" },
              ].map((tab) => {
                const active = selectedState === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setSelectedState(tab.key)}
                    style={{
                      background: active ? "var(--color-surface-2)" : "transparent",
                      border: "none",
                      borderRadius: "6px",
                      padding: "6px 14px",
                      fontSize: "13px",
                      fontWeight: active ? 600 : 500,
                      color: active ? "var(--color-text)" : "var(--color-muted)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span>{tab.label}</span>
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "1px 6px",
                        borderRadius: "10px",
                        background: active
                          ? tab.color
                            ? `rgba(${tab.color === "#10b981" ? "16,185,129" : tab.color === "#a855f7" ? "168,85,247" : "107,114,128"}, 0.2)`
                            : "var(--color-border)"
                          : "rgba(255,255,255,0.05)",
                        color: active && tab.color ? tab.color : "var(--color-muted)",
                        fontWeight: 600,
                      }}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search Box */}
            <div
              style={{
                position: "relative",
                minWidth: 260,
                flex: "1 1 260px",
                maxWidth: 400,
              }}
            >
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--color-muted)",
                }}
              />
              <input
                type="text"
                placeholder="Filter by #number or author..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "7px 12px 7px 34px",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  color: "var(--color-text)",
                  fontSize: "13px",
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* Main Content Area */}
          {loading && <LoadingState message="Loading pull requests..." />}

          {error && <ErrorState message={error} />}

          {!loading && !error && filteredPrs.length === 0 && (
            <EmptyState
              title={prs.length === 0 ? "No Pull Requests Recorded" : "No Matching Pull Requests"}
              description={
                prs.length === 0
                  ? "This repository has no recorded pull requests. PRs are ingested automatically when configured with a GitHub token."
                  : `No pull requests match the filter '${selectedState}' with query '${searchQuery}'.`
              }
            />
          )}

          {!loading && !error && filteredPrs.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {filteredPrs.map((pr) => {
                const stateLower = (pr.state || "").toLowerCase();
                const isMerged = stateLower === "merged";
                const isOpen = stateLower === "open";

                const stateColor = isMerged ? "#a855f7" : isOpen ? "#10b981" : "#6b7280";

                const stateBg = isMerged
                  ? "rgba(168, 85, 247, 0.12)"
                  : isOpen
                  ? "rgba(16, 185, 129, 0.12)"
                  : "rgba(107, 114, 128, 0.12)";

                return (
                  <div
                    key={pr.id}
                    onClick={() => navigate(`/repo/${repoId}/prs/${pr.pr_number}`)}
                    style={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "10px",
                      padding: "16px 20px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--color-purple)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--color-border)";
                      e.currentTarget.style.transform = "none";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    {/* Left: PR info */}
                    <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1 }}>
                      {/* State Icon badge */}
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "8px",
                          background: stateBg,
                          color: stateColor,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {isMerged ? (
                          <GitMerge size={18} />
                        ) : isOpen ? (
                          <GitPullRequest size={18} />
                        ) : (
                          <AlertCircle size={18} />
                        )}
                      </div>

                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                          <span
                            style={{
                              fontSize: "15px",
                              fontWeight: 700,
                              fontFamily: "var(--font-mono)",
                              color: "var(--color-text)",
                            }}
                          >
                            #{pr.pr_number}
                          </span>
                          <span
                            style={{
                              background: stateBg,
                              color: stateColor,
                              border: `1px solid ${stateColor}33`,
                              padding: "2px 8px",
                              borderRadius: "10px",
                              fontSize: "11px",
                              fontWeight: 600,
                              textTransform: "capitalize",
                            }}
                          >
                            {pr.state}
                          </span>
                          {pr.review_count > 0 && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                background: "rgba(16, 185, 129, 0.1)",
                                color: "#10b981",
                                padding: "2px 8px",
                                borderRadius: "10px",
                                fontSize: "11px",
                                fontWeight: 600,
                              }}
                            >
                              <CheckCircle2 size={12} />
                              {pr.review_count} {pr.review_count === 1 ? "review" : "reviews"}
                            </span>
                          )}
                        </div>

                        {/* Author & Date metadata */}
                        <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "12px", color: "var(--color-muted)" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <User size={13} />
                            <span>@{pr.author_login}</span>
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <Calendar size={13} />
                            <span>
                              {pr.created_at ? new Date(pr.created_at).toLocaleDateString() : "Unknown date"}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Diff Stats */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "16px",
                        fontSize: "12px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          color: "var(--color-muted)",
                        }}
                      >
                        <FileCode2 size={14} />
                        <span>{pr.files_count} files</span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-mono)" }}>
                        <span style={{ color: "var(--color-green)", fontWeight: 600 }}>
                          +{pr.total_additions || 0}
                        </span>
                        <span style={{ color: "var(--color-red)", fontWeight: 600 }}>
                          -{pr.total_deletions || 0}
                        </span>
                      </div>
                    </div>

                    {/* Right: AI review hint & Arrow */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          background: "rgba(168, 85, 247, 0.1)",
                          color: "var(--color-purple)",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontWeight: 600,
                        }}
                      >
                        <Sparkles size={12} />
                        <span>AI Review</span>
                      </div>
                      <ArrowRight size={16} style={{ color: "var(--color-muted)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AppShell>
    </>
  );
}
