import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  getFiles, getFileDetail, getStatus, getSummary, getCodeMetrics,
  type SourceFile, type SourceFileDetail, type Summary, type CodeMetrics,
} from "../api/client";
import { AppShell } from "../components/shell/AppShell";
import { CommandPalette } from "../components/CommandPalette";
import { LoadingState } from "../components/ui/LoadingState";
import { ErrorState } from "../components/ui/ErrorState";
import { EmptyState } from "../components/ui/EmptyState";
import { usePolling } from "../hooks/usePolling";
import { useCommandPalette } from "../hooks/useCommandPalette";
import { Files, Code2, ChevronRight } from "lucide-react";

const LANG_COLOR: Record<string, string> = {
  python: "#3572A5", javascript: "#f1e05a", typescript: "#2b7489",
  rust: "#dea584", go: "#00ADD8", java: "#b07219", cpp: "#f34b7d",
  c: "#555555", ruby: "#701516", php: "#4F5D95", swift: "#ffac45",
};

function langColor(lang: string) {
  return LANG_COLOR[lang.toLowerCase()] ?? "var(--color-muted)";
}

export function CodeExplorerPage() {
  const { id } = useParams();
  const repoId = Number(id);
  const palette = useCommandPalette();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [metrics, setMetrics] = useState<CodeMetrics | null>(null);
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<SourceFileDetail | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
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
        const [sum, met, page] = await Promise.all([
          getSummary(repoId),
          getCodeMetrics(repoId),
          getFiles(repoId),
        ]);
        if (!cancelled) {
          setSummary(sum);
          setMetrics(met);
          setFiles(page.results);
          setNextCursor(page.next ? new URL(page.next, window.location.origin).searchParams.get("cursor") : null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ready, repoId]);

  const loadMore = async () => {
    if (!nextCursor) return;
    const page = await getFiles(repoId, nextCursor);
    setFiles((f) => [...f, ...page.results]);
    setNextCursor(page.next ? new URL(page.next, window.location.origin).searchParams.get("cursor") : null);
  };

  const selectFile = useCallback(async (file: SourceFile) => {
    if (file.is_binary || file.is_skipped_size) return;
    setFileLoading(true);
    try {
      const detail = await getFileDetail(repoId, file.id);
      setSelectedFile(detail);
    } finally {
      setFileLoading(false);
    }
  }, [repoId]);

  return (
    <>
      <CommandPalette open={palette.open} onClose={palette.close} />
      <AppShell repoId={repoId} summary={summary} status={status} onCommandPalette={palette.show}>
        <div style={{ padding: "28px 32px", maxWidth: 1200 }}>
          <div style={{ marginBottom: "24px" }}>
            <h1 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 4px", fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>
              Code Explorer
            </h1>
            <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "13px" }}>
              Browse source files, view content, and explore code structure.
            </p>
          </div>

          {/* Metrics strip */}
          {metrics && (
            <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "8px", padding: "16px 20px", marginBottom: "24px" }}>
              {[
                ["Lines of Code", metrics.total_loc.toLocaleString()],
                ["Parsed Files", metrics.parsed_files.toLocaleString()],
                ["Classes", metrics.total_classes.toLocaleString()],
                ["Functions", metrics.total_functions.toLocaleString()],
                ["Methods", metrics.total_methods.toLocaleString()],
                ["Imports", metrics.total_imports.toLocaleString()],
              ].map(([label, val]) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-muted)", fontWeight: 500 }}>{label}</span>
                  <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--color-text)", fontFamily: "var(--font-mono)" }}>{val}</span>
                </div>
              ))}
            </div>
          )}

          {loading && <LoadingState message="Loading files…" />}
          {error && <ErrorState message={error} />}

          {!loading && !error && (
            <div style={{ display: "grid", gridTemplateColumns: selectedFile ? "320px 1fr" : "1fr", gap: "16px" }}>
              {/* File list */}
              <div className="panel" style={{ overflow: "hidden", height: "calc(100vh - 260px)", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border)", fontSize: "11px", color: "var(--color-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Files size={12} /> Files ({files.length})
                </div>
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {files.length === 0 && (
                    <EmptyState icon={<Files size={24} />} title="No files indexed" description="Files are extracted during ingestion." />
                  )}
                  {files.map((file) => (
                    <button
                      key={file.id}
                      onClick={() => selectFile(file)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px 14px",
                        background: selectedFile?.id === file.id ? "rgba(88,166,255,0.08)" : "transparent",
                        border: "none",
                        borderLeft: selectedFile?.id === file.id ? "2px solid var(--color-blue)" : "2px solid transparent",
                        borderBottom: "1px solid var(--color-border)",
                        cursor: file.is_binary ? "default" : "pointer",
                        textAlign: "left",
                        opacity: file.is_binary ? 0.5 : 1,
                      }}
                    >
                      {file.language && (
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: langColor(file.language), flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text)" }}>
                          {file.file_path.split("/").pop()}
                        </div>
                        <div style={{ fontSize: "10px", color: "var(--color-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {file.file_path}
                        </div>
                      </div>
                      {file.is_binary && <span style={{ fontSize: "9px", color: "var(--color-muted)" }}>BIN</span>}
                      <ChevronRight size={10} style={{ color: "var(--color-muted)", flexShrink: 0 }} />
                    </button>
                  ))}
                  {nextCursor && (
                    <button
                      onClick={loadMore}
                      style={{ width: "100%", padding: "10px", background: "transparent", border: "none", color: "var(--color-blue)", cursor: "pointer", fontSize: "12px" }}
                    >
                      Load more files…
                    </button>
                  )}
                </div>
              </div>

              {/* Source viewer */}
              {selectedFile && (
                <div className="panel" style={{ overflow: "hidden", height: "calc(100vh - 260px)", display: "flex", flexDirection: "column" }}>
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--color-border)", display: "flex", alignItems: "center", gap: "10px" }}>
                    <Code2 size={13} style={{ color: "var(--color-blue)" }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--color-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selectedFile.file_path}
                    </span>
                    <div style={{ display: "flex", gap: "12px", flexShrink: 0 }}>
                      {selectedFile.language && (
                        <span style={{ fontSize: "11px", color: langColor(selectedFile.language), fontWeight: 500 }}>
                          {selectedFile.language}
                        </span>
                      )}
                      <span style={{ fontSize: "11px", color: "var(--color-muted)" }}>
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  </div>
                  {fileLoading && <LoadingState message="Loading file…" />}
                  {!fileLoading && (
                    <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
                      {selectedFile.content
                        ? selectedFile.content.split("\n").map((line, i) => (
                            <div key={i} className="code-line">
                              <span className="code-line-num">{i + 1}</span>
                              <span className="code-line-text">{line || " "}</span>
                            </div>
                          ))
                        : <EmptyState icon="📄" title="Content not available" description="This file may be binary or too large." />
                      }
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </AppShell>
    </>
  );
}
