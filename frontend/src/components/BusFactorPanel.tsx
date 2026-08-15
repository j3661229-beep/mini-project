import { useMemo, useState } from "react";
import type { FileOwnership } from "../api/client";

interface BusFactorPanelProps {
  ownership: FileOwnership[];
}

type SortKey = "share" | "path" | "churn";

export function BusFactorPanel({ ownership }: BusFactorPanelProps) {
  const [riskOnly, setRiskOnly] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("share");

  const rows = useMemo(() => {
    let list = [...ownership];
    if (riskOnly) list = list.filter((r) => r.bus_factor_risk);
    list.sort((a, b) => {
      if (sortKey === "path") return a.file_path.localeCompare(b.file_path);
      if (sortKey === "churn") return b.total_churn - a.total_churn;
      return b.top_contributor_share - a.top_contributor_share;
    });
    return list.slice(0, 80);
  }, [ownership, riskOnly, sortKey]);

  const riskCount = ownership.filter((o) => o.bus_factor_risk).length;

  return (
    <section className="animate-fade-up">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Bus factor</h2>
          <p className="text-sm text-[var(--color-slate)]">
            Files where one contributor owns ≥80% of churn — single-owner risk.
            {riskCount > 0 && (
              <span className="ml-1 text-[var(--color-coral)]">{riskCount} at risk</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={riskOnly}
              onChange={(e) => setRiskOnly(e.target.checked)}
              className="accent-[var(--color-coral)]"
            />
            At-risk only
          </label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded border border-[var(--color-moss)]/20 bg-white px-2 py-1"
          >
            <option value="share">Sort: ownership</option>
            <option value="churn">Sort: churn</option>
            <option value="path">Sort: path</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-moss)]/10 bg-white/70">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--color-moss)]/10 bg-[var(--color-foam)]/40 font-mono text-[11px] uppercase tracking-wider text-[var(--color-slate)]">
            <tr>
              <th className="px-3 py-2">File</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Share</th>
              <th className="px-3 py-2">Churn</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-[var(--color-slate)]">
                  No at-risk files in this sample.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.file_path}
                className="border-b border-[var(--color-moss)]/5 hover:bg-[var(--color-foam)]/30"
              >
                <td className="max-w-[280px] truncate px-3 py-2 font-mono text-xs" title={r.file_path}>
                  {r.file_path}
                </td>
                <td className="px-3 py-2">{r.top_contributor}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded bg-[var(--color-foam)]">
                      <div
                        className={`h-full ${
                          r.bus_factor_risk ? "bg-[var(--color-coral)]" : "bg-[var(--color-mint)]"
                        }`}
                        style={{ width: `${Math.round(r.top_contributor_share * 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs">
                      {Math.round(r.top_contributor_share * 100)}%
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.total_churn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
