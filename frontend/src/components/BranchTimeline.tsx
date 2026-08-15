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
      return { lanes: [] as never[], width: 640, height: 120, ticks: [] as string[] };
    }

    const t0 = +new Date(sorted[0].committed_at);
    const t1 = +new Date(sorted[sorted.length - 1].committed_at);
    const span = Math.max(t1 - t0, 1);
    const w = 720;
    const pad = 48;

    const x = (iso: string) => pad + ((+new Date(iso) - t0) / span) * (w - pad * 2);

    const branchNames = Array.from(
      new Set(sorted.map((c) => c.branch || "default").filter(Boolean)),
    ).slice(0, 6);

    // Always include a default lane for unbranched commits
    if (!branchNames.includes("default") && sorted.some((c) => !c.branch)) {
      branchNames.unshift("default");
    }
    if (branchNames.length === 0) branchNames.push("default");

    const color = d3.scaleOrdinal(d3.schemeSet2).domain(branchNames);
    const laneH = 42;
    const h = branchNames.length * laneH + 40;

    const laneData = branchNames.map((name, i) => {
      const pts = sorted
        .filter((c) => (c.branch || "default") === name)
        .map((c) => ({
          x: x(c.committed_at),
          y: 28 + i * laneH,
          commit: c,
        }));
      return { name, color: color(name) as string, pts, y: 28 + i * laneH };
    });

    const tickCount = 5;
    const tickLabels = d3.range(tickCount).map((i) => {
      const t = t0 + (span * i) / (tickCount - 1);
      return new Date(t).toISOString().slice(0, 10);
    });

    return { lanes: laneData, width: w, height: h, ticks: tickLabels };
  }, [commits]);

  return (
    <section className="animate-fade-up">
      <h2 className="font-display text-xl font-bold">Branching timeline</h2>
      <p className="mb-3 text-sm text-[var(--color-slate)]">
        Branch tips and activity over time — interactive git log --graph energy.
      </p>
      <div className="overflow-x-auto rounded-xl border border-[var(--color-moss)]/10 bg-white/60 p-2">
        <svg width={width} height={height + 24} role="img" aria-label="Branch timeline">
          {lanes.map((lane) => (
            <g key={lane.name}>
              <line
                x1={40}
                x2={width - 40}
                y1={lane.y}
                y2={lane.y}
                stroke="rgba(26,58,42,0.12)"
                strokeWidth={1}
              />
              <text
                x={4}
                y={lane.y + 4}
                className="fill-[var(--color-slate)]"
                style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
              >
                {lane.name.slice(0, 12)}
              </text>
              {lane.pts.map((p) => (
                <circle
                  key={p.commit.hash}
                  cx={p.x}
                  cy={p.y}
                  r={3.5}
                  fill={lane.color}
                  opacity={0.85}
                >
                  <title>
                    {p.commit.hash.slice(0, 7)} · {p.commit.message.slice(0, 60)}
                  </title>
                </circle>
              ))}
            </g>
          ))}
          {ticks.map((label, i) => (
            <text
              key={label + i}
              x={48 + i * ((width - 96) / Math.max(ticks.length - 1, 1))}
              y={height + 16}
              textAnchor="middle"
              style={{ fontSize: 9, fontFamily: "IBM Plex Mono, monospace", fill: "#5c6b62" }}
            >
              {label}
            </text>
          ))}
        </svg>
      </div>
    </section>
  );
}
