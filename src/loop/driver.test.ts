import assert from "node:assert/strict"
import { test } from "node:test"
import { PLAN_HEADING } from "../task/store.ts"
import { serializeTask } from "../task/schema.ts"
import type { Config } from "./state.ts"
import { handlePlanCommand, parsePlanArgs, parseWatchArgs, planApprove, planTask, startTaskLoop, type Deps } from "./driver.ts"
import { clearLoop, resumeAtBuild, setLoop } from "./state.ts"

/**
 * The watch-mode plumbing (timers, idle queries, claiming) is exercised
 * manually against a live opencode; the pure interval parser is unit-tested
 * here — it's the part with real input-space corners.
 */

test("an empty spec means 'use the config default'", () => {
  assert.deepEqual(parseWatchArgs(""), {})
  assert.deepEqual(parseWatchArgs("   "), {})
})

test("unit suffixes: seconds, minutes, hours", () => {
  assert.deepEqual(parseWatchArgs("30s"), { intervalMs: 30_000 })
  assert.deepEqual(parseWatchArgs("5m"), { intervalMs: 300_000 })
  assert.deepEqual(parseWatchArgs("2h"), { intervalMs: 7_200_000 })
})

test("a bare number is minutes", () => {
  assert.deepEqual(parseWatchArgs("5"), { intervalMs: 300_000 })
})

test("an --interval prefix is accepted", () => {
  assert.deepEqual(parseWatchArgs("--interval 5m"), { intervalMs: 300_000 })
})

test("case and internal whitespace are tolerated", () => {
  assert.deepEqual(parseWatchArgs("10 M"), { intervalMs: 600_000 })
})

test("sub-10s intervals clamp to the 10s floor", () => {
  assert.deepEqual(parseWatchArgs("1s"), { intervalMs: 10_000 })
  assert.deepEqual(parseWatchArgs("0.05"), { intervalMs: 10_000 })
})

test("garbage yields an error, not a silent default", () => {
  for (const bad of ["soon", "5x", "-5m", "m", "5m extra"]) {
    const parsed = parseWatchArgs(bad)
    assert.ok("error" in parsed, `expected an error for ${JSON.stringify(bad)}`)
  }
})

/**
 * `/agent-loop-plan` argument classification: `approve`/`task` get plugin work,
 * everything else passes through to the agent turn.
 */

test("approve and task subcommands are recognized with their id", () => {
  assert.deepEqual(parsePlanArgs("approve my-task"), { mode: "approve", id: "my-task" })
  assert.deepEqual(parsePlanArgs("task my-task"), { mode: "task", id: "my-task" })
})

test("casing and surrounding whitespace are tolerated, ids keep their case", () => {
  assert.deepEqual(parsePlanArgs("  Approve My-Task  "), { mode: "approve", id: "My-Task" })
  assert.deepEqual(parsePlanArgs("TASK  my-task"), { mode: "task", id: "my-task" })
})

test("a bare subcommand keeps an empty id for the usage toast", () => {
  assert.deepEqual(parsePlanArgs("approve"), { mode: "approve", id: "" })
  assert.deepEqual(parsePlanArgs("task   "), { mode: "task", id: "" })
})

test("new and free text pass through", () => {
  assert.deepEqual(parsePlanArgs("new add rate limiting"), { mode: "passthrough" })
  assert.deepEqual(parsePlanArgs(""), { mode: "passthrough" })
  assert.deepEqual(parsePlanArgs("tasky thing"), { mode: "passthrough" })
})

/**
 * `handlePlanCommand("approve …")` must never skip the in-planning stage —
 * not even for a draft task someone hand-edited a plan heading onto. Fakes
 * `client.file.read`/`client.tui.showToast`; `$` throws if invoked at all,
 * proving no move is attempted.
 */

const explodingShell = ((..._args: unknown[]) => {
  throw new Error("$ should not be called")
}) as unknown as Deps["$"]

const makeClient = (files: Record<string, string>) => {
  const toasts: { message: string; variant: string }[] = []
  const client = {
    file: {
      read: async ({ query }: { query: { path: string } }) => {
        const content = files[query.path]
        return { data: content !== undefined ? { content } : undefined }
      },
    },
    tui: {
      showToast: async ({ body }: { body: { message: string; variant: string } }) => {
        toasts.push(body)
        return { data: undefined }
      },
    },
  } as unknown as Deps["client"]
  return { client, toasts }
}

const testConfig: Config = {
  maxIterations: 1,
  tasksDir: "docs/tasks",
  stageTimeoutMinutes: 10,
  watchIntervalMinutes: 5,
  reviewLenses: [],
}

