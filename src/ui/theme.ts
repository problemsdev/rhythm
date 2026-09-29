import type { CheckState, CiState, Health, Severity } from "../model"

/** Tokyo Night-ish palette; reads well on dark terminals. */
export const theme = {
  fg: "#c0caf5",
  dim: "#565f89",
  faint: "#3b4261",
  accent: "#7aa2f7",
  selection: "#283457",
  green: "#9ece6a",
  red: "#f7768e",
  yellow: "#e0af68",
  orange: "#ff9e64",
  magenta: "#bb9af7",
  cyan: "#7dcfff",
} as const

export const healthColor: Record<Health, string> = {
  failing: theme.red,
  attention: theme.orange,
  busy: theme.yellow,
  calm: theme.faint,
}

export function ciGlyph(ci: CiState | null): { glyph: string; color: string } {
  switch (ci) {
    case "SUCCESS": return { glyph: "✓", color: theme.green }
    case "FAILURE":
    case "ERROR": return { glyph: "✗", color: theme.red }
    case "PENDING":
    case "EXPECTED": return { glyph: "◌", color: theme.yellow }
    default: return { glyph: "·", color: theme.dim }
  }
}

export function checkGlyph(state: CheckState): { glyph: string; color: string } {
  switch (state) {
    case "SUCCESS": return { glyph: "✓", color: theme.green }
    case "FAILURE": return { glyph: "✗", color: theme.red }
    case "RUNNING": return { glyph: "◌", color: theme.yellow }
    case "QUEUED": return { glyph: "⋯", color: theme.dim }
    case "CANCELLED": return { glyph: "⊘", color: theme.dim }
    case "SKIPPED":
    case "NEUTRAL": return { glyph: "·", color: theme.dim }
  }
}

export const severityColor: Record<Severity, string> = {
  CRITICAL: theme.red,
  HIGH: theme.orange,
  MEDIUM: theme.yellow,
  LOW: theme.accent,
}
