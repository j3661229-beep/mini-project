interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "green" | "yellow" | "red" | "blue" | "purple" | "default";
  mono?: boolean;
}

const accentColor: Record<string, string> = {
  green:   "var(--color-green)",
  yellow:  "var(--color-yellow)",
  red:     "var(--color-red)",
  blue:    "var(--color-blue)",
  purple:  "var(--color-purple)",
  default: "var(--color-muted)",
};

export function MetricCard({ label, value, sub, accent = "default", mono }: MetricCardProps) {
  const color = accentColor[accent];
  return (
    <div
      style={{
        borderLeft: `2px solid ${color}`,
        paddingLeft: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
      }}
    >
      <span
        style={{
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--color-muted)",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "22px",
          fontWeight: 700,
          color: accent !== "default" ? color : "var(--color-text)",
          fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
          lineHeight: 1.2,
        }}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
      {sub && (
        <span style={{ fontSize: "11px", color: "var(--color-muted)" }}>{sub}</span>
      )}
    </div>
  );
}
