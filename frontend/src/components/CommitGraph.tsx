import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import type { Commit } from "../api/client";

interface CommitGraphProps {
  commits: Commit[];
}

interface LayoutNode {
  commit: Commit;
  x: number;
  y: number;
}

/**
 * React owns the DOM; D3 is used only for layout math (layered DAG by time).
 */
export function CommitGraph({ commits }: CommitGraphProps) {
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);

  const sorted = useMemo(
    () => [...commits].sort((a, b) => +new Date(a.committed_at) - +new Date(b.committed_at)),
    [commits],
  );

  const visibleCount = Math.max(1, Math.floor(progress * sorted.length));
  const visible = sorted.slice(0, visibleCount);
  const visibleSet = useMemo(() => new Set(visible.map((c) => c.hash)), [visible]);

  const { nodes, edges, width, height } = useMemo(() => {
    const laneByAuthor = new Map<string, number>();
    let nextLane = 0;
    const layout: LayoutNode[] = visible.map((c, i) => {
      if (!laneByAuthor.has(c.author_name)) {
        laneByAuthor.set(c.author_name, nextLane++);
      }
      const lane = laneByAuthor.get(c.author_name) ?? 0;
      return {
        commit: c,
        x: 40 + i * 28,
        y: 40 + (lane % 8) * 36,
      };
    });

    const byHash = new Map(layout.map((n) => [n.commit.hash, n]));
    const edgeList: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const n of layout) {
      for (const p of n.commit.parent_hashes) {
        if (!visibleSet.has(p)) continue;
        const parent = byHash.get(p);
        if (!parent) continue;
        edgeList.push({ x1: parent.x, y1: parent.y, x2: n.x, y2: n.y });
      }
    }

    const w = Math.max(640, layout.length * 28 + 80);
    const h = Math.max(280, Math.min(8, laneByAuthor.size) * 36 + 80);
    return { nodes: layout, edges: edgeList, width: w, height: h };
  }, [visible, visibleSet]);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setProgress((p) => {
        const next = Math.min(1, p + dt * 0.08);
        if (next >= 1) setPlaying(false);
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing]);

  const color = d3.scaleOrdinal(d3.schemeTableau10);

  return (
    <section className="animate-fade-up">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Commit graph</h2>
          <p className="text-sm text-[var(--color-slate)]">
            Time-scrubbable DAG — scrub or play to replay history.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (progress >= 1) setProgress(0);
              setPlaying((p) => !p);
            }}
            className="rounded-md bg-[var(--color-moss)] px-3 py-1.5 text-xs font-semibold text-[var(--color-foam)]"
          >
            {playing ? "Pause" : "Play"}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={progress}
            onChange={(e) => {
              setPlaying(false);
              setProgress(Number(e.target.value));
            }}
            className="w-40 accent-[var(--color-leaf)]"
          />
          <span className="font-mono text-xs text-[var(--color-slate)]">
            {visibleCount}/{sorted.length}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--color-moss)]/10 bg-[var(--color-ink)]/95">
        <svg width={width} height={height} role="img" aria-label="Commit DAG">
          {edges.map((e, i) => (
            <path
              key={i}
              d={`M${e.x1},${e.y1} C${(e.x1 + e.x2) / 2},${e.y1} ${(e.x1 + e.x2) / 2},${e.y2} ${e.x2},${e.y2}`}
              fill="none"
              stroke="rgba(82,183,136,0.35)"
              strokeWidth={1.5}
            />
          ))}
          {nodes.map((n) => (
            <g key={n.commit.hash} transform={`translate(${n.x},${n.y})`}>
              <circle
                r={n.commit.parent_hashes.length > 1 ? 6 : 4.5}
                fill={color(n.commit.author_name)}
                stroke="#d8f3dc"
                strokeWidth={1}
              >
                <title>
                  {n.commit.hash.slice(0, 7)} — {n.commit.author_name}
                  {"\n"}
                  {n.commit.message.slice(0, 80)}
                </title>
              </circle>
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}
