import { useMemo, useState } from "react";
import type { HeatmapResponse } from "../api/client";

interface Props {
  data: HeatmapResponse;
}

const MAX_AUTHORS = 15;
const MAX_FILES = 40;
const CELL_MIN_PX = 28;

function basename(path: string) {
  return path.split("/").pop() ?? path;
}

export function HeatmapPanel({ data }: Props) {
  const [tooltip, setTooltip] = useState<{
    file: string;
    author: string;
    churn: number;
    x: number;
    y: number;
  } | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Slice to visible window
  const visibleAuthors = data.authors.slice(0, MAX_AUTHORS);
  const visibleFiles = showAll ? data.files.slice(0, MAX_FILES) : data.files.slice(0, 20);

  // Build lookup: {file -> {author -> churn}}
  const lookup = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const cell of data.cells) {
      if (!map[cell.file]) map[cell.file] = {};
      map[cell.file][cell.author] = cell.churn;
    }
    return map;
  }, [data.cells]);

  // Find max churn for scaling
  const maxChurn = useMemo(() => {
    return Math.max(1, ...data.cells.map((c) => c.churn));
  }, [data.cells]);

  function intensity(churn: number): number {
    return churn / maxChurn;
  }

  function cellColor(churn: number): string {
    const alpha = Math.max(0.06, intensity(churn));
    // Moss green: hsl(150, 60%, 40%)
    const lightness = Math.round(80 - alpha * 55);
    const saturation = Math.round(30 + alpha * 50);
    return `hsl(148, ${saturation}%, ${lightness}%)`;
  }

  if (!data.files.length || !data.authors.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-white/10 bg-white/5">
        <p className="text-sm text-[var(--color-slate)]">
          No file churn data available yet.
        </p>
      </div>
    );
  }

  const cellSize = Math.max(CELL_MIN_PX, Math.floor(560 / visibleAuthors.length));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-[var(--color-leaf)]">
          Contributor Heatmap
        </h2>
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-[var(--color-slate)]">
          Top {visibleAuthors.length} contributors · {visibleFiles.length} files
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0d1117] p-4">
        {/* Tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none fixed z-50 rounded-lg border border-white/20 bg-[#1c2333] px-3 py-2 text-xs shadow-2xl"
            style={{ left: tooltip.x + 14, top: tooltip.y - 40 }}
          >
            <p className="font-semibold text-white">{basename(tooltip.file)}</p>
            <p className="text-[var(--color-slate)]">
              {tooltip.author}:{" "}
              <span className="text-[var(--color-leaf)] font-bold">
                {tooltip.churn.toLocaleString()} lines
              </span>
            </p>
          </div>
        )}

        <table className="border-separate border-spacing-[2px]" style={{ minWidth: cellSize * visibleAuthors.length + 200 }}>
          <thead>
            <tr>
              {/* corner */}
              <th className="w-[190px] pr-3 text-right text-xs font-normal text-[var(--color-slate)]">
                file / author →
              </th>
              {visibleAuthors.map((author) => (
                <th
                  key={author}
                  className="pb-2 text-center align-bottom"
                  style={{ width: cellSize, maxWidth: cellSize }}
                  title={author}
                >
                  <span
                    className="block truncate text-[10px] text-[var(--color-slate)]"
                    style={{
                      writingMode: "vertical-rl",
                      transform: "rotate(180deg)",
                      maxHeight: 80,
                    }}
                  >
                    {author}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleFiles.map((file) => (
              <tr key={file}>
                <td
                  className="pr-3 text-right text-[11px] text-[var(--color-slate)] hover:text-white transition-colors"
                  title={file}
                  style={{ maxWidth: 190 }}
                >
                  <span className="block truncate" style={{ direction: "rtl", unicodeBidi: "plaintext" }}>
                    {file}
                  </span>
                </td>
                {visibleAuthors.map((author) => {
                  const churn = lookup[file]?.[author] ?? 0;
                  return (
                    <td
                      key={author}
                      onMouseEnter={(e) =>
                        churn > 0 &&
                        setTooltip({
                          file,
                          author,
                          churn,
                          x: e.clientX,
                          y: e.clientY,
                        })
                      }
                      onMouseMove={(e) =>
                        churn > 0 &&
                        setTooltip((prev) =>
                          prev ? { ...prev, x: e.clientX, y: e.clientY } : prev
                        )
                      }
                      onMouseLeave={() => setTooltip(null)}
                      style={{
                        width: cellSize,
                        height: CELL_MIN_PX,
                        backgroundColor: churn > 0 ? cellColor(churn) : "rgba(255,255,255,0.03)",
                        cursor: churn > 0 ? "crosshair" : "default",
                        borderRadius: 4,
                        transition: "background-color 0.15s ease",
                      }}
                      title={churn > 0 ? `${author} — ${churn.toLocaleString()} lines` : undefined}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Legend */}
        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs text-[var(--color-slate)]">Less</span>
          {[0.06, 0.25, 0.5, 0.75, 1].map((v) => (
            <div
              key={v}
              className="h-4 w-4 rounded-sm"
              style={{ backgroundColor: cellColor(v * maxChurn) }}
            />
          ))}
          <span className="text-xs text-[var(--color-slate)]">More</span>
          {data.files.length > 20 && (
            <button
              onClick={() => setShowAll((s) => !s)}
              className="ml-auto text-xs text-[var(--color-moss)] underline-offset-2 hover:underline transition-all"
            >
              {showAll ? "Show fewer files" : `Show all ${Math.min(data.files.length, MAX_FILES)} files`}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
