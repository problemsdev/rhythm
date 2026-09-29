import type { CheckInfo, PrInfo, RepoStatus } from "../model"

export type RowKind = "error" | "main" | "check" | "pr" | "no-prs" | "more-prs" | "alerts"

/** One selectable line inside a repo card; every row is a jump-off point. */
export interface Row {
  kind: RowKind
  url: string
  pr?: PrInfo
  check?: CheckInfo
}

export function rowsFor(s: RepoStatus, checksExpanded = false): Row[] {
  if (s.error) return [{ kind: "error", url: s.url }]
  const rows: Row[] = []
  if (s.main) {
    rows.push({ kind: "main", url: `${s.url}/commits/${s.main.branch}` })
    if (checksExpanded) {
      for (const check of s.main.checks) rows.push({ kind: "check", url: check.url, check })
    }
  }
  if (s.prs.length === 0) {
    rows.push({ kind: "no-prs", url: `${s.url}/pulls` })
  } else {
    for (const pr of s.prs) rows.push({ kind: "pr", url: pr.url, pr })
    if (s.prTotal > s.prs.length) rows.push({ kind: "more-prs", url: `${s.url}/pulls` })
  }
  rows.push({ kind: "alerts", url: `${s.url}/security/dependabot` })
  return rows
}
