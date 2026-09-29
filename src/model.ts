import type { RepoConfig } from "./config"

export type CiState = "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED"

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
export const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

export interface PrInfo {
  number: number
  title: string
  url: string
  author: string
  isDraft: boolean
  updatedAt: string
  ci: CiState | null
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null
}

export type CheckState = "SUCCESS" | "FAILURE" | "RUNNING" | "QUEUED" | "SKIPPED" | "CANCELLED" | "NEUTRAL"

/** One check run (GitHub Actions job or commit status) on the main branch head. */
export interface CheckInfo {
  name: string
  state: CheckState
  startedAt: string | null
  completedAt: string | null
  url: string
}

export interface MainStatus {
  branch: string
  ci: CiState | null
  message: string
  committedDate: string
  oid: string
  checks: CheckInfo[]
}

export interface RepoStatus {
  config: RepoConfig
  /** owner/name as reported by GitHub, or from config if the fetch failed */
  nameWithOwner: string
  url: string
  /** star count, only for public repos (null for private or failed fetches) */
  stars: number | null
  main: MainStatus | null
  prs: PrInfo[]
  prTotal: number
  /** open dependabot alert counts by severity; null when inaccessible */
  alerts: Record<Severity, number> | null
  alertsTotal: number | null
  /** set when the whole repo failed to load */
  error?: string
}

/** Worst-first health of a repo, used for border colors and sorting cues. */
export type Health = "failing" | "attention" | "busy" | "calm"

export function repoHealth(s: RepoStatus): Health {
  if (s.error) return "failing"
  if (s.main?.ci === "FAILURE" || s.main?.ci === "ERROR") return "failing"
  if ((s.alerts?.CRITICAL ?? 0) > 0 || (s.alerts?.HIGH ?? 0) > 0) return "attention"
  if (s.prs.some((p) => p.ci === "FAILURE" || p.ci === "ERROR")) return "attention"
  if (s.prTotal > 0 || (s.alertsTotal ?? 0) > 0) return "busy"
  return "calm"
}
