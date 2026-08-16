import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { RepoStatusResponse, Summary } from "../../api/client";

interface AppShellProps {
  children: ReactNode;
  repoId?: number;
  summary?: Summary | null;
  status?: RepoStatusResponse | null;
  onCommandPalette: () => void;
}

export function AppShell({ children, repoId, summary, status, onCommandPalette }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "var(--color-bg)",
        overflow: "hidden",
      }}
    >
      {/* Sidebar */}
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      {/* Main content area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        <Topbar
          repoId={repoId}
          summary={summary}
          status={status}
          onCommandPalette={onCommandPalette}
        />
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