test("approve refuses a draft task even when it already has a plan heading", async () => {
  const draftBody = serializeTask({ title: "Do the thing", body: `${PLAN_HEADING}\n\n1. Step.` })
  const { client, toasts } = makeClient({ "docs/tasks/draft/my-task.md": draftBody })
  const deps: Deps = { client, $: explodingShell, directory: "/repo", log: () => {} }

  await handlePlanCommand(deps, "sess", "approve my-task", testConfig)

  assert.equal(toasts.length, 1)
  assert.match(toasts[0]?.message ?? "", /still in draft/)
  assert.match(toasts[0]?.message ?? "", /agent-loop-plan task my-task/)
})

/** Mirrors the fake shell in `../task/store.test.ts` / `git.test.ts` — always succeeds, records commands. */
const makeSucceedingShell = (log: string[]) => {
  const build = (strings: TemplateStringsArray, exprs: unknown[]) => {
    let cmd = ""
    strings.forEach((s, i) => {
      cmd += s
      if (i < exprs.length) {
        const e = exprs[i]
        cmd += Array.isArray(e) ? e.join(" ") : String(e)
      }
    })
    log.push(cmd.trim().replace(/\s+/g, " "))
    const chain = {
      quiet: () => chain,
      nothrow: () => chain,
      cwd: () => chain,
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ exitCode: 0, stdout: { toString: () => "" }, stderr: { toString: () => "" } }).then(
          resolve,
        ),
    }
    return chain
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((strings: TemplateStringsArray, ...exprs: unknown[]) => build(strings, exprs)) as any
}

test("approve succeeds for a task already in in-planning with a plan", async () => {
  const planned = serializeTask({ title: "Do the thing", body: `${PLAN_HEADING}\n\n1. Step.` })
  const { client, toasts } = makeClient({ "docs/tasks/in-planning/my-task.md": planned })
  const log: string[] = []
  const deps: Deps = { client, $: makeSucceedingShell(log), directory: "/repo", log: () => {} }

  await handlePlanCommand(deps, "sess", "approve my-task", testConfig)

  assert.equal(toasts.length, 1)
  assert.equal(toasts[0]?.variant, "success")
  assert.ok(log.some((cmd) => cmd.includes("mv") && cmd.includes("in-progress")))
})

/**
 * `planTask`/`planApprove`/`startTaskLoop` — the deterministic actions the
 * command intercepts and the agent-callable plugin tools share. The tool path
 * must enforce exactly the same stage sequencing as the commands.
 */

test("planTask moves a draft to in-planning and commits", async () => {
  const draft = serializeTask({ title: "Do the thing", body: "A body." })
  const { client } = makeClient({ "docs/tasks/draft/my-task.md": draft })
  const log: string[] = []
  const deps: Deps = { client, $: makeSucceedingShell(log), directory: "/repo", log: () => {} }

  const res = await planTask(deps, testConfig, "my-task")

  assert.equal(res.ok, true)
  assert.equal(res.variant, "success")
  assert.match(res.message, /in-planning/)
  assert.ok(log.some((cmd) => cmd.includes("mv") && cmd.includes("in-planning")))
  assert.ok(log.some((cmd) => cmd.startsWith("git") && cmd.includes("commit")))
})

test("planTask is a silent idempotent no-op for a task already in in-planning", async () => {
  const planned = serializeTask({ title: "Do the thing", body: "A body." })
  const { client } = makeClient({ "docs/tasks/in-planning/my-task.md": planned })
  const deps: Deps = { client, $: explodingShell, directory: "/repo", log: () => {} }

  const res = await planTask(deps, testConfig, "my-task")

  assert.equal(res.ok, true)
  assert.equal(res.silent, true)
  assert.match(res.message, /already in/)
})

test("planTask warns on an unknown id without touching the shell", async () => {
  const { client } = makeClient({})
  const deps: Deps = { client, $: explodingShell, directory: "/repo", log: () => {} }

  const res = await planTask(deps, testConfig, "nope")

  assert.equal(res.ok, false)
  assert.equal(res.variant, "warning")
  assert.match(res.message, /No draft\/in-planning task/)
})

test("planApprove refuses a draft even with a hand-written plan heading, shell untouched", async () => {
  const draftBody = serializeTask({ title: "Do the thing", body: `${PLAN_HEADING}\n\n1. Step.` })
  const { client } = makeClient({ "docs/tasks/draft/my-task.md": draftBody })
  const deps: Deps = { client, $: explodingShell, directory: "/repo", log: () => {} }

  const res = await planApprove(deps, testConfig, "my-task")

  assert.equal(res.ok, false)
  assert.match(res.message, /still in draft/)
})

test("planApprove refuses an in-planning task with no plan", async () => {
  const planless = serializeTask({ title: "Do the thing", body: "A body." })
  const { client } = makeClient({ "docs/tasks/in-planning/my-task.md": planless })
  const deps: Deps = { client, $: explodingShell, directory: "/repo", log: () => {} }

  const res = await planApprove(deps, testConfig, "my-task")

  assert.equal(res.ok, false)
  assert.match(res.message, /no Implementation Plan yet/)
})

