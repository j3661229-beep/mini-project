import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import {
  Folder,
  FileCode,
  ShieldAlert,
  Search,
  ArrowLeft,
  RotateCcw,
  Layers,
  Table as TableIcon,
  ChevronRight,
} from "lucide-react";
import type { DirectoryTreeResponse, TreeNode, TreeBreadcrumb } from "../api/client";

interface CodebaseTreemapProps {
  data: DirectoryTreeResponse;
  onPathChange?: (path: string) => void;
  isLoading?: boolean;
}

export function CodebaseTreemap({ data, onPathChange, isLoading }: CodebaseTreemapProps) {
  const [currentPath, setCurrentPath] = useState(data.summary.root_path || "");
  const [viewMode, setViewMode] = useState<"treemap" | "explorer">("treemap");
  const [metric, setMetric] = useState<"churn" | "files">("churn");
  const [riskOnly, setRiskOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredNode, setHoveredNode] = useState<TreeNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 480 });

  // Sync internal path with external changes
  useEffect(() => {
    if (data.summary.root_path !== undefined) {
      setCurrentPath(data.summary.root_path);
    }
  }, [data.summary.root_path]);

  // Track responsive container width
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
          setDimensions({ width: Math.max(480, width), height: Math.max(420, Math.min(560, width * 0.55)) });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
    if (onPathChange) {
      onPathChange(path);
    }
  };

  const handleGoUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    const parentPath = parts.join("/");
    handleNavigate(parentPath);
  };

  // Find the focused root node in the tree
  const activeTree = useMemo(() => {
    if (!currentPath) return data.tree;

    const findSubtree = (node: TreeNode, target: string): TreeNode | null => {
      if (node.path === target) return node;
      if (!node.children) return null;
      for (const child of node.children) {
        if (child.type === "directory") {
          const found = findSubtree(child, target);
          if (found) return found;
        }
      }
      return null;
    };

    return findSubtree(data.tree, currentPath) || data.tree;
  }, [data.tree, currentPath]);

  // Compute active breadcrumbs
  const breadcrumbs = useMemo(() => {
    const list: TreeBreadcrumb[] = [{ name: data.tree.name || "root", path: "" }];
    if (!currentPath) return list;

    const parts = currentPath.split("/").filter(Boolean);
    let accum = "";
    for (const p of parts) {
      accum = accum ? `${accum}/${p}` : p;
      list.push({ name: p, path: accum });
    }
    return list;
  }, [data.tree.name, currentPath]);

  // Build D3 treemap layout
  const treemapLayout = useMemo(() => {
    if (!activeTree || dimensions.width <= 0) return null;

    // Deep clone to prevent D3 mutation issues across metric/filter changes
    const cloned = JSON.parse(JSON.stringify(activeTree)) as TreeNode;

    // Filter by risk if requested
    if (riskOnly) {
      const pruneNonRisk = (node: TreeNode): boolean => {
        if (node.type === "file") {
          return node.bus_factor_risk;
        }
        if (node.children) {
          node.children = node.children.filter(pruneNonRisk);
          return node.children.length > 0;
        }
        return false;
      };
      pruneNonRisk(cloned);
    }

    const hierarchy = d3
      .hierarchy<TreeNode>(cloned, (d) => d.children)
      .sum((d) => {
        if (d.type === "file") {
          return metric === "churn" ? Math.max(1, d.total_churn) : 1;
        }
        return 0;
      })
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    const treemap = d3
      .treemap<TreeNode>()
      .size([dimensions.width, dimensions.height])
      .paddingOuter(4)
      .paddingTop(22)
      .paddingInner(3)
      .round(true);

    return treemap(hierarchy);
  }, [activeTree, dimensions.width, dimensions.height, metric, riskOnly]);

  // Color generator based on bus-factor risk & share
  const getNodeColor = (node: TreeNode, isMatchingSearch: boolean) => {
    if (searchQuery && !isMatchingSearch) {
      return "rgba(255, 255, 255, 0.05)";
    }
    if (node.bus_factor_risk) {
      return "rgba(239, 35, 60, 0.85)"; // Red risk
    }
    if (node.top_contributor_share >= 0.5) {
      return "rgba(255, 202, 91, 0.85)"; // Amber moderate risk
    }
    return "rgba(16, 185, 129, 0.75)"; // Emerald safe
  };

  const getNodeBorder = (node: TreeNode, isMatchingSearch: boolean) => {
    if (searchQuery && isMatchingSearch) {
      return "2px solid #a7a7ff";
    }
    if (node.bus_factor_risk) {
      return "1px solid rgba(239, 35, 60, 0.95)";
    }
    if (node.top_contributor_share >= 0.5) {
      return "1px solid rgba(255, 202, 91, 0.95)";
    }
    return "1px solid rgba(16, 185, 129, 0.6)";
  };

  return (
    <section className="panel" style={{ padding: "20px 24px", marginBottom: "28px" }} ref={containerRef}>
      {/* Header & Controls */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "16px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Layers size={18} style={{ color: "var(--color-red)" }} />
            <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, letterSpacing: "-0.01em" }}>
              Codebase Churn & Bus-Factor Treemap
            </h2>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--color-muted)" }}>
            Zoomable structural map of codebase churn. Rectangles represent files sized by activity and colored by single-maintainer risk.
          </p>
        </div>

        {/* Toolbar Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* View mode toggle */}
          <div
            style={{
              display: "inline-flex",
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              padding: "2px",
            }}
          >
            <button
              onClick={() => setViewMode("treemap")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "5px 10px",
                border: 0,
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 600,
                background: viewMode === "treemap" ? "var(--color-surface)" : "transparent",
                color: viewMode === "treemap" ? "var(--color-text)" : "var(--color-muted)",
              }}
              title="Treemap view"
            >
              <Layers size={13} />
              Treemap
            </button>
            <button
              onClick={() => setViewMode("explorer")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "5px 10px",
                border: 0,
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 600,
                background: viewMode === "explorer" ? "var(--color-surface)" : "transparent",
                color: viewMode === "explorer" ? "var(--color-text)" : "var(--color-muted)",
              }}
              title="Folder drill-down table"
            >
              <TableIcon size={13} />
              Drill-Down Explorer
            </button>
          </div>

          {/* Metric switcher */}
          <div
            style={{
              display: "inline-flex",
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              padding: "2px",
            }}
          >
            <button
              onClick={() => setMetric("churn")}
              style={{
                padding: "5px 9px",
                border: 0,
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 600,
                background: metric === "churn" ? "var(--color-surface)" : "transparent",
                color: metric === "churn" ? "var(--color-text)" : "var(--color-muted)",
              }}
            >
              Churn Lines
            </button>
            <button
              onClick={() => setMetric("files")}
              style={{
                padding: "5px 9px",
                border: 0,
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 600,
                background: metric === "files" ? "var(--color-surface)" : "transparent",
                color: metric === "files" ? "var(--color-text)" : "var(--color-muted)",
              }}
            >
              File Count
            </button>
          </div>

          {/* High risk toggle */}
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: "var(--color-text)",
              cursor: "pointer",
              padding: "4px 8px",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              background: riskOnly ? "rgba(239, 35, 60, 0.15)" : "transparent",
            }}
          >
            <input
              type="checkbox"
              checked={riskOnly}
              onChange={(e) => setRiskOnly(e.target.checked)}
              style={{ accentColor: "var(--color-red)" }}
            />
            <span style={{ fontSize: "11px", fontWeight: 600 }}>High Risk Only</span>
          </label>

          {/* Search box */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              padding: "4px 8px",
            }}
          >
            <Search size={12} style={{ color: "var(--color-muted)" }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files/folders…"
              style={{
                background: "transparent",
                border: 0,
                outline: 0,
                color: "var(--color-text)",
                fontSize: "11px",
                width: "120px",
              }}
            />
          </div>
        </div>
      </header>

      {/* Breadcrumb Navigation Bar */}
      <nav
        aria-label="Breadcrumb"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          flexWrap: "wrap",
          padding: "8px 12px",
          background: "var(--color-surface-2)",
          border: "1px solid var(--color-border)",
          borderRadius: "8px",
          marginBottom: "16px",
          fontSize: "12px",
        }}
      >
        {currentPath ? (
          <button
            onClick={handleGoUp}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: "transparent",
              border: 0,
              color: "var(--color-text)",
              fontSize: "11px",
              fontWeight: 600,
              padding: "3px 6px",
              borderRadius: "4px",
            }}
            title="Go up one folder"
          >
            <ArrowLeft size={13} />
            Up
          </button>
        ) : null}

        <span style={{ color: "var(--color-muted)", fontSize: "11px", marginRight: "4px" }}>Path:</span>

        {breadcrumbs.map((crumb, idx) => {
          const isLast = idx === breadcrumbs.length - 1;
          return (
            <div key={crumb.path || "root"} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {idx > 0 && <span style={{ color: "var(--color-muted)", fontSize: "11px" }}>/</span>}
              <button
                onClick={() => handleNavigate(crumb.path)}
                disabled={isLast}
                style={{
                  background: isLast ? "rgba(255, 255, 255, 0.1)" : "transparent",
                  border: 0,
                  color: isLast ? "var(--color-text)" : "var(--color-muted)",
                  fontWeight: isLast ? 700 : 500,
                  fontSize: "11px",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontFamily: "var(--font-mono)",
                  cursor: isLast ? "default" : "pointer",
                }}
              >
                {crumb.name}
              </button>
            </div>
          );
        })}

        {currentPath && (
          <button
            onClick={() => handleNavigate("")}
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: "transparent",
              border: 0,
              color: "var(--color-muted)",
              fontSize: "11px",
              cursor: "pointer",
            }}
            title="Reset to repository root"
          >
            <RotateCcw size={12} />
            Root
          </button>
        )}
      </nav>

      {/* Main View Area */}
      {viewMode === "treemap" ? (
        <div style={{ position: "relative", minHeight: dimensions.height, background: "#0b0a0a", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--color-border)" }}>
          {isLoading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                background: "rgba(0,0,0,0.5)",
                zIndex: 10,
              }}
            >
              <span style={{ fontSize: "12px", color: "var(--color-muted)" }}>Updating hierarchy…</span>
            </div>
          )}

          {treemapLayout ? (
            <svg
              width={dimensions.width}
              height={dimensions.height}
              style={{ display: "block", userSelect: "none" }}
            >
              {/* Directory bounding groups */}
              {treemapLayout
                .descendants()
                .filter((d) => d.depth > 0 && d.data.type === "directory" && d.children && d.children.length > 0)
                .map((d) => {
                  const width = Math.max(0, d.x1 - d.x0);
                  const height = Math.max(0, d.y1 - d.y0);
                  if (width < 30 || height < 30) return null;

                  return (
                    <g key={d.data.path} transform={`translate(${d.x0}, ${d.y0})`}>
                      <rect
                        width={width}
                        height={height}
                        fill="rgba(255, 255, 255, 0.02)"
                        stroke="rgba(255, 255, 255, 0.12)"
                        strokeWidth={1}
                        rx={4}
                      />
                      {/* Directory Header Bar */}
                      <rect
                        width={width}
                        height={20}
                        fill="rgba(255, 255, 255, 0.05)"
                        rx={4}
                        style={{ cursor: "pointer" }}
                        onClick={() => handleNavigate(d.data.path)}
                      />
                      <text
                        x={6}
                        y={14}
                        fill="var(--color-muted)"
                        fontSize={10}
                        fontWeight={600}
                        fontFamily="var(--font-mono)"
                        style={{ pointerEvents: "none" }}
                      >
                        📁 {d.data.name} ({d.data.file_count} files)
                      </text>
                    </g>
                  );
                })}

              {/* Leaf nodes (Files) */}
              {treemapLayout.leaves().map((leaf) => {
                const width = Math.max(0, leaf.x1 - leaf.x0);
                const height = Math.max(0, leaf.y1 - leaf.y0);
                if (width < 2 || height < 2) return null;

                const node = leaf.data;
                const matchesSearch = searchQuery
                  ? node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    node.path.toLowerCase().includes(searchQuery.toLowerCase())
                  : true;

                const fillColor = getNodeColor(node, matchesSearch);
                const strokeColor = getNodeBorder(node, matchesSearch);
                const showLabel = width >= 45 && height >= 22;

                return (
                  <g
                    key={node.path}
                    transform={`translate(${leaf.x0}, ${leaf.y0})`}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => {
                      setHoveredNode(node);
                      const rect = containerRef.current?.getBoundingClientRect();
                      if (rect) {
                        setTooltipPos({
                          x: e.clientX - rect.left + 10,
                          y: e.clientY - rect.top + 10,
                        });
                      }
                    }}
                    onMouseMove={(e) => {
                      const rect = containerRef.current?.getBoundingClientRect();
                      if (rect) {
                        setTooltipPos({
                          x: e.clientX - rect.left + 10,
                          y: e.clientY - rect.top + 10,
                        });
                      }
                    }}
                    onMouseLeave={() => {
                      setHoveredNode(null);
                      setTooltipPos(null);
                    }}
                    onClick={() => {
                      // Navigate to parent directory of this file if not already there
                      const parts = node.path.split("/");
                      parts.pop();
                      const parentDir = parts.join("/");
                      if (parentDir !== currentPath) {
                        handleNavigate(parentDir);
                      }
                    }}
                  >
                    <rect
                      width={width}
                      height={height}
                      fill={fillColor}
                      rx={3}
                      style={{
                        outline: strokeColor,
                        outlineOffset: -1,
                        transition: "fill 0.15s ease, filter 0.15s ease",
                      }}
                    />

                    {showLabel && (
                      <text
                        x={4}
                        y={14}
                        fill="#ffffff"
                        fontSize={10}
                        fontWeight={600}
                        fontFamily="var(--font-mono)"
                        style={{ pointerEvents: "none" }}
                      >
                        {width > 80 && node.name.length > 14
                          ? `${node.name.slice(0, 12)}…`
                          : node.name}
                      </text>
                    )}

                    {showLabel && height >= 36 && width >= 55 && (
                      <text
                        x={4}
                        y={28}
                        fill="rgba(255, 255, 255, 0.75)"
                        fontSize={9}
                        fontFamily="var(--font-mono)"
                        style={{ pointerEvents: "none" }}
                      >
                        {node.total_churn.toLocaleString()} ch
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          ) : (
            <div style={{ display: "grid", placeItems: "center", height: "100%", padding: "40px" }}>
              <span style={{ color: "var(--color-muted)", fontSize: "13px" }}>No files match current filters.</span>
            </div>
          )}

          {/* Interactive Floating Hover Card / Tooltip */}
          {hoveredNode && tooltipPos && (
            <div
              style={{
                position: "absolute",
                left: Math.min(tooltipPos.x, dimensions.width - 240),
                top: Math.min(tooltipPos.y, dimensions.height - 180),
                width: "230px",
                padding: "12px 14px",
                background: "rgba(18, 16, 16, 0.95)",
                border: hoveredNode.bus_factor_risk
                  ? "1px solid var(--color-red)"
                  : "1px solid var(--color-border)",
                borderRadius: "8px",
                boxShadow: "0 10px 25px rgba(0,0,0,0.6)",
                pointerEvents: "none",
                zIndex: 50,
                backdropFilter: "blur(10px)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <FileCode size={14} style={{ color: hoveredNode.bus_factor_risk ? "var(--color-red)" : "var(--color-blue)" }} />
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "var(--color-text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {hoveredNode.name}
                </span>
              </div>

              <div
                style={{
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-muted)",
                  marginBottom: "8px",
                  wordBreak: "break-all",
                }}
              >
                {hoveredNode.path}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "8px", fontSize: "11px" }}>
                <div>
                  <span style={{ color: "var(--color-muted)", fontSize: "10px", display: "block" }}>Total Churn</span>
                  <strong style={{ fontFamily: "var(--font-mono)" }}>{hoveredNode.total_churn.toLocaleString()}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--color-muted)", fontSize: "10px", display: "block" }}>Add/Del</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px" }}>
                    <span style={{ color: "#10b981" }}>+{hoveredNode.insertions}</span> /{" "}
                    <span style={{ color: "var(--color-red)" }}>-{hoveredNode.deletions}</span>
                  </span>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "3px" }}>
                  <span style={{ color: "var(--color-muted)" }}>Top Owner:</span>
                  <strong style={{ color: "var(--color-text)" }}>{hoveredNode.top_contributor || "unknown"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "6px" }}>
                  <span style={{ color: "var(--color-muted)" }}>Share:</span>
                  <strong
                    style={{
                      color: hoveredNode.bus_factor_risk ? "var(--color-red)" : "var(--color-yellow)",
                    }}
                  >
                    {Math.round(hoveredNode.top_contributor_share * 100)}%
                  </strong>
                </div>

                {/* Progress bar of top contributor share */}
                <div
                  style={{
                    height: "4px",
                    background: "rgba(255,255,255,0.1)",
                    borderRadius: "999px",
                    overflow: "hidden",
                    marginBottom: "6px",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.round(hoveredNode.top_contributor_share * 100)}%`,
                      background: hoveredNode.bus_factor_risk ? "var(--color-red)" : "var(--color-yellow)",
                    }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  {hoveredNode.bus_factor_risk ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        color: "var(--color-red)",
                        fontSize: "10px",
                        fontWeight: 700,
                      }}
                    >
                      <ShieldAlert size={11} /> High Bus Factor Risk (≥80%)
                    </span>
                  ) : (
                    <span style={{ color: "var(--color-muted)", fontSize: "10px" }}>
                      Shared ({hoveredNode.contributor_count} contributors)
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Explorer Tree Table View */
        <ExplorerTable
          node={activeTree}
          searchQuery={searchQuery}
          riskOnly={riskOnly}
          onDrillDown={handleNavigate}
        />
      )}

      {/* Legend & Summary Footer */}
      <footer
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
          marginTop: "14px",
          paddingTop: "12px",
          borderTop: "1px solid var(--color-border)",
          fontSize: "11px",
          color: "var(--color-muted)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <span
              style={{
                width: "9px",
                height: "9px",
                borderRadius: "2px",
                background: "rgba(239, 35, 60, 0.85)",
              }}
            />
            High Risk (≥80% single author)
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <span
              style={{
                width: "9px",
                height: "9px",
                borderRadius: "2px",
                background: "rgba(255, 202, 91, 0.85)",
              }}
            />
            Moderate (50% – 79%)
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <span
              style={{
                width: "9px",
                height: "9px",
                borderRadius: "2px",
                background: "rgba(16, 185, 129, 0.75)",
              }}
            />
            Healthy Shared (&lt;50%)
          </span>
        </div>

        <div>
          Showing: <strong style={{ color: "var(--color-text)" }}>{activeTree.file_count}</strong> files (
          <strong style={{ color: "var(--color-red)" }}>{activeTree.at_risk_file_count}</strong> at risk) · Total churn:{" "}
          <strong style={{ color: "var(--color-text)", fontFamily: "var(--font-mono)" }}>
            {activeTree.total_churn.toLocaleString()}
          </strong>{" "}
          lines
        </div>
      </footer>
    </section>
  );
}

/**
 * Collapsible Drill-Down Explorer Table Component
 */
function ExplorerTable({
  node,
  searchQuery,
  riskOnly,
  onDrillDown,
}: {
  node: TreeNode;
  searchQuery: string;
  riskOnly: boolean;
  onDrillDown: (path: string) => void;
}) {
  const children = useMemo(() => {
    let items = node.children || [];
    if (riskOnly) {
      items = items.filter((item) => item.bus_factor_risk || item.at_risk_file_count > 0);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (item) => item.name.toLowerCase().includes(q) || item.path.toLowerCase().includes(q)
      );
    }
    return items;
  }, [node.children, riskOnly, searchQuery]);

  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: "8px" }}>
      <table style={{ width: "100%", minWidth: "680px", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-border)" }}>
            <th style={{ textAlign: "left", padding: "9px 12px", color: "var(--color-muted)", fontSize: "10px", textTransform: "uppercase" }}>Name</th>
            <th style={{ textAlign: "left", padding: "9px 12px", color: "var(--color-muted)", fontSize: "10px", textTransform: "uppercase" }}>Type</th>
            <th style={{ textAlign: "left", padding: "9px 12px", color: "var(--color-muted)", fontSize: "10px", textTransform: "uppercase" }}>Top Owner</th>
            <th style={{ textAlign: "left", padding: "9px 12px", color: "var(--color-muted)", fontSize: "10px", textTransform: "uppercase" }}>Concentration</th>
            <th style={{ textAlign: "left", padding: "9px 12px", color: "var(--color-muted)", fontSize: "10px", textTransform: "uppercase" }}>Total Churn</th>
            <th style={{ textAlign: "left", padding: "9px 12px", color: "var(--color-muted)", fontSize: "10px", textTransform: "uppercase" }}>Risk</th>
            <th style={{ textAlign: "right", padding: "9px 12px", color: "var(--color-muted)", fontSize: "10px", textTransform: "uppercase" }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {children.length ? (
            children.map((item) => {
              const isDir = item.type === "directory";
              return (
                <tr
                  key={item.path}
                  style={{
                    borderBottom: "1px solid var(--color-border)",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {isDir ? (
                        <Folder size={14} style={{ color: "var(--color-yellow)", flexShrink: 0 }} />
                      ) : (
                        <FileCode size={14} style={{ color: item.bus_factor_risk ? "var(--color-red)" : "var(--color-blue)", flexShrink: 0 }} />
                      )}
                      <span style={{ fontWeight: isDir ? 700 : 400, color: "var(--color-text)" }}>{item.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "8px 12px", color: "var(--color-muted)", fontSize: "11px" }}>
                    {isDir ? `${item.file_count} files` : "file"}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {item.top_contributor ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <span className="dashboard-avatar" style={{ width: "20px", height: "20px", fontSize: "8px" }}>
                          {item.top_contributor.slice(0, 2).toUpperCase()}
                        </span>
                        {item.top_contributor}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontWeight: 600,
                          color: item.bus_factor_risk ? "var(--color-red)" : "var(--color-text)",
                        }}
                      >
                        {Math.round(item.top_contributor_share * 100)}%
                      </span>
                      <div style={{ width: "40px", height: "4px", background: "rgba(255,255,255,0.1)", borderRadius: "99px", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.round(item.top_contributor_share * 100)}%`,
                            background: item.bus_factor_risk ? "var(--color-red)" : "var(--color-yellow)",
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)" }}>
                    {item.total_churn.toLocaleString()}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {item.bus_factor_risk ? (
                      <span style={{ color: "var(--color-red)", fontWeight: 600, fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <ShieldAlert size={12} /> High
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-muted)", fontSize: "11px" }}>Normal</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>
                    {isDir && (
                      <button
                        onClick={() => onDrillDown(item.path)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "3px 8px",
                          border: "1px solid var(--color-border)",
                          borderRadius: "4px",
                          background: "var(--color-surface)",
                          color: "var(--color-text)",
                          fontSize: "10px",
                          fontWeight: 600,
                        }}
                      >
                        Drill Down <ChevronRight size={11} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={7} style={{ padding: "24px", textAlign: "center", color: "var(--color-muted)" }}>
                No entries match the current filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
