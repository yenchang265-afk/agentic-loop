import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const pkgDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

// Boot the server from source over stdio with an immediately-closed stdin: it
// must announce readiness on stderr (stdout stays clean for the MCP protocol)
// and exit on its own when the transport sees EOF.
test("server boots, announces readiness on stderr, and exits on stdin EOF", async () => {
  const proc = spawn(process.execPath, ["--import", "tsx", path.join(pkgDir, "src", "server.ts")], {
    cwd: pkgDir,
    stdio: ["pipe", "pipe", "pipe"],
  })
  let stdout = ""
  let stderr = ""
  proc.stdout.on("data", (d) => (stdout += d))
  proc.stderr.on("data", (d) => (stderr += d))
  proc.stdin.end()

  const exited = new Promise<number | null>((resolve) => proc.on("close", resolve))
  const timeout = setTimeout(() => proc.kill("SIGKILL"), 30_000)
  const code = await exited
  clearTimeout(timeout)

  assert.notEqual(code, null, `server was killed after 30s without exiting; stderr:\n${stderr}`)
  assert.match(stderr, /agentic-loop MCP server ready/)
  assert.equal(stdout, "", "stdout must stay clean for the MCP protocol")
})
