import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import type { ReviewGraph } from "../api/client";

interface ReviewBottleneckGraphProps {
  graph: ReviewGraph;
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  in_degree: number;
  out_degree: number;
  is_bottleneck: boolean;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  count: number;
}

export function ReviewBottleneckGraph({ graph }: ReviewBottleneckGraphProps) {
  const width = 720;
  const height = 380;
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [links, setLinks] = useState<SimLink[]>([]);
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);

  const bottleneckCount = useMemo(
    () => graph.nodes.filter((n) => n.is_bottleneck).length,
    [graph.nodes],
  );

  useEffect(() => {
    const simNodes: SimNode[] = graph.nodes.map((n) => ({
      id: n.login,
      in_degree: n.in_degree,
      out_degree: n.out_degree,
      is_bottleneck: n.is_bottleneck,
    }));
    const idSet = new Set(simNodes.map((n) => n.id));
    const simLinks: SimLink[] = graph.edges
      .filter((e) => idSet.has(e.reviewer) && idSet.has(e.author))
      .map((e) => ({ source: e.reviewer, target: e.author, count: e.count }));

    const maxIn = d3.max(simNodes, (d) => d.in_degree) || 1;
    const radius = (d: SimNode) => 6 + (d.in_degree / maxIn) * 16;

    const simulation = d3
      .forceSimulation(simNodes)
      .force("link", d3.forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(80).strength(0.4))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide<SimNode>().radius((d) => radius(d) + 6));

    simRef.current = simulation;
    simulation.on("tick", () => { setNodes([...simNodes]); setLinks([...simLinks]); });
    return () => { simulation.stop(); };
  }, [graph]);

  const maxIn = d3.max(nodes, (d) => d.in_degree) || 1;
  const maxCount = d3.max(links, (d) => d.count) || 1;

  if (graph.nodes.length === 0) {
    return (
      <div style={{ padding: "40px", textAlign: "center", border: "1px dashed var(--color-border)", borderRadius: "8px", color: "var(--color-muted)", fontSize: "13px" }}>
        No PR review data available. This may be a private repo or reviews haven't been fetched yet.
      </div>
    );
  }

  return (
    <section>
      <div style={{ marginBottom: "12px" }}>
        <p style={{ margin: 0, fontSize: "12px", color: "var(--color-muted)" }}>
          Reviewer → author edges. Node size = review reliance.
          {bottleneckCount > 0 && (
            <span style={{ color: "var(--color-yellow)", marginLeft: "6px" }}>
              {bottleneckCount} bottleneck{bottleneckCount !== 1 ? "s" : ""} flagged.
            </span>
          )}
        </p>
      </div>
      <div style={{ position: "relative", background: "#0d1117", border: "1px solid var(--color-border)", borderRadius: "8px", overflow: "hidden" }}>
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Review graph">
          <defs>
            <marker id="arrow-green" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(63,185,80,0.6)" />
            </marker>
            <marker id="arrow-yellow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(210,153,34,0.7)" />
            </marker>
          </defs>
          {links.map((l, i) => {
            const s = l.source as SimNode;
            const t = l.target as SimNode;
            if (s.x == null || t.x == null) return null;
            const isHotPath = s.is_bottleneck || t.is_bottleneck;
            return (
              <line
                key={i}
                x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                stroke={isHotPath ? "rgba(210,153,34,0.5)" : "rgba(88,166,255,0.25)"}
                strokeWidth={1 + (l.count / maxCount) * 3}
                markerEnd={isHotPath ? "url(#arrow-yellow)" : "url(#arrow-green)"}
              />
            );
          })}
          {nodes.map((n) => {
            if (n.x == null || n.y == null) return null;
            const r = 6 + (n.in_degree / maxIn) * 16;
            const isHovered = hoveredNode?.id === n.id;
            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoveredNode(n)}
                onMouseLeave={() => setHoveredNode(null)}>
                {n.is_bottleneck && (
                  <circle r={r + 6} fill="rgba(210,153,34,0.12)" stroke="rgba(210,153,34,0.3)" strokeWidth={1} />
                )}
                <circle
                  r={r}
                  fill={n.is_bottleneck ? "var(--color-yellow)" : isHovered ? "var(--color-blue)" : "#3fb950"}
                  stroke={isHovered ? "white" : "rgba(255,255,255,0.2)"}
                  strokeWidth={isHovered ? 2 : 1}
                  opacity={0.9}
                />
                <text
                  y={r + 13}
                  textAnchor="middle"
                  style={{ fontSize: 9, fontFamily: "var(--font-mono)", fill: "#8b949e", pointerEvents: "none" }}
                >
                  {n.id.length > 12 ? `${n.id.slice(0, 11)}…` : n.id}
                </text>
                {isHovered && (
                  <g>
                    <rect x={-60} y={-r - 48} width={120} height={40} rx={4} fill="var(--color-surface)" stroke="var(--color-border)" />
                    <text x={0} y={-r - 32} textAnchor="middle" style={{ fontSize: 10, fill: "var(--color-text)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                      {n.id}
                    </text>
                    <text x={0} y={-r - 17} textAnchor="middle" style={{ fontSize: 9, fill: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>
                      {n.in_degree}↑ {n.out_degree}↓{n.is_bottleneck ? " ⚠" : ""}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
        {/* Legend */}
        <div style={{ position: "absolute", bottom: "10px", right: "12px", display: "flex", gap: "12px", fontSize: "11px" }}>
          {[
            { color: "var(--color-green)", label: "Reviewer" },
            { color: "var(--color-yellow)", label: "Bottleneck" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px", color: "var(--color-muted)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
