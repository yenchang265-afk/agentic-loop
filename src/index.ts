import type { Plugin } from "@opencode-ai/plugin"

/**
 * agentic-loop
 *
 * opencode plugin that wires session lifecycle events into an agentic loop:
 * it observes when a session goes idle and exposes a single decision point
 * (`shouldContinue`) for re-driving the agent toward an open goal instead of
 * stopping after one turn.
 *
 * This is the starter surface. Real loop policy lives in `shouldContinue` and
 * the `session.idle` branch of the `event` hook below.
 */
export const AgenticLoop: Plugin = async ({ client, directory }) => {
  const service = "agentic-loop"

  const log = (level: "info" | "warn" | "error", message: string) =>
    client.app.log({ body: { service, level, message } })

  /**
   * Loop policy. Return true to keep driving the session, false to let it
   * rest. Scaffold default: never auto-continue (observe only).
   */
  const shouldContinue = (_sessionID: string): boolean => false

  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle") return

      const { sessionID } = event.properties
      await log("info", `session ${sessionID} idle in ${directory}`)

      if (shouldContinue(sessionID)) {
        // Hook point: re-prompt the session here to continue the loop.
      }
    },

    "tool.execute.before": async (input) => {
      // Hook point: inspect/annotate tool calls as the loop drives them.
      await log("info", `tool ${input.tool} starting (call ${input.callID})`)
    },
  }
}
