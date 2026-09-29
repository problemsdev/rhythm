# rhythm.sh

A skimmable, full-screen terminal dashboard for your GitHub repos. One glance
shows open PRs, dependabot alerts, and the health of `main` across every
project you care about, and every row is a jump-off point to the browser.

Built with [Bun](https://bun.sh) and [OpenTUI](https://github.com/anomalyco/opentui).

```
 ▐ rhythm.sh  2 repos                      updated 10:17:05 AM · every 120s 

╭ problemsdev/rhythm ──────────────────────────────────────────────────────╮
│ ✓ main ▸2  docs: README and example config · 2h                          │
│ ✓ #3 feat: expand check runs with space ✔ octocat · 1d                   │
│ ✓ no dependabot alerts                                                   │
╰──────────────────────────────────────────────────────────────────────────╯
╭ anomalyco/opentui · ★ 13k ───────────────────────────────────────────────╮
│ ✗ main ▾  Release v0.5.5 · 1h                                            │
│   ✗ CI / test (ubuntu) · 4m02s                                           │
│   ◌ CI / build · 1m18s…                                                  │
│   ✓ CI / lint · 38s                                                      │
│ ✓ #1392 docs: add section-aware documentation search simonklee · 50m     │
│ ✓ #1393 ◇ core: make text selection inclusive of both endpoint cells si… │
│ ✓ #1389 fix(core): use boundary semantics for backward selection ± ofek… │
│ … 113 more open PRs                                                      │
│ ✓ no dependabot alerts                                                   │
│ 1 docs                                                                   │
╰──────────────────────────────────────────────────────────────────────────╯

 tab repo · j/k row · ⏎ open · space checks · 1-9 links · r refresh · q quit
```

**Skim, don't read.** Card borders encode health: red means `main` is failing,
orange means alerts need attention, yellow means work in flight, gray means all
quiet. You know where to look before you've read a word.

**One request per refresh.** Every repo is fetched in a single batched GraphQL
query, so a long repo list stays fast and rate-limit friendly.

**Jump off anywhere.** Every row is a real terminal hyperlink, `enter` opens it
in your browser, and keys `1`–`9` open the logs, dashboards, and analytics you
configure per repo.

## Install

Requires [Bun](https://bun.sh) 1.2 or newer.

```sh
bun install -g @problemsdev/rhythm
```

Or run it from a checkout:

```sh
git clone https://github.com/problemsdev/rhythm
cd rhythm
bun install
bun start
```

To get a `rhythm` command from the checkout, symlink the entry point onto your
`PATH`. It is executable and runs under Bun via its shebang:

```sh
ln -s "$PWD/src/index.tsx" ~/.bun/bin/rhythm
```

## Authentication

rhythm uses `GITHUB_TOKEN` if it is set, otherwise the token from
`gh auth token`. If the [GitHub CLI](https://cli.github.com) works, rhythm
works: the default scopes from `gh auth login` cover public and private repos
you have access to.

A few things depend on what the token can see:

- **Dependabot alerts** are shown when you can view them on GitHub for that
  repo. Otherwise the alerts row reads `⚠ alerts unavailable`.
- **Stars** are shown for public repos only.
- **A repo you can't reach** (typo, no access, deleted) shows its error inside
  the card. The other repos still load normally.

## Config

Config is YAML, searched in this order:

1. `$RHYTHM_CONFIG`
2. `./rhythm.yaml`
3. `./rhythm.yml`
4. `$XDG_CONFIG_HOME/rhythm/config.yaml` (default `~/.config/rhythm/config.yaml`)

Or pass one explicitly with `rhythm --config <path>` (`-c` for short). There is
a starter in [`rhythm.example.yaml`](rhythm.example.yaml).

```yaml
refresh: 2m              # how often to poll GitHub
columns: 2               # optional: cap the card grid width

repos:
  - problemsdev/rhythm   # bare form
  - repo: anomalyco/opentui
    links:               # jump-off links, opened with keys 1-9
      docs: https://github.com/anomalyco/opentui#readme
```

| key | default | notes |
| --- | --- | --- |
| `refresh` | `2m` | A bare number is seconds. Strings take `ms`, `s`, `m`, or `h`: `90s`, `2m`, `1.5h`. |
| `columns` | auto | Maximum card columns. Auto fits as many 56-cell-wide cards as the terminal allows. |
| `repos` | required | A non-empty list. Each entry is `owner/name` or a mapping with `repo` and optional `links`. |
| `repos[].links` | none | A mapping of label to URL. The first nine are bound to keys `1`–`9`, in order. |

## Keys

| key | action |
| --- | --- |
| `tab` / `shift+tab` | next / previous repo |
| `h` `l` / `←` `→` | previous / next repo |
| `j` `k` / `↑` `↓` | move between rows, flowing across repos |
| `enter` / `o` | open the selected row in your browser |
| `space` | expand or collapse `main`'s check runs on the selected repo |
| `1`–`9` | open the selected repo's configured links |
| `r` | refresh now |
| `q` / `ctrl+c` | quit |

Rows are also real terminal hyperlinks, so in most modern terminals you can
click them.

## Reading the dashboard

The header shows the repo count and the last refresh time, a spinner while
fetching, or the error if a refresh failed. Cards fill a grid, one per repo,
and the footer shows a key hint plus the config file in use.

### Card borders

| color | meaning |
| --- | --- |
| blue | the selected card |
| red | `main` is failing, or the repo failed to load |
| orange | critical or high dependabot alerts, or a PR whose CI is failing |
| yellow | work in flight: open PRs or any alerts |
| gray | all quiet |

### Rows

Each card lists, top to bottom: the `main` branch and its latest commit, the
ten most recently updated open PRs (plus a `… N more open PRs` row when there
are more), the dependabot alert summary, and any configured links.

| glyph | meaning |
| --- | --- |
| `✓` `✗` `◌` `·` | CI passed / failed / running / no CI, for `main` and for each PR's head commit |
| `◇` | draft PR (the whole row is dimmed) |
| `✔` `±` | review approved / changes requested |
| `⚠` | open dependabot alerts, counted by severity: critical, high, medium, low |
| `▸N` `▾` | `main` has N check runs, collapsed / expanded |
| `⋯` `⊘` | a queued / cancelled check run |
| `★` | star count (public repos only) |

Press `space` on a repo to expand `main`'s check runs. Each check row shows the
workflow and job name plus its duration. Running checks show elapsed time
(`3m12s…`) and update live. Checks are ordered failures first, then running,
then queued, then finished.

### Where rows open

| row | opens |
| --- | --- |
| `main` | the branch's commit history |
| a check run | that run's logs |
| a PR | the pull request |
| `no open PRs` / `… N more open PRs` | the repo's pull request list |
| alerts | the repo's dependabot alerts page |

Relative times (`4m`, `2h`, `3d`) refresh on their own between polls.

## Development

```sh
bun install
bun run dev          # restarts on file changes
bun run typecheck
```

| path | what's there |
| --- | --- |
| `src/index.tsx` | CLI entry: flags, config and token resolution, renderer setup |
| `src/config.ts` | YAML loading, search paths, validation |
| `src/github.ts` | the batched GraphQL query and response parsing |
| `src/model.ts` | shared types and the per-repo health rollup |
| `src/open.ts` | cross-platform "open in browser" |
| `src/ui/` | OpenTUI React components, row layout, formatting, theme |

## License

[MIT](LICENSE)
