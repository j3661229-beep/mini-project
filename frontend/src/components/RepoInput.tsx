import { FormEvent, useState } from "react";

interface RepoInputProps {
  onSubmit: (url: string) => Promise<void>;
  loading?: boolean;
}

const GITHUB_RE =
  /^(https?:\/\/)?(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/i;

export function RepoInput({ onSubmit, loading }: RepoInputProps) {
  const [url, setUrl] = useState("https://github.com/pallets/click");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!GITHUB_RE.test(trimmed.replace(/\.git$/, ""))) {
      setLocalError("Enter a valid public GitHub URL (github.com/owner/repo).");
      return;
    }
    setLocalError(null);
    await onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl">
      <label htmlFor="repo-url" className="mb-2 block text-sm font-medium text-[var(--color-slate)]">
        Public GitHub repository
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="repo-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          className="min-w-0 flex-1 rounded-lg border border-[var(--color-moss)]/20 bg-white/80 px-4 py-3 font-mono text-sm outline-none ring-[var(--color-mint)] transition focus:ring-2"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-[var(--color-moss)] px-5 py-3 text-sm font-semibold text-[var(--color-foam)] transition hover:bg-[var(--color-leaf)] disabled:opacity-60"
        >
          {loading ? "Starting…" : "Analyze"}
        </button>
      </div>
      {localError && <p className="mt-2 text-sm text-[var(--color-coral)]">{localError}</p>}
    </form>
  );
}
