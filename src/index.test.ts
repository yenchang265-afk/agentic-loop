import assert from "node:assert/strict"
import { test } from "node:test"
import type { PluginInput } from "@opencode-ai/plugin"
import { AgenticLoop } from "./index.ts"
import { serializeTask } from "./task/schema.ts"
import { PLAN_HEADING } from "./task/store.ts"

/**
 * The plugin initializer runs inside opencode's instance bootstrap. Any
 * `client` call made there is a request back into the same still-bootstrapping
 * instance and deadlocks opencode startup (the TUI never opens). These tests
 * pin the fix: init must complete without touching the client at all.
 */

const hang = () => new Promise<never>(() => {})

const makeInput = (calls: string[]): PluginInput => {
  // Every client method records the call and never resolves, simulating the
  // bootstrap deadlock: if init awaits any of them, the test times out.
  const client = {
    file: {
      read: () => {
        calls.push("file.read")
        return hang()
      },
    },
    app: {
      log: () => {
        calls.push("app.log")
        return hang()
      },
    },
  }
  return { client, directory: "/repo", $: undefined } as unknown as PluginInput
}

test("plugin init resolves without any client call (no bootstrap deadlock)", async () => {
  const calls: string[] = []
  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 1000))
  const hooks = await Promise.race([AgenticLoop(makeInput(calls)), timeout])

  assert.notEqual(hooks, "timeout", "plugin init blocked on a client call — this deadlocks opencode startup")
  assert.deepEqual(calls, [], "plugin init must not call the opencode client during bootstrap")
})

test("non-loop commands pass through without loading config", async () => {
  const calls: string[] = []
  const hooks = await AgenticLoop(makeInput(calls))
  await hooks["command.execute.before"]?.(
    { command: "help", sessionID: "ses_x", arguments: "" } as never,
    {} as never,
  )
  assert.deepEqual(calls, [], "a non-loop command must not trigger a config read")
})

test("the agent-loop-plan command is dispatched (it triggers a config read)", async () => {
  const calls: string[] = []
  const hooks = await AgenticLoop(makeInput(calls))
  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 50))
  // The hanging fake client never resolves file.read, so the handler blocks
  // after recording the call — racing a timeout is enough to observe dispatch.
  await Promise.race([
    hooks["command.execute.before"]?.({ command: "agent-loop-plan", sessionID: "ses_x", arguments: "approve x" } as never, {} as never),
    timeout,
  ])
  assert.ok(calls.includes("file.read"), "a /agent-loop-plan command must reach the plugin handler")
})

test("the plugin exposes dispose (watch-timer cleanup) and no loop_begin tool", async () => {
  const hooks = await AgenticLoop(makeInput([]))
  assert.notEqual(hooks, undefined)
  assert.equal(typeof (hooks as { dispose?: unknown }).dispose, "function")
  const tools = (hooks as { tool?: Record<string, unknown> }).tool ?? {}
  assert.ok(!("loop_begin" in tools), "loop_begin was removed with the free-text /agent-loop mode")
  assert.ok("loop_verdict" in tools)
  assert.ok("loop_plan_task" in tools, "the conversational draft→planning gate needs loop_plan_task")
  assert.ok("loop_plan_approve" in tools, "the conversational approve gate needs loop_plan_approve")
  assert.ok("loop_start" in tools, "the conversational approve→build chain needs loop_start")
  await (hooks as { dispose: () => Promise<void> }).dispose() // must not throw with no timers
})

/**
 * Unlike `makeInput` (whose client hangs by design, pinning the bootstrap
 * deadlock), this client resolves reads from a fixture map — for exercising
 * the agent-callable tools end to end.
 */
const makeResolvingInput = (files: Record<string, string>): PluginInput => {
  const client = {
    file: {
      read: async ({ query }: { query: { path: string } }) => {
        const content = files[query.path]
        return { data: content !== undefined ? { content } : undefined }
      },
    },
    app: {
      log: async () => ({ data: undefined }),
    },
  }
  return { client, directory: "/repo", $: undefined } as unknown as PluginInput
}

test("the loop_plan_approve tool enforces the same draft refusal as the command path", async () => {
  const draftBody = serializeTask({ title: "Do the thing", body: `${PLAN_HEADING}\n\n1. Step.` })
  const hooks = await AgenticLoop(makeResolvingInput({ "docs/tasks/draft/my-task.md": draftBody }))
  const tools = (hooks as unknown as { tool: Record<string, { execute: (args: { id: string }, ctx: { sessionID: string }) => Promise<unknown> }> }).tool

  const result = await tools.loop_plan_approve?.execute({ id: "my-task" }, { sessionID: "ses_tool" })

  assert.match(String(result), /still in draft/)
})
