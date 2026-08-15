import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createRepository } from "../api/client";
import { RepoInput } from "../components/RepoInput";

export function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      const repo = await createRepository(url);
      navigate(`/dashboard/${repo.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start ingestion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-6 pb-16 pt-10">
      <nav className="mb-16 flex items-center justify-between">
        <span className="font-display text-lg font-bold tracking-tight text-[var(--color-moss)]">
          GitPulse
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-slate)]">
          v1 · public repos
        </span>
      </nav>

      <section className="animate-fade-up flex flex-1 flex-col justify-center pb-20">
        <p className="font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl">
          GitPulse
        </p>
        <h1 className="mt-6 max-w-lg text-xl font-medium leading-snug text-[var(--color-moss)] sm:text-2xl">
          See where the team is fragile — not just what commits happened.
        </h1>
        <p className="mt-4 max-w-md text-[var(--color-slate)]">
          Commit-graph animation meets PR review-network analysis: bus-factor risk and approval
          bottlenecks in one visual audit.
        </p>
        <div className="mt-10">
          <RepoInput onSubmit={handleSubmit} loading={loading} />
          {error && <p className="mt-3 text-sm text-[var(--color-coral)]">{error}</p>}
        </div>
      </section>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[42vh] opacity-40"
        style={{
          background:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cg fill='none' stroke='%231a3a2a' stroke-opacity='0.15'%3E%3Ccircle cx='10' cy='40' r='3'/%3E%3Ccircle cx='40' cy='20' r='3'/%3E%3Ccircle cx='70' cy='50' r='3'/%3E%3Cpath d='M10 40C25 40 25 20 40 20M40 20C55 20 55 50 70 50'/%3E%3C/g%3E%3C/svg%3E\")",
          maskImage: "linear-gradient(to top, black, transparent)",
        }}
        aria-hidden
      />
    </div>
  );
}
