export function timeAgo(iso: string): string {
  if (!iso) return ""
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return "now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d`
  return `${Math.floor(seconds / (86400 * 30))}mo`
}

/** Compact elapsed time between `startIso` and `endIso` (or now): "45s", "3m12s", "1h4m". */
export function duration(startIso: string | null, endIso?: string | null): string {
  if (!startIso) return ""
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  const seconds = Math.max(0, Math.round((end - new Date(startIso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`
  return `${Math.floor(seconds / 3600)}h${Math.floor((seconds % 3600) / 60)}m`
}

/** Display width in terminal cells (emoji and CJK count as 2). */
export function cellWidth(s: string): number {
  return Bun.stringWidth(s)
}

/** Longest prefix of `s` that fits in `maxCells` display cells. */
export function sliceCells(s: string, maxCells: number): string {
  if (cellWidth(s) <= maxCells) return s
  let out = ""
  let used = 0
  for (const ch of s) {
    const w = cellWidth(ch)
    if (used + w > maxCells) break
    out += ch
    used += w
  }
  return out
}

export function compactCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
}

export function clock(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}
