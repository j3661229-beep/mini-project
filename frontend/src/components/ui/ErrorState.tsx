interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "10px",
        padding: "32px 24px",
        border: "1px solid rgba(248,81,73,0.2)",
        borderRadius: "8px",
        background: "rgba(248,81,73,0.05)",
        textAlign: "center",
      }}
    >
      <span style={{ color: "var(--color-red)", fontSize: "20px" }}>⚠</span>
      <p style={{ color: "var(--color-red)", fontWeight: 500, margin: 0 }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: "4px",
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
            borderRadius: "6px",
            padding: "6px 14px",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
