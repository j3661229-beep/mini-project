import type { Summary } from "../api/client";

interface DashboardSummaryProps {
  summary: Summary;
}

export function DashboardSummary({ summary }: DashboardSummaryProps) {
  const stats = [
    { label: "Commits", value: summary.commit_count },
    { label: "Contributors", value: summary.contributor_count },
    { label: "Pull requests", value: summary.pr_count },
    { label: "At-risk files", value: summary.at_risk_file_count, warn: true },
    { label: "Review bottlenecks", value: summary.bottleneck_count, warn: true },
  ];

  return (
    <header className="animate-fade-up">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-leaf)]">
        Repository health
      </p>
      <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
        {summary.owner}/
        <span className="text-[var(--color-leaf)]">{summary.name}</span>
      </h1>
      {summary.commit_cap_reached && (
        <p className="mt-2 text-sm text-[var(--color-amber)]">
          Results are partial — ingestion capped at the configured commit limit.
        </p>
      )}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="border-l-2 border-[var(--color-mint)]/50 pl-3">
            <p
              className={`font-display text-2xl font-bold ${
                s.warn && s.value > 0 ? "text-[var(--color-coral)]" : ""
              }`}
            >
              {s.value}
            </p>
            <p className="text-xs text-[var(--color-slate)]">{s.label}</p>
          </div>
        ))}
      </div>
    </header>
  );
}
