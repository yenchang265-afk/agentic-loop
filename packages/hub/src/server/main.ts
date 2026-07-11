import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadConfig } from "@agentic-loop/core/config"
import { defaultLoopsDir } from "@agentic-loop/core/manifest/dir"
import type { HubDeps } from "./deps.js"
import { fsClient, sh } from "./fsclient.js"
import { makeListener, type Route } from "./http.js"
import { getBacklog, getTaskDetail } from "./routes/backlog.js"
import { getKind, getKinds } from "./routes/kinds.js"

/**
 * Hub server entry. Binds 127.0.0.1 only — this is a local admin tool, never
 * an exposed service. `--dir <repo>` points at the project to monitor
 * (default: cwd); `--port <n>` overrides the default port.
 */

const argValue = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const directory = path.resolve(argValue("--dir") ?? process.cwd())
const port = Number(argValue("--port") ?? 4317)

const config = await loadConfig(fsClient, directory)

const deps: HubDeps = {
  directory,
  tasksDir: config.tasksDir,
  loopsDir: defaultLoopsDir(),
  client: fsClient,
  sh,
  log: (level, message) => process.stderr.write(`[hub] ${level}: ${message}\n`),
}

const routes: Route[] = [
  { method: "GET", pattern: "/api/backlog", handler: () => getBacklog(deps) },
  { method: "GET", pattern: "/api/tasks/:status/:id", handler: (req) => getTaskDetail(deps, req) },
  { method: "GET", pattern: "/api/kinds", handler: () => getKinds(deps) },
  { method: "GET", pattern: "/api/kinds/:kind", handler: (req) => getKind(deps, req) },
]

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "web")
const server = http.createServer(makeListener(routes, webRoot))
server.listen(port, "127.0.0.1", () => {
  console.log(`agentic-loop hub: http://127.0.0.1:${port} (watching ${directory})`)
})
