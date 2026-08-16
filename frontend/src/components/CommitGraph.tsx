import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import type { Commit } from "../api/client";
import { Play, Pause, RotateCcw } from "lucide-react";

interface CommitGraphProps {
  commits: Commit[];
}

interface LayoutNode {
  commit: Commit;
  x: number;
  y: number;
}

interface Tooltip {
  node: LayoutNode;
  px: number;
  py: number;
}

export function CommitGraph({ commits }: CommitGraphProps) {
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [selected, setSelected] = useState<Commit | null>(null);
  const rafRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity);

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
      return { commit: c, x: 40 + i * 24, y: 36 + (lane % 10) * 32 };
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
    const w = Math.max(640, layout.length * 24 + 80);
    const h = Math.max(200, Math.min(10, laneByAuthor.size) * 32 + 72);
    return { nodes: layout, edges: edgeList, width: w, height: h };
  }, [visible, visibleSet]);

  // Zoom
  useEffect(() => {
    if (!svgRef.current) return;
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => setTransform(event.transform));
    d3.select(svgRef.current).call(zoom);
    return () => { d3.select(svgRef.current as SVGSVGElement).on(".zoom", null); };
  }, []);

  // Play animation
  useEffect(() => {
    if (!playing) { if (rafRef.current) cancelAnimationFrame(rafRef.current); return; }
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setProgress((p) => {
        const next = Math.min(1, p + dt * 0.06);
        if (next >= 1) setPlaying(false);
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing]);

  const color = d3.scaleOrdinal(d3.schemeTableau10);

  return (
    <section>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
        <div>
          <h2 style={{ margin: "0 0 2px", fontSize: "15px", fontWeight: 600, color: "var(--color-text)" }}>
            Commit Graph
          </h2>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--color-muted)" }}>
            Interactive DAG — scrub to replay history. Scroll to zoom, drag to pan.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() => { setProgress(0); setPlaying(false); }}
            title="Reset"
            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: "6px", padding: "5px 8px", cursor: "pointer", color: "var(--color-muted)", display: "flex", alignItems: "center" }}
          >
            <RotateCcw size={13} />
          </button>
          <button
            onClick={() => { if (progress >= 1) setProgress(0); setPlaying((p) => !p); }}
            style={{ display: "flex", alignItems: "center", gap: "5px", background: playing ? "var(--color-surface-2)" : "var(--color-green)", border: `1px solid ${playing ? "var(--color-border)" : "var(--color-green)"}`, borderRadius: "6px", padding: "5px 12px", cursor: "pointer", color: playing ? "var(--color-text)" : "#0d1117", fontSize: "12px", fontWeight: 600 }}
          >
            {playing ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Play</>}
          </button>
          <input
            type="range" min={0} max={1} step={0.001} value={progress}
            onChange={(e) => { setPlaying(false); setProgress(Number(e.target.value)); }}
            style={{ width: 120 }}
          />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--color-muted)", minWidth: 60 }}>
            {visibleCount}/{sorted.length}
          </span>
        </div>
      </div>

      <div style={{ position: "relative", overflow: "hidden", borderRadius: "8px", border: "1px solid var(--color-border)", background: "#0d1117", cursor: "grab" }} ref={containerRef}>
        <svg
          ref={svgRef}
          width="100%"
          height={Math.min(height, 280)}
          viewBox={`0 0 ${width} ${Math.min(height, 280)}`}
          preserveAspectRatio="xMinYMid meet"
          style={{ display: "block" }}
          role="img"
          aria-label="Commit DAG"
        >
          <g transform={transform.toString()}>
            {/* Edges */}
            {edges.map((e, i) => (
              <path
                key={i}
                d={`M${e.x1},${e.y1} C${(e.x1 + e.x2) / 2},${e.y1} ${(e.x1 + e.x2) / 2},${e.y2} ${e.x2},${e.y2}`}
                fill="none"
                stroke="rgba(88,166,255,0.25)"
                strokeWidth={1.5}
              />
            ))}
            {/* Nodes */}
            {nodes.map((n) => {
              const isMerge = n.commit.parent_hashes.length > 1;
              const isSelected = selected?.hash === n.commit.hash;
              return (
                <g
                  key={n.commit.hash}
                  transform={`translate(${n.x},${n.y})`}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => {
                    const rect = containerRef.current?.getBoundingClientRect();
                    setTooltip({ node: n, px: e.clientX - (rect?.left ?? 0), py: e.clientY - (rect?.top ?? 0) });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => setSelected((s) => s?.hash === n.commit.hash ? null : n.commit)}
                >
                  <circle
                    r={isMerge ? 7 : isSelected ? 6 : 4.5}
                    fill={isSelected ? "#fff" : color(n.commit.author_name)}
                    stroke={isSelected ? "var(--color-green)" : isMerge ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.15)"}
                    strokeWidth={isSelected ? 2 : 1}
                  />
                  {isMerge && (
                    <circle r={11} fill="none" stroke={color(n.commit.author_name)} strokeWidth={1} opacity={0.3} />
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Hover tooltip */}
        {tooltip && (
          <div
            style={{
              position: "absolute",
              left: tooltip.px + 12,
              top: tooltip.py - 10,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              padding: "10px 12px",
              fontSize: "12px",
              pointerEvents: "none",
              zIndex: 10,
              maxWidth: 280,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ fontFamily: "var(--font-mono)", color: "var(--color-blue)", marginBottom: "4px" }}>
              {tooltip.node.commit.hash.slice(0, 7)}
            </div>
            <div style={{ fontWeight: 500, marginBottom: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>
              {tooltip.node.commit.message.split("\n")[0]}
            </div>
            <div style={{ color: "var(--color-muted)" }}>{tooltip.node.commit.author_name}</div>
            <div style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
              {new Date(tooltip.node.commit.committed_at).toLocaleDateString()}
            </div>
          </div>
        )}
      </div>

      {/* Selected commit detail */}
      {selected && (
        <div style={{ marginTop: "12px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "8px", padding: "16px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "16px" }} className="animate-fade-up">
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--color-blue)", paddingTop: "2px" }}>
            {selected.hash.slice(0, 7)}
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>{selected.message.split("\n")[0]}</div>
            <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>
              {selected.author_name} · {new Date(selected.committed_at).toLocaleString()} · {selected.parent_hashes.length > 1 ? "Merge commit" : selected.branch || ""}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
