import { TextAttributes, type BoxRenderable } from "@opentui/core"
import type { Ref } from "react"
import { repoHealth, type RepoStatus, SEVERITIES } from "../model"
import { cellWidth, compactCount, duration, sliceCells, timeAgo } from "./format"
import { rowsFor, type Row } from "./rows"
import { checkGlyph, ciGlyph, healthColor, severityColor, theme } from "./theme"

interface Seg {
  t: string
  fg?: string
  attr?: number
}

/** Truncate a list of styled segments to fit `width` display cells, adding an ellipsis. */
function fit(segs: Seg[], width: number): Seg[] {
  const out: Seg[] = []
  let used = 0
  for (const seg of segs) {
    const w = cellWidth(seg.t)
    if (used + w <= width) {
      out.push(seg)
      used += w
    } else {
      const room = width - used - 1
      if (room > 0) out.push({ ...seg, t: sliceCells(seg.t, room) + "…" })
      else out.push({ fg: theme.dim, t: "…" })
      break
    }
  }
  return out
}

function mainSegs(s: RepoStatus, checksExpanded: boolean): Seg[] {
  const m = s.main!
  const ci = ciGlyph(m.ci)
  const segs: Seg[] = [
    { t: `${ci.glyph} `, fg: ci.color, attr: TextAttributes.BOLD },
    { t: m.branch, fg: theme.fg, attr: TextAttributes.BOLD },
  ]
  if (m.checks.length > 0) {
    segs.push({ t: checksExpanded ? " ▾" : ` ▸${m.checks.length}`, fg: theme.dim })
  }
  segs.push({ t: `  ${m.message}`, fg: theme.dim }, { t: ` · ${timeAgo(m.committedDate)}`, fg: theme.faint })
  return segs
}

function checkSegs(row: Row): Seg[] {
  const c = row.check!
  const g = checkGlyph(c.state)
  const dim = c.state === "SKIPPED" || c.state === "CANCELLED" || c.state === "NEUTRAL"
  const segs: Seg[] = [
    { t: `  ${g.glyph} `, fg: g.color },
    { t: c.name, fg: dim ? theme.dim : theme.fg },
  ]
  const time =
    c.state === "QUEUED" ? "queued"
    : c.state === "RUNNING" ? (c.startedAt ? `${duration(c.startedAt)}…` : "running")
    : duration(c.startedAt, c.completedAt)
  if (time) segs.push({ t: ` · ${time}`, fg: c.state === "RUNNING" ? theme.yellow : theme.faint })
  return segs
}

function prSegs(row: Row): Seg[] {
  const pr = row.pr!
  const ci = ciGlyph(pr.ci)
  const dim = pr.isDraft
  const segs: Seg[] = [
    { t: `${ci.glyph} `, fg: dim ? theme.dim : ci.color },
    { t: `#${pr.number}`, fg: dim ? theme.dim : theme.accent },
    { t: dim ? " ◇" : "", fg: theme.dim },
    { t: ` ${pr.title}`, fg: dim ? theme.dim : theme.fg },
  ]
  if (pr.reviewDecision === "APPROVED") segs.push({ t: " ✔", fg: theme.green })
  if (pr.reviewDecision === "CHANGES_REQUESTED") segs.push({ t: " ±", fg: theme.red })
  segs.push({ t: ` ${pr.author} · ${timeAgo(pr.updatedAt)}`, fg: theme.faint })
  return segs
}

function alertSegs(s: RepoStatus): Seg[] {
  if (s.alerts === null) return [{ t: "⚠ alerts unavailable", fg: theme.faint }]
  if ((s.alertsTotal ?? 0) === 0) return [{ t: "✓ no dependabot alerts", fg: theme.faint }]
  const segs: Seg[] = [{ t: "⚠ ", fg: theme.orange }]
  const parts = SEVERITIES.filter((sev) => s.alerts![sev] > 0)
  parts.forEach((sev, i) => {
    segs.push({
      t: `${s.alerts![sev]} ${sev.toLowerCase()}`,
      fg: severityColor[sev],
      attr: sev === "CRITICAL" ? TextAttributes.BOLD : undefined,
    })
    if (i < parts.length - 1) segs.push({ t: " · ", fg: theme.faint })
  })
  return segs
}

function segsFor(row: Row, s: RepoStatus, checksExpanded: boolean): Seg[] {
  switch (row.kind) {
    case "error": return [{ t: `✗ ${s.error}`, fg: theme.red }]
    case "main": return mainSegs(s, checksExpanded)
    case "check": return checkSegs(row)
    case "pr": return prSegs(row)
    case "no-prs": return [{ t: "· no open PRs", fg: theme.faint }]
    case "more-prs": return [{ t: `… ${s.prTotal - s.prs.length} more open PRs`, fg: theme.dim }]
    case "alerts": return alertSegs(s)
  }
}

export function RepoCard(props: {
  status: RepoStatus
  width: number
  selected: boolean
  selectedRow: number
  checksExpanded: boolean
  /** Bumped periodically so memoized cards re-render and relative times stay fresh. */
  tick: number
  ref?: Ref<BoxRenderable>
}) {
  const { status, width, selected, selectedRow, checksExpanded } = props
  const rows = rowsFor(status, checksExpanded)
  const innerWidth = width - 4 // border + row padding
  const health = repoHealth(status)
  const borderColor = selected ? theme.accent : healthColor[health]
  const stars = status.stars !== null ? ` · ★ ${compactCount(status.stars)}` : ""

  return (
    <box
      ref={props.ref}
      border
      borderStyle="rounded"
      borderColor={borderColor}
      title={` ${status.nameWithOwner}${stars} `}
      style={{ width, flexDirection: "column", flexShrink: 0 }}
    >
      {rows.map((row, i) => {
        const isSel = selected && i === selectedRow
        return (
          <box
            key={`${row.kind}-${row.pr?.number ?? row.check?.name ?? i}`}
            style={{
              width: "100%",
              height: 1,
              paddingLeft: 1,
              backgroundColor: isSel ? theme.selection : undefined,
            }}
          >
            <text>
              {fit(segsFor(row, status, checksExpanded), innerWidth).map((seg, j) => (
                <span key={j} fg={seg.fg} attributes={seg.attr} link={{ url: row.url }}>
                  {seg.t}
                </span>
              ))}
            </text>
          </box>
        )
      })}
      {status.config.links.length > 0 && (
        <box style={{ width: "100%", height: 1, paddingLeft: 1 }}>
          <text>
            {fit(
              status.config.links.flatMap((link, i): Seg[] => [
                { t: i === 0 ? "" : "  ", fg: theme.faint },
                { t: `${i + 1}`, fg: selected ? theme.cyan : theme.dim, attr: TextAttributes.BOLD },
                { t: ` ${link.label}`, fg: theme.dim },
              ]),
              innerWidth,
            ).map((seg, j) => (
              <span key={j} fg={seg.fg} attributes={seg.attr}>
                {seg.t}
              </span>
            ))}
          </text>
        </box>
      )}
    </box>
  )
}
