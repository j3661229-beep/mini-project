import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import type { RepoStatusResponse, Summary } from "../../api/client";
interface TopbarProps {
  repoId?: number;
  summary?: Summary | null;
  status?: RepoStatusResponse | null;
  onCommandPalette: () => void;
}

export function Topbar({ repoId, summary, status, onCommandPalette }: TopbarProps) {
  const isMac = typeof navigator !== "undefined" && navigator.platform.includes("Mac");

  const syncVariant =
    status?.status === "complete"
      ? { color: "var(--color-green)", label: "Synced", dot: true }
      : status?.status === "processing" || status?.status === "pending"
      ? { color: "var(--color-yellow)", label: "Syncing…", dot: true, pulse: true }
      : status?.status === "failed"
      ? { color: "var(--color-red)", label: "Failed", dot: true }
      : null;

  return (
    <header
      style={{
        height: 48,
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: "12px",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      {/* Logo (when no repo selected) */}
      {!repoId && (
        <Link
          to="/"
          style={{
            fontWeight: 700,
            fontSize: "15px",
            color: "var(--color-green)",
            textDecoration: "none",
            letterSpacing: "-0.02em",
            fontFamily: "var(--font-display)",
          }}
        >
          GitPulse
        </Link>
      )}

      {/* Repo breadcrumb */}
      {summary && repoId && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
          <Link
            to="/"
            style={{
              color: "var(--color-muted)",
              fontSize: "13px",
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            GitPulse
          </Link>
          <span style={{ color: "var(--color-border)" }}>/</span>
          <span
            style={{
              fontWeight: 600,
              fontSize: "13px",
              color: "var(--color-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {summary.owner}/{summary.name}
          </span>
          {syncVariant && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                color: syncVariant.color,
                flexShrink: 0,
                marginLeft: "4px",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: syncVariant.color,
                }}
                className={syncVariant.pulse ? "animate-pulse-soft" : ""}
              />
              {syncVariant.label}
            </span>
          )}
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Search / Command Palette */}
      <button
        onClick={onCommandPalette}
        aria-label="Open command palette"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "var(--color-surface-2)",
          border: "1px solid var(--color-border)",
          borderRadius: "6px",
          padding: "5px 10px",
          color: "var(--color-muted)",
          fontSize: "12px",
          cursor: "pointer",
          transition: "border-color 0.15s",
          minWidth: 0,
          flexShrink: 0,
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-blue)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border)")}
      >
        <Search size={13} />
        <span style={{ display: "none" }} className="sm:inline">
          Search
        </span>
        <kbd
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "3px",
            padding: "1px 5px",
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--color-muted)",
          }}
        >
          {isMac ? "⌘K" : "Ctrl+K"}
        </kbd>
      </button>
    </header>
  );
}
