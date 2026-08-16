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

export interface HeatmapCell {
  file: string;
  author: string;
  churn: number;
}

export interface HeatmapResponse {
  files: string[];
  authors: string[];
  cells: HeatmapCell[];
}

export function getHeatmap(id: number) {
  return request<HeatmapResponse>(`/repositories/${id}/heatmap/`);
}

// ── Repositories list ────────────────────────────────
export function getRepositories() {
  return request<Repository[]>("/repositories/");
}

// ── Code metrics ─────────────────────────────────────
export interface CodeMetrics {
  total_loc: number;
  total_classes: number;
  total_functions: number;
  total_methods: number;
  total_imports: number;
  parsed_files: number;
}
export function getCodeMetrics(id: number) {
  return request<CodeMetrics>(`/repositories/${id}/code-metrics/`);
}

// ── Source files ──────────────────────────────────────
export interface SourceFile {
  id: number;
  commit_hash: string;
  file_path: string;
  status: string;
  previous_path: string;
  language: string;
  hash: string;
  size: number;
  is_binary: boolean;
  is_skipped_size: boolean;
  created_at: string;
  updated_at: string;
}
export interface SourceFileDetail extends SourceFile {
  content: string;
}
export interface PaginatedSourceFiles {
  next: string | null;
  previous: string | null;
  results: SourceFile[];
}
export function getFiles(id: number, cursor?: string | null) {
  const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request<PaginatedSourceFiles>(`/repositories/${id}/files/${q}`);
}
export function getFileDetail(id: number, fileId: number) {
  return request<SourceFileDetail>(`/repositories/${id}/files/${fileId}/`);
}

// ── Symbols ───────────────────────────────────────────
export interface CodeSymbol {
  id: number;
  symbol_type: string;
  name: string;
  qualified_name: string;
  signature: string;
  start_line: number;
  end_line: number;
  start_column: number;
  end_column: number;
  parent: number | null;
}
export interface PaginatedSymbols {
  next: string | null;
  previous: string | null;
  results: CodeSymbol[];
}
export function getFileSymbols(repoId: number, fileId: number) {
  return request<PaginatedSymbols>(`/repositories/${repoId}/files/${fileId}/symbols/`);
}

// ── Semantic search ───────────────────────────────────
export interface SemanticResult {
  id: number;
  file_path: string | null;
  symbol_name: string;
  chunk_type: string;
  start_line: number | null;
  end_line: number | null;
  similarity: number;
  chunk_text_snippet: string;
}
export interface SemanticSearchResponse {
  results: SemanticResult[];
}
export function semanticSearch(id: number, q: string, topK = 20) {
  return request<SemanticSearchResponse>(
    `/repositories/${id}/semantic-search/?q=${encodeURIComponent(q)}&top_k=${topK}`
  );
}
