type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral" | "processing";

interface StatusBadgeProps {
  variant: BadgeVariant;
  label: string;
  dot?: boolean;
}

const cfg: Record<BadgeVariant, { bg: string; color: string; dotColor: string }> = {
  success:    { bg: "rgba(63,185,80,0.12)",  color: "var(--color-green)",  dotColor: "var(--color-green)" },
  warning:    { bg: "rgba(210,153,34,0.12)", color: "var(--color-yellow)", dotColor: "var(--color-yellow)" },
  error:      { bg: "rgba(248,81,73,0.12)",  color: "var(--color-red)",    dotColor: "var(--color-red)" },
  info:       { bg: "rgba(88,166,255,0.12)", color: "var(--color-blue)",   dotColor: "var(--color-blue)" },
  neutral:    { bg: "rgba(139,148,158,0.12)",color: "var(--color-muted)",  dotColor: "var(--color-muted)" },
  processing: { bg: "rgba(210,153,34,0.12)", color: "var(--color-yellow)", dotColor: "var(--color-yellow)" },
};

export function StatusBadge({ variant, label, dot = true }: StatusBadgeProps) {
  const s = cfg[variant];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        background: s.bg,
        color: s.color,
        borderRadius: "20px",
        padding: "2px 8px",
        fontSize: "12px",
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: s.dotColor,
            flexShrink: 0,
            ...(variant === "processing" ? { animation: "pulse-dot 1.5s ease-in-out infinite" } : {}),
          }}
          className={variant === "processing" ? "animate-pulse-soft" : ""}
        />
      )}
      {label}
    </span>
  );
}
