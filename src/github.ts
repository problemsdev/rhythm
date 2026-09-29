import type { RepoConfig } from "./config"
import { SEVERITIES, type RepoStatus, type Severity, type PrInfo, type CiState, type CheckInfo, type CheckState } from "./model"

const API = "https://api.github.com/graphql"
const PR_LIMIT = 10

export function resolveToken(): string {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim()
  const proc = Bun.spawnSync(["gh", "auth", "token"], { stdout: "pipe", stderr: "pipe" })
  const token = proc.stdout.toString().trim()
  if (proc.exitCode === 0 && token) return token
  throw new Error(
    "no GitHub token: set GITHUB_TOKEN or log in with `gh auth login`.\n" + proc.stderr.toString().trim(),
  )
}

const REPO_FRAGMENT = `
fragment repoFields on Repository {
  nameWithOwner
  url
  isPrivate
  stargazerCount
  defaultBranchRef {
    name
    target {
      ... on Commit {
        oid
        messageHeadline
        committedDate
        statusCheckRollup {
          state
          contexts(first: 100) {
            nodes {
              __typename
              ... on CheckRun {
                name
                status
                conclusion
                startedAt
                completedAt
                detailsUrl
                checkSuite { workflowRun { workflow { name } } }
              }
              ... on StatusContext {
                context
                state
                targetUrl
              }
            }
          }
        }
      }
    }
  }
  pullRequests(states: OPEN, first: ${PR_LIMIT}, orderBy: { field: UPDATED_AT, direction: DESC }) {
    totalCount
    nodes {
      number
      title
      url
      isDraft
      updatedAt
      author { login }
      reviewDecision
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
    }
  }
  vulnerabilityAlerts(states: OPEN, first: 100) {
    totalCount
    nodes { securityVulnerability { severity } }
  }
}`

function buildQuery(repos: RepoConfig[]): string {
  const fields = repos
    .map((r, i) => `r${i}: repository(owner: ${JSON.stringify(r.owner)}, name: ${JSON.stringify(r.name)}) { ...repoFields }`)
    .join("\n  ")
  return `query {\n  ${fields}\n}\n${REPO_FRAGMENT}`
}

// Shape of one aliased repository in the GraphQL response. Fields that can be
// nulled out by field-level errors (e.g. missing security permissions) are
// marked nullable; keep this in sync with REPO_FRAGMENT.
interface GqlStatusRollup {
  state: CiState
}

type GqlCheckContext =
  | {
      __typename: "CheckRun"
      name: string
      status: string
      conclusion: string | null
      startedAt: string | null
      completedAt: string | null
      detailsUrl: string | null
      checkSuite: { workflowRun: { workflow: { name: string } | null } | null } | null
    }
  | {
      __typename: "StatusContext"
      context: string
      state: CiState
      targetUrl: string | null
    }

interface GqlMainRollup extends GqlStatusRollup {
  contexts: { nodes: (GqlCheckContext | null)[] | null } | null
}

interface GqlPullRequest {
  number: number
  title: string
  url: string
  isDraft: boolean
  updatedAt: string
  author: { login: string } | null
  reviewDecision: PrInfo["reviewDecision"]
  commits: { nodes: { commit: { statusCheckRollup: GqlStatusRollup | null } }[] | null } | null
}

interface GqlRepository {
  nameWithOwner: string
  url: string
  isPrivate: boolean
  stargazerCount: number
  defaultBranchRef: {
    name: string
    target: {
      oid: string
      messageHeadline: string
      committedDate: string
      statusCheckRollup: GqlMainRollup | null
    } | null
  } | null
  pullRequests: { totalCount: number; nodes: GqlPullRequest[] | null } | null
  vulnerabilityAlerts: {
    totalCount: number
    nodes: { securityVulnerability: { severity: string } | null }[] | null
  } | null
}

function toCiState(rollup: GqlStatusRollup | null | undefined): CiState | null {
  return rollup?.state ?? null
}

function toCheckState(status: string, conclusion: string | null): CheckState {
  if (status !== "COMPLETED") return status === "IN_PROGRESS" ? "RUNNING" : "QUEUED"
  switch (conclusion) {
    case "SUCCESS": return "SUCCESS"
    case "SKIPPED": return "SKIPPED"
    case "CANCELLED": return "CANCELLED"
    case "NEUTRAL":
    case "STALE": return "NEUTRAL"
    default: return "FAILURE" // FAILURE, TIMED_OUT, ACTION_REQUIRED, STARTUP_FAILURE
  }
}

function statusContextState(state: CiState): CheckState {
  switch (state) {
    case "SUCCESS": return "SUCCESS"
    case "FAILURE":
    case "ERROR": return "FAILURE"
    default: return "RUNNING" // PENDING, EXPECTED
  }
}

