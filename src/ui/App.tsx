import { TextAttributes, type BoxRenderable, type ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Config } from "../config"
import { fetchStatuses } from "../github"
import type { RepoStatus } from "../model"
import { openInBrowser } from "../open"
import { clock } from "./format"
import { RepoCard } from "./RepoCard"
import { rowsFor } from "./rows"
import { theme } from "./theme"

const RepoCardMemo = memo(RepoCard)

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const CARD_MIN_WIDTH = 56
const HELP = "tab repo · j/k row · ⏎ open · space checks · 1-9 links · r refresh · q quit"

interface Selection {
  repo: number
  row: number
}

export function App({ config, token }: { config: Config; token: string }) {
  const renderer = useRenderer()
  const { width, height } = useTerminalDimensions()

  const [statuses, setStatuses] = useState<RepoStatus[] | null>(null)
  const [fetching, setFetching] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [sel, setSel] = useState<Selection>({ repo: 0, row: 0 })
  const [flash, setFlash] = useState<string | null>(null)
  const [spinnerFrame, setSpinnerFrame] = useState(0)
  const [tick, setTick] = useState(0) // periodic re-render so "2h ago" style labels stay fresh
  /** Repos (by nameWithOwner) whose main-branch check runs are expanded. */
  const [expandedChecks, setExpandedChecks] = useState<ReadonlySet<string>>(new Set())

  const fetchingRef = useRef(false)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setFetching(true)
    try {
      const next = await fetchStatuses(config.repos, token)
      setStatuses(next)
      setLastUpdated(new Date())
      setFetchError(null)
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e))
    } finally {
      fetchingRef.current = false
      setFetching(false)
    }
  }, [config, token])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, config.refreshMs)
    const ticker = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => {
      clearInterval(interval)
      clearInterval(ticker)
    }
  }, [refresh, config.refreshMs])

  useEffect(() => {
    if (!fetching) return
    const t = setInterval(() => setSpinnerFrame((f) => (f + 1) % SPINNER.length), 80)
    return () => clearInterval(t)
  }, [fetching])

  const showFlash = useCallback((msg: string) => {
    setFlash(msg)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 2500)
  }, [])

  const open = useCallback(
    (label: string, url: string) => {
      openInBrowser(url)
      showFlash(`↗ ${label}`)
    },
    [showFlash],
  )

  // Latest statuses/selection for the keyboard handler, which outlives renders.
  const state = useRef({ statuses, sel, expandedChecks })
  state.current = { statuses, sel, expandedChecks }

  const handleKey = useCallback(
    (key: { name: string; shift: boolean; ctrl: boolean }) => {
      const { statuses, expandedChecks } = state.current
      if (key.name === "q" || (key.ctrl && key.name === "c")) {
        renderer.destroy()
        process.exit(0)
      }
      if (key.name === "r") {
        refresh()
        return
      }
      if (!statuses || statuses.length === 0) return

      const repoCount = statuses.length
      const rowCount = (r: number) => rowsFor(statuses[r]!, expandedChecks.has(statuses[r]!.nameWithOwner)).length
      const clamp = (s: Selection): Selection => {
        const repo = Math.min(Math.max(s.repo, 0), repoCount - 1)
        return { repo, row: Math.min(Math.max(s.row, 0), rowCount(repo) - 1) }
      }

      // Functional updates: key events can arrive faster than renders, so
      // never derive the next selection from a possibly-stale snapshot.
      const nextRepo = (dir: 1 | -1) =>
        setSel((prev) => ({ repo: (clamp(prev).repo + dir + repoCount) % repoCount, row: 0 }))

      const move = (dir: 1 | -1) =>
        setSel((prev) => {
          const cur = clamp(prev)
          const row = cur.row + dir
          if (row < 0) {
            const repo = (cur.repo - 1 + repoCount) % repoCount
            return { repo, row: rowCount(repo) - 1 }
          }
          if (row >= rowCount(cur.repo)) return { repo: (cur.repo + 1) % repoCount, row: 0 }
          return { repo: cur.repo, row }
        })

      switch (key.name) {
        case "tab":
          nextRepo(key.shift ? -1 : 1)
          return
        case "l":
        case "right":
          nextRepo(1)
          return
        case "h":
        case "left":
          nextRepo(-1)
          return
        case "j":
        case "down":
          move(1)
          return
        case "k":
        case "up":
          move(-1)
          return
        case "return":
        case "enter":
        case "o": {
          const cur = clamp(state.current.sel)
          const s = statuses[cur.repo]!
          const row = rowsFor(s, expandedChecks.has(s.nameWithOwner))[cur.row]
          if (row) open(row.url, row.url)
          return
        }
        case "space": {
          const cur = clamp(state.current.sel)
          const s = statuses[cur.repo]!
          if (!s.main?.checks.length) {
            showFlash("no checks on main")
            return
          }
          const collapsing = expandedChecks.has(s.nameWithOwner)
          setExpandedChecks((prev) => {
            const next = new Set(prev)
            if (collapsing) next.delete(s.nameWithOwner)
            else next.add(s.nameWithOwner)
            return next
          })
          // Collapsing removes rows; keep the selection inside the card.
          if (collapsing) {
            const max = rowsFor(s, false).length - 1
            setSel((prev) => ({ repo: prev.repo, row: Math.min(prev.row, max) }))
          }
          return
        }
      }

      if (/^[1-9]$/.test(key.name)) {
        const cur = clamp(state.current.sel)
        const link = statuses[cur.repo]!.config.links[Number(key.name) - 1]
        if (link) open(`${link.label} — ${link.url}`, link.url)
      }
    },
    [renderer, refresh, open, showFlash],
  )
  useKeyboard(handleKey)

  // Keep the selected card visible inside the scrollbox.
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const selectedCardRef = useRef<BoxRenderable | null>(null)
  useEffect(() => {
    const scroll = scrollRef.current
    const card = selectedCardRef.current
    if (!scroll || !card) return
    const vp = scroll.viewport
    if (card.y < vp.y) scroll.scrollBy(card.y - vp.y)
    else if (card.y + card.height > vp.y + vp.height) scroll.scrollBy(card.y + card.height - (vp.y + vp.height))
  }, [sel, statuses, expandedChecks])

  const columns = Math.max(
    1,
    Math.min(statuses?.length ?? 1, Math.floor(width / CARD_MIN_WIDTH), config.columns ?? Infinity),
  )
  const cardWidth = Math.floor((width - 2) / columns)

  const statusLine = useMemo(() => {
    if (fetching) return `${SPINNER[spinnerFrame]} refreshing`
    if (fetchError) return `✗ ${fetchError}`
    if (lastUpdated) return `updated ${clock(lastUpdated)} · every ${Math.round(config.refreshMs / 1000)}s`
    return "starting…"
  }, [fetching, spinnerFrame, fetchError, lastUpdated, config.refreshMs])

  return (
    <box style={{ width: "100%", height: "100%", flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}>
      <box style={{ width: "100%", height: 2, flexDirection: "row", justifyContent: "space-between" }}>
        <text>
          <span fg={theme.accent} attributes={TextAttributes.BOLD}>▐ rhythm.sh</span>
          <span fg={theme.faint}>  {config.repos.length} repos</span>
        </text>
        <text>
          <span fg={fetchError && !fetching ? theme.red : theme.dim}>{statusLine}</span>
        </text>
      </box>

      {!statuses ? (
        <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          <text>
            <span fg={theme.accent}>{SPINNER[spinnerFrame]} </span>
            <span fg={theme.dim}>fetching {config.repos.length} repos…</span>
          </text>
        </box>
      ) : (
        <scrollbox
          ref={scrollRef}
          style={{ flexGrow: 1, rootOptions: { width: "100%" }, contentOptions: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start" } }}
        >
          {statuses.map((status, i) => {
            const selected = i === Math.min(sel.repo, statuses.length - 1)
            return (
              <RepoCardMemo
                key={status.nameWithOwner}
                ref={selected ? selectedCardRef : undefined}
                status={status}
                width={cardWidth}
                selected={selected}
                selectedRow={sel.row}
                checksExpanded={expandedChecks.has(status.nameWithOwner)}
                tick={tick}
              />
            )
          })}
        </scrollbox>
      )}

      <box style={{ width: "100%", height: 1, flexDirection: "row", justifyContent: "space-between" }}>
        <text>
          <span fg={flash ? theme.cyan : theme.faint}>{flash ?? HELP}</span>
        </text>
        <text>
          <span fg={theme.faint}>{config.path}</span>
        </text>
      </box>
    </box>
  )
}
