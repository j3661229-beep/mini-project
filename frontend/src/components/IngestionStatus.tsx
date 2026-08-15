import type { RepoStatusResponse } from "../api/client";

interface IngestionStatusProps {
  status: RepoStatusResponse | null;
  error?: string | null;
}

const LABELS: Record<string, string> = {
  pending: "Queued",
  processing: "Cloning & analyzing",
  complete: "Ready",
  failed: "Failed",
};

export function IngestionStatus({ status, error }: IngestionStatusProps) {
  const s = status?.status ?? "pending";

  return (
    <div className="animate-fade-up rounded-xl border border-[var(--color-moss)]/15 bg-white/70 px-6 py-5 backdrop-blur">
      <div className="flex items-center gap-3">
        {s === "processing" || s === "pending" ? (
          <span className="animate-pulse-soft h-2.5 w-2.5 rounded-full bg-[var(--color-amber)]" />
        ) : s === "complete" ? (
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-mint)]" />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-coral)]" />
        )}
        <p className="font-display text-lg font-semibold">{LABELS[s] ?? s}</p>
      </div>
      <p className="mt-2 text-sm text-[var(--color-slate)]">
        {s === "processing" || s === "pending"
          ? "Ingestion runs in the background — commit graph, bus factor, and review network are being computed."
          : s === "complete"
            ? "Analysis complete. Loading dashboard…"
            : status?.error_message || error || "Something went wrong."}
      </p>
    </div>
  );
}
