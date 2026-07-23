import path from "node:path"
import { writeFileAtomic } from "../fsatomic.js"
import type { Shell } from "../host.js"
import type { WorkflowState } from "./state.js"

/**
 * The OpenCode host's live-stage marker: `runs/.stage-opencode.json`, written
 * while a stage runs and removed when the drive ends. Out-of-process observers
 * (the admin hub's driving oracle, its doctor, the live board badge) read it to
 * answer "what is this loop doing RIGHT NOW" — before this file existed, the
 * hub could see OpenCode-driven work only through claim markers, so its doctor
 * had to skip claim release wholesale whenever a watcher lease was live.
 *
 * Deliberately a SIBLING of the Claude host's `runs/.stage.json`, not the same
 * file: that marker is a control-plane input to the Claude plugin's PreToolUse
 * hooks (stage allowlists, worktree pinning, deadlines). An OpenCode loop's
 * stages run in OpenCode where those hooks don't exist — writing the shared
 * path would instead subject a human's concurrent interactive Claude session
 * to guards meant for the loop's own agents, and already-built hook bundles
 * could not be taught to skip it. A separate file is inert to every hook.
 */

export interface OpencodeStageMarker {
  readonly host: "opencode"
  readonly kind: string
  readonly stage: string
  readonly taskId: string | null
  readonly worktree: string | null
  /** Wall-clock ms deadline of the stage attempt (start + stageTimeoutMinutes); display-only. */
  readonly deadline: number | null
  readonly iteration: number
}

/** Absolute path of the OpenCode host's stage marker. Pure. */
export const opencodeMarkerPath = (directory: string, tasksDir: string): string =>
  path.join(directory, tasksDir, "runs", ".stage-opencode.json")

/** Build the marker for a stage the driver is about to fire. Pure. */
export const opencodeStageMarker = (state: WorkflowState, deadline: number | null): OpencodeStageMarker => ({
  host: "opencode",
  kind: state.kind ?? "engineering",
  stage: state.stage,
  taskId: state.task?.id ?? null,
  worktree: state.git?.worktree ?? null,
  deadline,
  iteration: state.iteration,
})

/** Write the marker. Best-effort — telemetry must never fail the drive. */
export const writeOpencodeStageMarker = async (
  $: Shell,
  directory: string,
  tasksDir: string,
  marker: OpencodeStageMarker,
): Promise<void> => {
  const dir = path.join(directory, tasksDir, "runs")
  await $`mkdir -p ${dir}`.quiet().nothrow()
  await writeFileAtomic($, opencodeMarkerPath(directory, tasksDir), JSON.stringify(marker))
}

/** Remove the marker. Best-effort; idempotent on an absent file. */
export const clearOpencodeStageMarker = async ($: Shell, directory: string, tasksDir: string): Promise<void> => {
  await $`rm -f ${opencodeMarkerPath(directory, tasksDir)}`.quiet().nothrow()
}
