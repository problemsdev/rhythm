import { parse } from "yaml"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export interface RepoLink {
  label: string
  url: string
}

export interface RepoConfig {
  owner: string
  name: string
  /** Named jump-off links: logs, analytics, dashboards, ... */
  links: RepoLink[]
}

export interface Config {
  /** Refresh interval in milliseconds. */
  refreshMs: number
  /** Max card columns; the grid never exceeds this even in a wide terminal. */
  columns?: number
  repos: RepoConfig[]
  path: string
}

const DEFAULT_REFRESH_MS = 2 * 60 * 1000

function parseDuration(value: unknown): number {
  if (typeof value === "number") return value * 1000
  if (typeof value === "string") {
    const m = value.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/)
    if (!m) throw new Error(`invalid refresh duration: "${value}" (use e.g. 90, "90s", "2m")`)
    const n = Number(m[1])
    switch (m[2] ?? "s") {
      case "ms": return n
      case "s": return n * 1000
      case "m": return n * 60 * 1000
      case "h": return n * 60 * 60 * 1000
    }
  }
  throw new Error(`invalid refresh duration: ${JSON.stringify(value)}`)
}

function parseColumns(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`invalid columns: ${JSON.stringify(value)} (use a whole number >= 1)`)
  }
  return value
}

function parseRepo(entry: unknown, index: number): RepoConfig {
  if (typeof entry === "string") entry = { repo: entry }
  if (typeof entry !== "object" || entry === null) {
    throw new Error(`repos[${index}]: expected "owner/name" or a mapping with a "repo" key`)
  }
  const obj = entry as Record<string, unknown>
  const repo = obj.repo
  if (typeof repo !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error(`repos[${index}]: "repo" must look like "owner/name", got ${JSON.stringify(repo)}`)
  }
  const [owner, name] = repo.split("/") as [string, string]

  const links: RepoLink[] = []
  if (obj.links !== undefined) {
    if (typeof obj.links !== "object" || obj.links === null || Array.isArray(obj.links)) {
      throw new Error(`repos[${index}].links: expected a mapping of label -> url`)
    }
    for (const [label, url] of Object.entries(obj.links)) {
      if (typeof url !== "string") {
        throw new Error(`repos[${index}].links.${label}: expected a URL string`)
      }
      links.push({ label, url })
    }
  }
  return { owner, name, links }
}

export function configSearchPaths(): string[] {
  const paths: string[] = []
  if (process.env.RHYTHM_CONFIG) paths.push(process.env.RHYTHM_CONFIG)
  paths.push(join(process.cwd(), "rhythm.yaml"))
  paths.push(join(process.cwd(), "rhythm.yml"))
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  paths.push(join(configHome, "rhythm", "config.yaml"))
  return paths
}

export async function loadConfig(explicitPath?: string): Promise<Config> {
  let path: string | undefined = explicitPath
  if (!path) path = configSearchPaths().find((p) => existsSync(p))
  if (!path || !existsSync(path)) {
    throw new Error(
      `no config file found. Looked for:\n  ${configSearchPaths().join("\n  ")}\n` +
        `Create one (see rhythm.example.yaml) or pass --config <path>.`,
    )
  }

  const raw = parse(await readFile(path, "utf8"))
  if (typeof raw !== "object" || raw === null) throw new Error(`${path}: config must be a YAML mapping`)
  const obj = raw as Record<string, unknown>

  if (!Array.isArray(obj.repos) || obj.repos.length === 0) {
    throw new Error(`${path}: "repos" must be a non-empty list`)
  }

  return {
    refreshMs: obj.refresh !== undefined ? parseDuration(obj.refresh) : DEFAULT_REFRESH_MS,
    columns: obj.columns !== undefined ? parseColumns(obj.columns) : undefined,
    repos: obj.repos.map(parseRepo),
    path,
  }
}