/** Needs-attention-first: failures, then in-flight, then the finished rest. */
const CHECK_ORDER: Record<CheckState, number> = {
  FAILURE: 0, RUNNING: 1, QUEUED: 2, SUCCESS: 3, NEUTRAL: 4, CANCELLED: 5, SKIPPED: 6,
}

function parseChecks(rollup: GqlMainRollup | null, fallbackUrl: string): CheckInfo[] {
  const checks: CheckInfo[] = []
  for (const node of rollup?.contexts?.nodes ?? []) {
    if (!node) continue
    if (node.__typename === "CheckRun") {
      const workflow = node.checkSuite?.workflowRun?.workflow?.name
      checks.push({
        name: workflow && workflow !== node.name ? `${workflow} / ${node.name}` : node.name,
        state: toCheckState(node.status, node.conclusion),
        startedAt: node.startedAt,
        completedAt: node.completedAt,
        url: node.detailsUrl ?? fallbackUrl,
      })
    } else if (node.__typename === "StatusContext") {
      checks.push({
        name: node.context,
        state: statusContextState(node.state),
        startedAt: null,
        completedAt: null,
        url: node.targetUrl ?? fallbackUrl,
      })
    }
  }
  return checks.sort((a, b) => CHECK_ORDER[a.state] - CHECK_ORDER[b.state])
}

function parseRepo(config: RepoConfig, node: GqlRepository): RepoStatus {
  const branch = node.defaultBranchRef?.name ?? "main"
  const commit = node.defaultBranchRef?.target
  const url = node.url ?? `https://github.com/${config.owner}/${config.name}`

  const prs: PrInfo[] = (node.pullRequests?.nodes ?? []).map((pr): PrInfo => ({
    number: pr.number,
    title: pr.title,
    url: pr.url,
    author: pr.author?.login ?? "ghost",
    isDraft: pr.isDraft,
    updatedAt: pr.updatedAt,
    ci: toCiState(pr.commits?.nodes?.[0]?.commit?.statusCheckRollup),
    reviewDecision: pr.reviewDecision ?? null,
  }))

  let alerts: Record<Severity, number> | null = null
  let alertsTotal: number | null = null
  if (node.vulnerabilityAlerts) {
    alerts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
    for (const a of node.vulnerabilityAlerts.nodes ?? []) {
      const sev = a?.securityVulnerability?.severity as Severity | undefined
      if (sev && SEVERITIES.includes(sev)) alerts[sev]++
    }
    alertsTotal = node.vulnerabilityAlerts.totalCount ?? 0
  }

  return {
    config,
    nameWithOwner: node.nameWithOwner ?? `${config.owner}/${config.name}`,
    url,
    stars: node.isPrivate === false ? (node.stargazerCount ?? null) : null,
    main: commit
      ? {
          branch,
          ci: toCiState(commit.statusCheckRollup),
          message: commit.messageHeadline ?? "",
          committedDate: commit.committedDate ?? "",
          oid: commit.oid ?? "",
          checks: parseChecks(commit.statusCheckRollup, `${url}/commit/${commit.oid}/checks`),
        }
      : null,
    prs,
    prTotal: node.pullRequests?.totalCount ?? prs.length,
    alerts,
    alertsTotal,
  }
}

function errorStatus(config: RepoConfig, message: string): RepoStatus {
  return {
    config,
    nameWithOwner: `${config.owner}/${config.name}`,
    url: `https://github.com/${config.owner}/${config.name}`,
    stars: null,
    main: null,
    prs: [],
    prTotal: 0,
    alerts: null,
    alertsTotal: null,
    error: message,
  }
}

/**
 * Fetch every configured repo in a single GraphQL request. Per-repo failures
 * (bad name, no access) come back as GraphQL errors alongside partial data,
 * so one broken repo never takes down the whole refresh.
 */
export async function fetchStatuses(repos: RepoConfig[], token: string): Promise<RepoStatus[]> {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "rhythm.sh",
    },
    body: JSON.stringify({ query: buildQuery(repos) }),
  })
  if (!res.ok) {
    throw new Error(`GitHub API: HTTP ${res.status} ${res.statusText}`)
  }
  const payload = (await res.json()) as {
    data?: Record<string, GqlRepository | null>
    errors?: { message: string; path?: (string | number)[] }[]
  }

  // Map top-level errors (e.g. NOT_FOUND) to their repo alias; field-level
  // errors (e.g. no access to vulnerabilityAlerts) just leave that field null.
  const repoErrors = new Map<string, string>()
  for (const err of payload.errors ?? []) {
    const alias = err.path?.[0]
    if (typeof alias === "string" && err.path?.length === 1) repoErrors.set(alias, err.message)
  }
  if (!payload.data && payload.errors?.length) {
    throw new Error(payload.errors.map((e) => e.message).join("; "))
  }

  return repos.map((config, i) => {
    const alias = `r${i}`
    const node = payload.data?.[alias]
    if (!node) return errorStatus(config, repoErrors.get(alias) ?? "no data returned")
    return parseRepo(config, node)
  })
}
