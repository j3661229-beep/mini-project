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
    <section>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "12px" }}>
        <div>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--color-muted)" }}>
            {riskCount > 0 && (
              <span style={{ color: "var(--color-red)", fontWeight: 600 }}>{riskCount} at-risk · </span>
            )}
            Files where one contributor owns ≥80% of churn.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--color-muted)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={riskOnly}
              onChange={(e) => setRiskOnly(e.target.checked)}
            />
            At-risk only
          </label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            style={{ fontSize: "12px", padding: "3px 8px" }}
          >
            <option value="share">Ownership %</option>
            <option value="churn">Total churn</option>
            <option value="path">Path</option>
          </select>
        </div>
      </div>

      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "8px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
              {["File", "Top Owner", "Ownership", "Churn"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    fontSize: "10px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--color-muted)",
                    background: "var(--color-surface-2)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: "32px", textAlign: "center", color: "var(--color-muted)", fontSize: "13px" }}>
                  {riskOnly ? "No at-risk files in this repository." : "No file ownership data available."}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.file_path}
                style={{ borderBottom: "1px solid var(--color-border)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <td style={{ padding: "9px 12px", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--color-text)" }} title={r.file_path}>
                    {r.file_path}
                  </span>
                </td>
                <td style={{ padding: "9px 12px", color: "var(--color-muted)", fontSize: "12px" }}>
                  {r.top_contributor}
                </td>
                <td style={{ padding: "9px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: 72, height: 4, background: "var(--color-border)", borderRadius: 2, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${Math.round(r.top_contributor_share * 100)}%`,
                          height: "100%",
                          background: r.bus_factor_risk ? "var(--color-red)" : "var(--color-green)",
                          borderRadius: 2,
                        }}
                      />
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: r.bus_factor_risk ? "var(--color-red)" : "var(--color-text)", fontWeight: 600 }}>
                      {Math.round(r.top_contributor_share * 100)}%
                    </span>
                  </div>
                </td>
                <td style={{ padding: "9px 12px", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--color-muted)" }}>
                  {r.total_churn.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
