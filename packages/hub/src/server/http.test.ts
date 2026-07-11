import assert from "node:assert/strict"
import path from "node:path"
import { test } from "node:test"
import { isLocalHost, matchRoute, safeStaticPath } from "./http.js"

test("matchRoute extracts params and rejects shape mismatches", () => {
  assert.deepEqual(matchRoute("/api/backlog", "/api/backlog"), {})
  assert.deepEqual(matchRoute("/api/tasks/:status/:id", "/api/tasks/queued/add-foo"), {
    status: "queued",
    id: "add-foo",
  })
  assert.equal(matchRoute("/api/tasks/:status/:id", "/api/tasks/queued"), null)
  assert.equal(matchRoute("/api/backlog", "/api/kinds"), null)
  assert.deepEqual(matchRoute("/api/kinds/:kind", "/api/kinds/pr%2Dsitter"), { kind: "pr-sitter" })
})

test("isLocalHost accepts local hosts only", () => {
  assert.equal(isLocalHost("localhost:4317"), true)
  assert.equal(isLocalHost("127.0.0.1:4317"), true)
  assert.equal(isLocalHost("[::1]:4317"), true)
  assert.equal(isLocalHost("localhost"), true)
  assert.equal(isLocalHost("evil.example.com"), false)
  assert.equal(isLocalHost("localhost.evil.example.com"), false)
  assert.equal(isLocalHost(undefined), false)
})

test("safeStaticPath refuses traversal out of the web root", () => {
  const root = path.resolve("/srv/web")
  assert.equal(safeStaticPath(root, "/"), path.join(root, "index.html"))
  assert.equal(safeStaticPath(root, "/assets/main.js"), path.join(root, "assets", "main.js"))
  assert.equal(safeStaticPath(root, "/../secret"), null)
  assert.equal(safeStaticPath(root, "/assets/../../secret"), null)
  assert.equal(safeStaticPath(root, "/%2e%2e/secret"), path.join(root, "%2e%2e", "secret"))
})
