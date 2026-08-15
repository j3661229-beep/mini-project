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

/**
 * Force layout computed by D3; positions rendered through React SVG.
 */
export function ReviewBottleneckGraph({ graph }: ReviewBottleneckGraphProps) {
  const width = 720;
  const height = 420;
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [links, setLinks] = useState<SimLink[]>([]);
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
      .map((e) => ({
        source: e.reviewer,
        target: e.author,
        count: e.count,
      }));

    const maxIn = d3.max(simNodes, (d) => d.in_degree) || 1;
    const radius = (d: SimNode) => 6 + (d.in_degree / maxIn) * 18;

    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(70)
          .strength(0.4),
      )
      .force("charge", d3.forceManyBody().strength(-180))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collide",
        d3.forceCollide<SimNode>().radius((d) => radius(d) + 4),
      );

    simRef.current = simulation;

    simulation.on("tick", () => {
      setNodes([...simNodes]);
      setLinks([...simLinks]);
    });

    return () => {
      simulation.stop();
    };
  }, [graph]);

  const maxIn = d3.max(nodes, (d) => d.in_degree) || 1;
  const maxCount = d3.max(links, (d) => d.count) || 1;

  return (
    <section className="animate-fade-up">
      <h2 className="font-display text-xl font-bold">Review bottleneck graph</h2>
      <p className="mb-3 text-sm text-[var(--color-slate)]">
        Directed reviewer → author edges. Node size = review reliance (in-degree).
        {bottleneckCount > 0 && (
          <span className="ml-1 text-[var(--color-coral)]">
            {bottleneckCount} bottleneck{bottleneckCount === 1 ? "" : "s"} flagged
          </span>
        )}
      </p>
      {graph.nodes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--color-moss)]/20 px-4 py-8 text-center text-sm text-[var(--color-slate)]">
          No PR review data available for this repository (private history, rate limit, or no
          reviews yet).
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--color-moss)]/10 bg-[var(--color-ink)]/95">
          <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Review graph">
            {links.map((l, i) => {
              const s = l.source as SimNode;
              const t = l.target as SimNode;
              if (s.x == null || t.x == null) return null;
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke="rgba(82,183,136,0.35)"
                  strokeWidth={1 + (l.count / maxCount) * 4}
                  markerEnd="url(#arrow)"
                />
              );
            })}
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(82,183,136,0.5)" />
              </marker>
            </defs>
            {nodes.map((n) => {
              if (n.x == null || n.y == null) return null;
              const r = 6 + (n.in_degree / maxIn) * 18;
              return (
                <g key={n.id} transform={`translate(${n.x},${n.y})`}>
                  <circle
                    r={r}
                    fill={n.is_bottleneck ? "#c45c4a" : "#52b788"}
                    stroke="#d8f3dc"
                    strokeWidth={n.is_bottleneck ? 2 : 1}
                    opacity={0.9}
                  >
                    <title>
                      {n.id}
                      {"\n"}reviews given: {n.in_degree}
                      {"\n"}reviews received: {n.out_degree}
                      {n.is_bottleneck ? "\n⚠ bottleneck" : ""}
                    </title>
                  </circle>
                  <text
                    y={r + 12}
                    textAnchor="middle"
                    fill="#d8f3dc"
                    style={{ fontSize: 9, fontFamily: "IBM Plex Mono, monospace" }}
                  >
                    {n.id.length > 12 ? `${n.id.slice(0, 11)}…` : n.id}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </section>
  );
}
