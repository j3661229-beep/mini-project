import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        gap: "12px",
        border: "1px dashed var(--color-border)",
        borderRadius: "8px",
        textAlign: "center",
      }}
    >
      {icon && (
        <span style={{ color: "var(--color-muted)", fontSize: "32px", lineHeight: 1 }}>
          {icon}
        </span>
      )}
      <p style={{ fontWeight: 600, color: "var(--color-text)", margin: 0 }}>{title}</p>
      {description && (
        <p style={{ color: "var(--color-muted)", fontSize: "13px", margin: 0, maxWidth: "340px" }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: "8px" }}>{action}</div>}
    </div>
  );
}
