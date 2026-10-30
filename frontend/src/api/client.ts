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

export interface IngestionProgress {
  processed?: number;
  total?: number;
  detail?: string;
}

export interface RepoStatusResponse {
  id: number;
  status: RepoStatus;
  ingestion_stage: string;
  ingestion_progress: IngestionProgress;
  ingestion_stage_started_at: string | null;
  ingestion_heartbeat_at: string | null;
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

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Repositories list ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
export function getRepositories() {
  return request<Repository[]>("/repositories/");
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Code metrics ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
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

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Source files ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
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

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Symbols ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
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
  language?: string;
  file_path?: string | null;
  file_id?: number | null;
}
export interface PaginatedSymbols {
  next: string | null;
  previous: string | null;
  results: CodeSymbol[];
}
export function getSymbols(
  repoId: number,
  opts?: { cursor?: string | null; type?: string; q?: string }
) {
  const params = new URLSearchParams();
  if (opts?.cursor) params.set("cursor", opts.cursor);
  if (opts?.type) params.set("type", opts.type);
  if (opts?.q) params.set("q", opts.q);
  const qs = params.toString();
  return request<PaginatedSymbols>(`/repositories/${repoId}/symbols/${qs ? `?${qs}` : ""}`);
}
export function getFileSymbols(repoId: number, fileId: number) {
  return request<PaginatedSymbols>(`/repositories/${repoId}/files/${fileId}/symbols/`);
}

// ── Security ─────────────────────────────────────────────────────
export interface SecurityFinding {
  id: number;
  file_path: string;
  category: string;
  severity: string;
  rule_id: string;
  title: string;
  description: string;
  line_number: number;
  evidence: string;
  created_at: string;
}
export interface SecuritySummary {
  total_findings: number;
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
  files_affected: number;
}
export interface SecurityResponse {
  summary: SecuritySummary;
  findings: SecurityFinding[];
}
export function getSecurity(
  repoId: number,
  opts?: { severity?: string; category?: string; q?: string; refresh?: boolean }
) {
  const params = new URLSearchParams();
  if (opts?.severity) params.set("severity", opts.severity);
  if (opts?.category) params.set("category", opts.category);
  if (opts?.q) params.set("q", opts.q);
  if (opts?.refresh) params.set("refresh", "1");
  const qs = params.toString();
  return request<SecurityResponse>(
    `/repositories/${repoId}/security/${qs ? `?${qs}` : ""}`
  );
}
export function refreshSecurity(repoId: number) {
  return request<SecurityResponse>(`/repositories/${repoId}/security/`, {
    method: "POST",
  });
}

// ── Risk prediction ──────────────────────────────────────────────
export interface RiskyFile {
  file_path: string;
  risk_score: number;
  risk_level: string;
  reasons: string[];
  top_contributor: string;
  top_contributor_share: number;
  total_churn: number;
  security_count: number;
  recent_commits: number;
}
export interface RiskyPullRequest {
  pr_number: number;
  author_login: string;
  state: string;
  title_hint: string;
  files_changed: number;
  additions: number;
  deletions: number;
  risk_score: number;
  risk_level: string;
  reasons: string[];
}
export interface RiskPrediction {
  overall_risk_score: number;
  overall_risk_level: string;
  summary: {
    files_scored: number;
    critical_files: number;
    high_files: number;
    medium_files: number;
    prs_scored: number;
    high_risk_prs: number;
  };
  risky_files: RiskyFile[];
  risky_pull_requests: RiskyPullRequest[];
  method: string;
}
export function getRiskPrediction(repoId: number) {
  return request<RiskPrediction>(`/repositories/${repoId}/risk-prediction/`);
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Semantic search ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
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


export function getRiskReportUrl(id: number) {
  return `${API_BASE}/repositories/${id}/risk-report/`;
}

export interface ActivityPoint { day: string; commits: number; contributors: number; }
export interface ActivityContributor { author_name: string; commits: number; }
export interface ActivityResponse { days: number; start_date: string | null; end_date: string | null; total_commits: number; active_days: number; peak_commits: number; series: ActivityPoint[]; contributors: ActivityContributor[]; }
export interface DirectoryOwnership { directory: string; top_contributor: string; top_contributor_share: number; contributor_count: number; bus_factor: number; total_churn: number; affected_file_count: number; bus_factor_risk: boolean; }
export interface DirectoryOwnershipResponse { depth: number; results: DirectoryOwnership[]; }
export function getActivity(id: number, days = 365, contributor?: string) { const query = new URLSearchParams({ days: String(days) }); if (contributor) query.set("contributor", contributor); return request<ActivityResponse>(`/repositories/${id}/activity/?${query}`); }
export function getDirectoryOwnership(id: number, depth = 1) { return request<DirectoryOwnershipResponse>(`/repositories/${id}/directory-ownership/?depth=${depth}`); }
export function getRiskReportPdfUrl(id: number) { return `${API_BASE}/repositories/${id}/risk-report/pdf/`; }

export interface TreeNode {
  name: string;
  path: string;
  type: "directory" | "file";
  value: number;
  total_churn: number;
  insertions: number;
  deletions: number;
  file_count: number;
  at_risk_file_count: number;
  top_contributor: string;
  top_contributor_share: number;
  contributor_count: number;
  bus_factor_risk: boolean;
  commit_count?: number;
  children?: TreeNode[];
}

export interface TreeBreadcrumb {
  name: string;
  path: string;
}

export interface TreeSummary {
  root_path: string;
  total_files: number;
  at_risk_files: number;
  total_churn: number;
  risk_ratio: number;
}

export interface DirectoryTreeResponse {
  tree: TreeNode;
  breadcrumbs: TreeBreadcrumb[];
  summary: TreeSummary;
}

export function getDirectoryTree(id: number, path = "", depth = 10, minChurn = 0) {
  const query = new URLSearchParams();
  if (path) query.set("path", path);
  if (depth) query.set("depth", String(depth));
  if (minChurn) query.set("min_churn", String(minChurn));
  const qs = query.toString() ? `?${query.toString()}` : "";
  return request<DirectoryTreeResponse>(`/repositories/${id}/directory-tree/${qs}`);
}

// ── Generative RAG & AI Assistant ────────────────────────────────
export interface RAGSource {
  id: number;
  file_path: string;
  symbol_name: string;
  chunk_type: string;
  start_line: number;
  end_line: number;
  similarity: number;
  snippet: string;
}

export interface RAGMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RAGResponse {
  answer: string;
  sources: RAGSource[];
  repository: {
    id: number;
    owner: string;
    name: string;
    github_url?: string;
  };
  model: string;
}

export interface RAGStatus {
  available: boolean;
  has_api_key: boolean;
  llm_model: string;
  embedding_model: string;
  total_chunks: number;
  embedded_chunks: number;
  total_symbols: number;
}

export function askRepoChat(
  id: number,
  message: string,
  history: RAGMessage[] = [],
  topK = 6
): Promise<RAGResponse> {
  return request<RAGResponse>(`/repositories/${id}/chat/`, {
    method: "POST",
    body: JSON.stringify({ message, history, top_k: topK }),
  });
}

export function getChatStatus(id: number): Promise<RAGStatus> {
  return request<RAGStatus>(`/repositories/${id}/chat/`);
}

// ── Pull Request Intelligence & AI Review ────────────────────────
export interface PRReview {
  id: number;
  reviewer_login: string;
  review_state: string;
  github_review_id?: number | null;
}

export interface PRFile {
  id: number;
  file_path: string;
  status: string;
  additions: number;
  deletions: number;
  is_truncated: boolean;
  patch?: string;
}

export interface PRRiskAssessment {
  file_path: string;
  top_contributor: string;
  top_contributor_share: number;
  bus_factor_risk: boolean;
  warning: string;
}

export interface PullRequestSummary {
  id: number;
  pr_number: number;
  author_login: string;
  state: "open" | "closed" | "merged" | string;
  created_at: string;
  merged_at: string | null;
  files_count: number;
  total_additions: number;
  total_deletions: number;
  review_count: number;
  latest_review_state: string;
}

export interface PullRequestsResponse {
  next: string | null;
  previous: string | null;
  results: PullRequestSummary[];
}

export interface PullRequestDetail {
  id: number;
  pr_number: number;
  author_login: string;
  state: "open" | "closed" | "merged" | string;
  created_at: string;
  merged_at: string | null;
  files: PRFile[];
  reviews: PRReview[];
  total_files: number;
  total_additions: number;
  total_deletions: number;
  risk_assessment: PRRiskAssessment[];
}

export interface AIPRReviewResponse {
  pr_number: number;
  verdict: "APPROVE" | "COMMENT" | "REQUEST_CHANGES";
  review: string;
  model: string;
  files_analyzed: number;
  total_additions: number;
  total_deletions: number;
  ownership_risks: Array<{
    file_path: string;
    top_contributor: string;
    top_contributor_share: number;
    bus_factor_risk: boolean;
  }>;
}

export function getPullRequests(
  repoId: number,
  params?: { state?: string; search?: string }
): Promise<PullRequestsResponse> {
  const query = new URLSearchParams();
  if (params?.state && params.state !== "all") query.set("state", params.state);
  if (params?.search) query.set("search", params.search);
  const qStr = query.toString();
  return request<PullRequestsResponse>(
    `/repositories/${repoId}/pull-requests/${qStr ? `?${qStr}` : ""}`
  );
}

export function getPullRequestDetail(
  repoId: number,
  prNumber: number
): Promise<PullRequestDetail> {
  return request<PullRequestDetail>(`/repositories/${repoId}/pull-requests/${prNumber}/`);
}

export function generateAIPRReview(
  repoId: number,
  prNumber: number
): Promise<AIPRReviewResponse> {
  return request<AIPRReviewResponse>(
    `/repositories/${repoId}/pull-requests/${prNumber}/review/`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

