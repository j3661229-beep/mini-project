const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || body.github_url?.[0] || JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export type RepoStatus = "pending" | "processing" | "complete" | "failed";

export interface Repository {
  id: number;
  github_url: string;
  owner: string;
  name: string;
  status: RepoStatus;
  error_message: string | null;
  last_ingested_at: string | null;
  commit_cap_reached: boolean;
  created_at: string;
}

export interface RepoStatusResponse {
  id: number;
  status: RepoStatus;
  error_message: string | null;
  commit_cap_reached: boolean;
}

export interface Commit {
  id: number;
  hash: string;
  author_name: string;
  author_email: string;
  committed_at: string;
  parent_hashes: string[];
  message: string;
  branch: string;
}

export interface PaginatedCommits {
  next: string | null;
  previous: string | null;
  results: Commit[];
}

export interface FileOwnership {
  file_path: string;
  top_contributor: string;
  top_contributor_share: number;
  bus_factor_risk: boolean;
  contributor_count: number;
  total_churn: number;
}

export interface ReviewEdge {
  reviewer: string;
  author: string;
  count: number;
}

export interface ReviewNode {
  login: string;
  in_degree: number;
  out_degree: number;
  is_bottleneck: boolean;
}

export interface ReviewGraph {
  edges: ReviewEdge[];
  nodes: ReviewNode[];
}

export interface Summary {
  owner: string;
  name: string;
  status: RepoStatus;
  commit_count: number;
  contributor_count: number;
  pr_count: number;
  at_risk_file_count: number;
  bottleneck_count: number;
  commit_cap_reached: boolean;
  last_ingested_at: string | null;
}

export function createRepository(githubUrl: string) {
  return request<Repository>("/repositories/", {
    method: "POST",
    body: JSON.stringify({ github_url: githubUrl }),
  });
}

export function getStatus(id: number) {
  return request<RepoStatusResponse>(`/repositories/${id}/status/`);
}

export function getSummary(id: number) {
  return request<Summary>(`/repositories/${id}/summary/`);
}

export function getCommits(id: number, cursor?: string | null) {
  const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request<PaginatedCommits>(`/repositories/${id}/commits/${q}`);
}

export async function getAllCommits(id: number, maxPages = 30): Promise<Commit[]> {
  const all: Commit[] = [];
  let cursor: string | null | undefined = undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await getCommits(id, cursor);
    all.push(...page.results);
    if (!page.next) break;
    const url = new URL(page.next, window.location.origin);
    cursor = url.searchParams.get("cursor");
  }
  return all;
}

export function getOwnership(id: number, riskOnly = false) {
  const q = riskOnly ? "?risk_only=true" : "";
  return request<FileOwnership[]>(`/repositories/${id}/ownership/${q}`);
}

export function getReviews(id: number) {
  return request<ReviewGraph>(`/repositories/${id}/reviews/`);
}
