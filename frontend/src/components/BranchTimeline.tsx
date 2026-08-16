import { useMemo } from "react";
import * as d3 from "d3";
import type { Commit } from "../api/client";

interface BranchTimelineProps {
  commits: Commit[];
}

export function BranchTimeline({ commits }: BranchTimelineProps) {
  const { lanes, width, height, ticks } = useMemo(() => {
    const sorted = [...commits].sort(
      (a, b) => +new Date(a.committed_at) - +new Date(b.committed_at),
    );
    if (!sorted.length) {
      return { lanes: [] as never[], width: 640, height: 100, ticks: [] as string[] };
    }
    const t0 = +new Date(sorted[0].committed_at);
    const t1 = +new Date(sorted[sorted.length - 1].committed_at);
    const span = Math.max(t1 - t0, 1);
    const w = 800;
    const pad = 48;
    const x = (iso: string) => pad + ((+new Date(iso) - t0) / span) * (w - pad * 2);

    const branchNames = Array.from(
      new Set(sorted.map((c) => c.branch || "main").filter(Boolean)),
    ).slice(0, 8);
    if (!branchNames.includes("main") && sorted.some((c) => !c.branch)) {
      branchNames.unshift("main");
    }
    if (branchNames.length === 0) branchNames.push("main");

    const color = d3.scaleOrdinal(d3.schemeTableau10).domain(branchNames);
    const laneH = 36;
    const h = branchNames.length * laneH + 32;

    const laneData = branchNames.map((name, i) => {
      const pts = sorted
        .filter((c) => (c.branch || "main") === name)
        .map((c) => ({ x: x(c.committed_at), y: 20 + i * laneH, commit: c }));
      return { name, color: color(name) as string, pts, y: 20 + i * laneH };
    });

    const tickCount = 6;
    const tickLabels = d3.range(tickCount).map((i) => {
      const t = t0 + (span * i) / (tickCount - 1);
      return new Date(t).toISOString().slice(0, 10);
    });

    return { lanes: laneData, width: w, height: h, ticks: tickLabels };
  }, [commits]);

  return (
    <section>
      <div style={{ marginBottom: "12px" }}>
        <h2 style={{ margin: "0 0 2px", fontSize: "15px", fontWeight: 600, color: "var(--color-text)" }}>
          Branch Timeline
        </h2>
        <p style={{ margin: 0, fontSize: "12px", color: "var(--color-muted)" }}>
          Commit activity across branches over time.
        </p>
      </div>
      <div
        style={{
          overflow: "auto",
          background: "#0d1117",
          border: "1px solid var(--color-border)",
          borderRadius: "8px",
          padding: "8px 0",
        }}
      >
        <svg width={width} height={height + 28} role="img" aria-label="Branch timeline">
          {/* Branch lane labels + lines */}
          {lanes.map((lane) => (
            <g key={lane.name}>
              <line
                x1={40} x2={width - 8}
                y1={lane.y} y2={lane.y}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
              />
              <text
                x={4} y={lane.y + 4}
                style={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--color-muted)" }}
              >
                {lane.name.slice(0, 14)}
              </text>
              {/* Connect pts with a line */}
              {lane.pts.length > 1 && (
                <polyline
                  points={lane.pts.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={lane.color}
                  strokeWidth={1.5}
                  opacity={0.4}
                />
              )}
              {lane.pts.map((p) => (
                <circle
                  key={p.commit.hash}
                  cx={p.x}
                  cy={p.y}
                  r={3}
                  fill={lane.color}
                  opacity={0.85}
                >
                  <title>{p.commit.hash.slice(0, 7)} · {p.commit.message.split("\n")[0].slice(0, 60)}</title>
                </circle>
              ))}
            </g>
          ))}
          {/* Time axis ticks */}
          {ticks.map((label, i) => {
            const xPos = 48 + i * ((width - 96) / Math.max(ticks.length - 1, 1));
            return (
              <g key={label + i}>
                <line x1={xPos} x2={xPos} y1={0} y2={height} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
                <text
                  x={xPos} y={height + 20}
                  textAnchor="middle"
                  style={{ fontSize: 9, fontFamily: "var(--font-mono)", fill: "#8b949e" }}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
