import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getPullRequestDetail,
  generateAIPRReview,
  getStatus,
  getSummary,
  type PullRequestDetail,
  type Summary,
  type AIPRReviewResponse,
  type PRFile,
} from "../api/client";
import { AppShell } from "../components/shell/AppShell";
import { CommandPalette } from "../components/CommandPalette";
import { LoadingState } from "../components/ui/LoadingState";
import { ErrorState } from "../components/ui/ErrorState";
import { usePolling } from "../hooks/usePolling";
import { useCommandPalette } from "../hooks/useCommandPalette";
import {
  ArrowLeft,
  GitPullRequest,
  GitMerge,
  Sparkles,
  FileCode2,
  ShieldAlert,
  User,
  Calendar,
  ExternalLink,
  Loader2,
  Copy,
  Check,
} from "lucide-react";


export function PullRequestDetailPage() {
  const { id, prNumber } = useParams();
  const repoId = Number(id);
  const prNum = Number(prNumber);
  const navigate = useNavigate();
  const palette = useCommandPalette();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [pr, setPr] = useState<PullRequestDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI Review State
  const [aiReview, setAiReview] = useState<AIPRReviewResponse | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Diff viewer state
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [copiedReview, setCopiedReview] = useState(false);

  const { data: status } = usePolling({
    enabled: Number.isFinite(repoId) && repoId > 0,
    intervalMs: 2000,
    fetcher: () => getStatus(repoId),
    shouldStop: (s) => s.status === "complete" || s.status === "failed",
  });

  const ready = status?.status === "complete";

  useEffect(() => {
    if (!ready || !Number.isFinite(prNum)) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      getSummary(repoId),
      getPullRequestDetail(repoId, prNum),
    ])
      .then(([sum, prDetail]) => {
        if (!cancelled) {
          setSummary(sum);
          setPr(prDetail);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load pull request");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ready, repoId, prNum]);

  const handleGenerateReview = async () => {
    if (!pr) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const res = await generateAIPRReview(repoId, pr.pr_number);
      setAiReview(res);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Failed to generate AI PR review");
    } finally {
      setReviewLoading(false);
    }
  };

  const handleCopyReview = () => {
    if (!aiReview?.review) return;
    navigator.clipboard.writeText(aiReview.review);
    setCopiedReview(true);
    setTimeout(() => setCopiedReview(false), 2000);
  };

  const selectedFile: PRFile | undefined = pr?.files?.[selectedFileIndex];

  // Render colored diff patch lines
  const diffLines = useMemo(() => {
    if (!selectedFile?.patch) return [];
    return selectedFile.patch.split("\n");
  }, [selectedFile]);

  if (loading) {
    return (
      <AppShell repoId={repoId} summary={summary} status={status} onCommandPalette={palette.show}>
        <LoadingState message={`Loading Pull Request #${prNum}...`} />
      </AppShell>
    );
  }

  if (error || !pr) {
    return (
      <AppShell repoId={repoId} summary={summary} status={status} onCommandPalette={palette.show}>
        <div style={{ padding: "32px", maxWidth: 800, margin: "0 auto" }}>
          <button
            onClick={() => navigate(`/repo/${repoId}/prs`)}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-purple)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
              marginBottom: "16px",
              fontSize: "14px",
            }}
          >
            <ArrowLeft size={16} /> Back to Pull Requests
          </button>
          <ErrorState message={error || "Pull request not found"} />
        </div>
      </AppShell>
    );
  }

  const isMerged = pr.state?.toLowerCase() === "merged";
  const isOpen = pr.state?.toLowerCase() === "open";
  const stateColor = isMerged ? "#a855f7" : isOpen ? "#10b981" : "#6b7280";
  const stateBg = isMerged
    ? "rgba(168, 85, 247, 0.12)"
    : isOpen
    ? "rgba(16, 185, 129, 0.12)"
    : "rgba(107, 114, 128, 0.12)";

  return (
    <>
      <CommandPalette open={palette.open} onClose={palette.close} />
      <AppShell repoId={repoId} summary={summary} status={status} onCommandPalette={palette.show}>
        <div style={{ padding: "28px 32px", maxWidth: 1200, margin: "0 auto" }}>
          {/* Breadcrumb Navigation */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <button
              onClick={() => navigate(`/repo/${repoId}/prs`)}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-muted)",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                cursor: "pointer",
                fontSize: "13px",
                padding: "4px 8px",
                borderRadius: "6px",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-muted)")}
            >
              <ArrowLeft size={14} /> Pull Requests
            </button>
            <span style={{ color: "var(--color-border)" }}>/</span>
            <span style={{ fontSize: "13px", color: "var(--color-text)", fontWeight: 600 }}>
              #{pr.pr_number}
            </span>
          </div>

          {/* Top PR Header Card */}
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "12px",
              padding: "24px",
              marginBottom: "24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", flexWrap: "wrap" }}>
                  <span
                    style={{
                      background: stateBg,
                      color: stateColor,
                      border: `1px solid ${stateColor}33`,
                      padding: "4px 12px",
                      borderRadius: "14px",
                      fontSize: "12px",
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      textTransform: "uppercase",
                      letterSpacing: "0.03em",
                    }}
                  >
                    {isMerged ? <GitMerge size={14} /> : <GitPullRequest size={14} />}
                    {pr.state}
                  </span>
                  <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
                    Pull Request #{pr.pr_number}
                  </h1>
                </div>

                {/* Metadata Row */}
                <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "13px", color: "var(--color-muted)", flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <User size={14} />
                    <strong style={{ color: "var(--color-text)" }}>@{pr.author_login}</strong>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Calendar size={14} />
                    Created {new Date(pr.created_at).toLocaleDateString()}
                  </span>
                  {pr.merged_at && (
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#a855f7" }}>
                      <GitMerge size={14} />
                      Merged {new Date(pr.merged_at).toLocaleDateString()}
                    </span>
                  )}
                  {summary?.owner && summary?.name && (
                    <a
                      href={`https://github.com/${summary.owner}/${summary.name}/pull/${pr.pr_number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        color: "var(--color-purple)",
                        textDecoration: "none",
                      }}
                    >
                      <span>View on GitHub</span>
                      <ExternalLink size={12} />
                    </a>
                  )}

                </div>
              </div>

              {/* Action Button: AI Review */}
              <button
                onClick={handleGenerateReview}
                disabled={reviewLoading}
                style={{
                  background: "linear-gradient(135deg, #9333ea, #7928ca)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 18px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: reviewLoading ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  boxShadow: "0 4px 12px rgba(147, 51, 234, 0.25)",
                  transition: "opacity 0.15s ease",
                  opacity: reviewLoading ? 0.7 : 1,
                }}
              >
                {reviewLoading ? (
                  <>
                    <Loader2 size={16} className="spin-icon" style={{ animation: "spin 1s linear infinite" }} />
                    <span>Gemini Reviewing Diff...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Automated AI Review</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Metrics Strip */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "12px",
                marginTop: "20px",
                paddingTop: "20px",
                borderTop: "1px solid var(--color-border)",
              }}
            >
              <div style={{ background: "var(--color-surface-2)", padding: "12px 14px", borderRadius: "8px" }}>
                <div style={{ fontSize: "11px", color: "var(--color-muted)", marginBottom: "4px" }}>FILES CHANGED</div>
                <div style={{ fontSize: "16px", fontWeight: 700 }}>{pr.total_files}</div>
              </div>
              <div style={{ background: "var(--color-surface-2)", padding: "12px 14px", borderRadius: "8px" }}>
                <div style={{ fontSize: "11px", color: "var(--color-muted)", marginBottom: "4px" }}>DIFF VOLUME</div>
                <div style={{ fontSize: "15px", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                  <span style={{ color: "var(--color-green)" }}>+{pr.total_additions}</span>{" "}
                  <span style={{ color: "var(--color-red)" }}>-{pr.total_deletions}</span>
                </div>
              </div>
              <div style={{ background: "var(--color-surface-2)", padding: "12px 14px", borderRadius: "8px" }}>
                <div style={{ fontSize: "11px", color: "var(--color-muted)", marginBottom: "4px" }}>OWNERSHIP RISKS</div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: pr.risk_assessment?.length ? "#f59e0b" : "var(--color-green)" }}>
                  {pr.risk_assessment?.length ? `${pr.risk_assessment.length} files flagged` : "0 (Low Risk)"}
                </div>
              </div>
              <div style={{ background: "var(--color-surface-2)", padding: "12px 14px", borderRadius: "8px" }}>
                <div style={{ fontSize: "11px", color: "var(--color-muted)", marginBottom: "4px" }}>REVIEWERS</div>
                <div style={{ fontSize: "15px", fontWeight: 700 }}>
                  {pr.reviews?.length ? `${pr.reviews.length} completed` : "Pending review"}
                </div>
              </div>
            </div>
          </div>

          {/* AI Review Result Box (if generated) */}
          {(aiReview || reviewLoading || reviewError) && (
            <div
              style={{
                background: "var(--color-surface)",
                border: "1px solid rgba(168, 85, 247, 0.3)",
                borderRadius: "12px",
                padding: "24px",
                marginBottom: "24px",
                boxShadow: "0 6px 20px rgba(168, 85, 247, 0.08)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "8px",
                      background: "rgba(168, 85, 247, 0.15)",
                      color: "var(--color-purple)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>
                      AI Code Review Architecture
                    </h2>
                    <span style={{ fontSize: "12px", color: "var(--color-muted)" }}>
                      Powered by {aiReview?.model || "Google Gemini 2.5 Flash"}
                    </span>
                  </div>
                </div>

                {aiReview && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span
                      style={{
                        padding: "4px 12px",
                        borderRadius: "12px",
                        fontSize: "12px",
                        fontWeight: 700,
                        background:
                          aiReview.verdict === "APPROVE"
                            ? "rgba(16, 185, 129, 0.15)"
                            : aiReview.verdict === "REQUEST_CHANGES"
                            ? "rgba(239, 68, 68, 0.15)"
                            : "rgba(245, 158, 11, 0.15)",
                        color:
                          aiReview.verdict === "APPROVE"
                            ? "#10b981"
                            : aiReview.verdict === "REQUEST_CHANGES"
                            ? "#ef4444"
                            : "#f59e0b",
                        border: `1px solid ${
                          aiReview.verdict === "APPROVE" ? "#10b98133" : "#f59e0b33"
                        }`,
                      }}
                    >
                      Verdict: {aiReview.verdict}
                    </span>

                    <button
                      onClick={handleCopyReview}
                      style={{
                        background: "var(--color-surface-2)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "6px",
                        padding: "6px 10px",
                        color: "var(--color-text)",
                        cursor: "pointer",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      {copiedReview ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                      <span>{copiedReview ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                )}
              </div>

              {reviewLoading && (
                <div style={{ padding: "24px 0", textAlign: "center", color: "var(--color-muted)" }}>
                  <Loader2 size={24} style={{ animation: "spin 1s linear infinite", marginBottom: "8px" }} />
                  <div>Synthesizing code diffs & risk patterns with Google Gemini...</div>
                </div>
              )}

              {reviewError && <ErrorState message={reviewError} />}

              {aiReview && (
                <div
                  style={{
                    background: "var(--color-surface-2)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    padding: "20px",
                    fontSize: "13.5px",
                    lineHeight: 1.65,
                    whiteSpace: "pre-wrap",
                    fontFamily: "var(--font-sans)",
                    color: "var(--color-text)",
                  }}
                >
                  {aiReview.review}
                </div>
              )}
            </div>
          )}

          {/* Ownership Risk Warning Banner (if bus factor flagged) */}
          {pr.risk_assessment && pr.risk_assessment.length > 0 && (
            <div
              style={{
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                borderRadius: "10px",
                padding: "16px 20px",
                marginBottom: "24px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#f59e0b", marginBottom: "8px" }}>
                <ShieldAlert size={18} />
                <strong style={{ fontSize: "14px" }}>High Bus-Factor Ownership Concentration Detected</strong>
              </div>
              <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "var(--color-muted)" }}>
                This pull request modifies files that have single-contributor ownership exceeding 70% of historical churn.
                Ensure changes are approved by primary maintainers:
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {pr.risk_assessment.map((risk, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: "rgba(0,0,0,0.2)",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text)" }}>
                      {risk.file_path}
                    </span>
                    <span style={{ color: "#f59e0b", fontWeight: 600 }}>
                      @{risk.top_contributor} ({Math.round(risk.top_contributor_share * 100)}% share)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Diffs & Changed Files Section */}
          <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* File List Sidebar */}
            <div
              style={{
                width: 320,
                flex: "0 0 320px",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "10px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--color-border)",
                  fontSize: "13px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>Files Changed ({pr.files?.length || 0})</span>
              </div>

              <div style={{ maxHeight: 520, overflowY: "auto" }}>
                {pr.files?.map((file, idx) => {
                  const active = idx === selectedFileIndex;
                  return (
                    <div
                      key={file.id}
                      onClick={() => setSelectedFileIndex(idx)}
                      style={{
                        padding: "10px 14px",
                        cursor: "pointer",
                        background: active ? "var(--color-surface-2)" : "transparent",
                        borderLeft: active ? "3px solid var(--color-purple)" : "3px solid transparent",
                        borderBottom: "1px solid var(--color-border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "8px",
                        fontSize: "12.5px",
                        transition: "background 0.15s ease",
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontWeight: active ? 600 : 400,
                            color: active ? "var(--color-text)" : "var(--color-muted)",
                          }}
                          title={file.file_path}
                        >
                          {file.file_path}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--color-muted)", textTransform: "capitalize" }}>
                          {file.status}
                        </div>
                      </div>

                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", flexShrink: 0 }}>
                        <span style={{ color: "var(--color-green)", marginRight: "4px" }}>+{file.additions}</span>
                        <span style={{ color: "var(--color-red)" }}>-{file.deletions}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Diff Viewer Pane */}
            <div
              style={{
                flex: "1 1 500px",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "10px",
                overflow: "hidden",
                minHeight: 400,
              }}
            >
              {selectedFile ? (
                <>
                  <div
                    style={{
                      padding: "12px 18px",
                      borderBottom: "1px solid var(--color-border)",
                      background: "var(--color-surface-2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <FileCode2 size={16} style={{ color: "var(--color-purple)" }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600 }}>
                        {selectedFile.file_path}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                      <span style={{ color: "var(--color-green)", fontWeight: 600 }}>+{selectedFile.additions}</span>
                      <span style={{ color: "var(--color-red)", fontWeight: 600 }}>-{selectedFile.deletions}</span>
                    </div>
                  </div>

                  {selectedFile.patch ? (
                    <div
                      style={{
                        padding: "12px 0",
                        fontFamily: "var(--font-mono)",
                        fontSize: "12px",
                        lineHeight: 1.5,
                        overflowX: "auto",
                        maxHeight: 600,
                        background: "#0d1117",
                      }}
                    >
                      {diffLines.map((line, idx) => {
                        const isAdd = line.startsWith("+");
                        const isDel = line.startsWith("-");
                        const isChunkHeader = line.startsWith("@@");

                        const bg = isAdd
                          ? "rgba(16, 185, 129, 0.15)"
                          : isDel
                          ? "rgba(239, 68, 68, 0.15)"
                          : isChunkHeader
                          ? "rgba(168, 85, 247, 0.1)"
                          : "transparent";

                        const color = isAdd
                          ? "#34d399"
                          : isDel
                          ? "#f87171"
                          : isChunkHeader
                          ? "#c084fc"
                          : "#d1d5db";

                        return (
                          <div
                            key={idx}
                            style={{
                              background: bg,
                              color: color,
                              padding: "1px 16px",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-all",
                            }}
                          >
                            {line}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ padding: "40px", textAlign: "center", color: "var(--color-muted)", fontSize: "13px" }}>
                      No diff patch stored for this file (file added or binary format).
                    </div>
                  )}
                </>
              ) : (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--color-muted)", fontSize: "13px" }}>
                  Select a changed file to view code diff patches.
                </div>
              )}
            </div>
          </div>
        </div>
      </AppShell>
    </>
  );
}
