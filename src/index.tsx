#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { parseArgs } from "node:util"
import { loadConfig } from "./config"
import { resolveToken } from "./github"
import { App } from "./ui/App"

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    config: { type: "string", short: "c" },
    help: { type: "boolean", short: "h" },
  },
})

if (values.help) {
  console.log(`rhythm.sh — a skimmable terminal dashboard for your GitHub repos

usage: rhythm [--config <path>]

config is YAML (see rhythm.example.yaml); searched in:
  $RHYTHM_CONFIG, ./rhythm.yaml, ./rhythm.yml, ~/.config/rhythm/config.yaml

keys: tab/h/l switch repo · j/k move · enter open in browser · 1-9 links · r refresh · q quit`)
  process.exit(0)
}

try {
  const config = await loadConfig(values.config)
  const token = resolveToken()
  const renderer = await createCliRenderer({ exitOnCtrlC: true, targetFps: 30 })
  createRoot(renderer).render(<App config={config} token={token} />)
} catch (e) {
  console.error(`rhythm: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
}
