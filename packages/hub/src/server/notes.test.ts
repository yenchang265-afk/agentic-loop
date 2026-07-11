import assert from "node:assert/strict"
import { test } from "node:test"
import { extractAuditNotes } from "./notes.js"

test("extractAuditNotes parses stamped audit blockquotes", () => {
  const body = [
    "Some intro text.",
    "> Task approved — queued [2026-07-01T10:00:00.000Z by alice]",
    "",
    "## Implementation Plan",
    "- step one",
    "> VERIFY verdict: PASS — all good (iteration 1) [2026-07-02T11:30:00.000Z by loop]",
  ].join("\n")
  assert.deepEqual(extractAuditNotes(body), [
    { event: "Task approved — queued", at: "2026-07-01T10:00:00.000Z", by: "alice" },
    { event: "VERIFY verdict: PASS — all good (iteration 1)", at: "2026-07-02T11:30:00.000Z", by: "loop" },
  ])
})

test("extractAuditNotes keeps unstamped blockquotes with empty stamp", () => {
  const notes = extractAuditNotes("> BUILD started (iteration 1)\nplain line")
  assert.deepEqual(notes, [{ event: "BUILD started (iteration 1)", at: "", by: "" }])
})

test("extractAuditNotes returns [] for a body without blockquotes", () => {
  assert.deepEqual(extractAuditNotes("just\nmarkdown\n- list"), [])
})
