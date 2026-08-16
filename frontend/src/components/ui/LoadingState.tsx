interface LoadingStateProps {
  message?: string;
  rows?: number;
}

export function LoadingState({ message, rows = 5 }: LoadingStateProps) {
  if (message) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "24px" }}>
        <span
          style={{
            width: 16,
            height: 16,
            border: "2px solid var(--color-border)",
            borderTopColor: "var(--color-green)",
            borderRadius: "50%",
            flexShrink: 0,
          }}
          className="animate-spin"
        />
        <span style={{ color: "var(--color-muted)", fontSize: "13px" }}>{message}</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            height: "36px",
            opacity: 1 - i * 0.15,
            width: i % 3 === 2 ? "60%" : "100%",
          }}
        />
      ))}
    </div>
  );
}