test("startTaskLoop refuses an unapproved (in-planning) task", async () => {
  const planned = serializeTask({ title: "Do the thing", body: `${PLAN_HEADING}\n\n1. Step.` })
  const { client } = makeClient({ "docs/tasks/in-planning/my-task.md": planned })
  const deps: Deps = { client, $: explodingShell, directory: "/repo", log: () => {} }

  const res = await startTaskLoop(deps, "sess-start-1", testConfig, "my-task")

  assert.equal(res.ok, false)
  assert.match(res.message, /approve its plan first/)
})

test("startTaskLoop from the tool path refuses when the session already has a live loop", async () => {
  const approved = serializeTask({ title: "Do the thing", body: `${PLAN_HEADING}\n\n1. Step.` })
  const { client } = makeClient({ "docs/tasks/in-progress/my-task.md": approved })
  const deps: Deps = { client, $: explodingShell, directory: "/repo", log: () => {} }
  setLoop("sess-start-2", resumeAtBuild("goal", { id: "other", path: "/repo/docs/tasks/in-progress/other.md", acceptance: [] }, "plan"))

  try {
    const res = await startTaskLoop(deps, "sess-start-2", testConfig, "my-task", true)
    assert.equal(res.ok, false)
    assert.match(res.message, /already has an active or queued loop/)
  } finally {
    clearLoop("sess-start-2")
  }
})

test("startTaskLoop from the tool path refuses when a drive is already queued this turn", async () => {
  const bodies = {
    "docs/tasks/in-progress/task-a.md": serializeTask({ title: "Task A", body: `${PLAN_HEADING}\n\n1. Step.` }),
    "docs/tasks/in-progress/task-b.md": serializeTask({ title: "Task B", body: `${PLAN_HEADING}\n\n1. Step.` }),
  }
  const { client } = makeClient(bodies)
  const log: string[] = []
  const deps: Deps = { client, $: makeSucceedingShell(log), directory: "/repo", log: () => {} }

  const first = await startTaskLoop(deps, "sess-start-5", testConfig, "task-a", true)
  assert.equal(first.ok, true)
  // The drive only begins on session.idle — getLoop is still empty, but the
  // pending queue must count: a second start would overwrite task-a's queued
  // drive and orphan its claim marker.
  const second = await startTaskLoop(deps, "sess-start-5", testConfig, "task-b", true)
  assert.equal(second.ok, false)
  assert.match(second.message, /already has an active or queued loop/)
})

test("startTaskLoop claims an approved task and queues the drive", async () => {
  const approved = serializeTask({ title: "Do the thing", body: `${PLAN_HEADING}\n\n1. Step.` })
  const { client } = makeClient({ "docs/tasks/in-progress/my-task.md": approved })
  const log: string[] = []
  const deps: Deps = { client, $: makeSucceedingShell(log), directory: "/repo", log: () => {} }

  const res = await startTaskLoop(deps, "sess-start-3", testConfig, "my-task", true)

  assert.equal(res.ok, true)
  assert.match(res.message, /Loop started/)
  assert.ok(log.some((cmd) => cmd.startsWith("mkdir ") && !cmd.startsWith("mkdir -p") && cmd.includes(".claims")))
})

/** Like `makeSucceedingShell`, but a plain (non `-p`) mkdir fails — the lost claim race. */
const makeClaimLosingShell = (log: string[]) => {
  const build = (strings: TemplateStringsArray, exprs: unknown[]) => {
    let cmd = ""
    strings.forEach((s, i) => {
      cmd += s
      if (i < exprs.length) {
        const e = exprs[i]
        cmd += Array.isArray(e) ? e.join(" ") : String(e)
      }
    })
    const clean = cmd.trim().replace(/\s+/g, " ")
    log.push(clean)
    const exitCode = clean.startsWith("mkdir ") && !clean.startsWith("mkdir -p") ? 1 : 0
    const chain = {
      quiet: () => chain,
      nothrow: () => chain,
      cwd: () => chain,
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ exitCode, stdout: { toString: () => "" }, stderr: { toString: () => "" } }).then(resolve),
    }
    return chain
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((strings: TemplateStringsArray, ...exprs: unknown[]) => build(strings, exprs)) as any
}

test("startTaskLoop reports a lost claim race as success by other means", async () => {
  const approved = serializeTask({ title: "Do the thing", body: `${PLAN_HEADING}\n\n1. Step.` })
  const { client } = makeClient({ "docs/tasks/in-progress/my-task.md": approved })
  const log: string[] = []
  const deps: Deps = { client, $: makeClaimLosingShell(log), directory: "/repo", log: () => {} }

  const res = await startTaskLoop(deps, "sess-start-4", testConfig, "my-task", true)

  // The task IS being built (by whoever won the claim) — a failure-shaped
  // result would invite retries or a bogus failure report.
  assert.equal(res.ok, true)
  assert.match(res.message, /just claimed by another watcher/)
  assert.match(res.message, /do not retry/)
})
