import type { PluginInput } from "@opencode-ai/plugin"

/**
 * Git helpers for the loop's execution isolation. **Impure**: everything here
 * shells out via Bun `$`. All helpers are best-effort and degrade gracefully —
 * outside a git repo the loop simply runs without isolation, same as before
 * it existed. Nothing here ever pushes.
 */

type Shell = PluginInput["$"]

const run = async ($: Shell, cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string }> => {
  const out = await $`git -C ${cwd} ${args}`.quiet().nothrow()
  return { ok: out.exitCode === 0, stdout: out.stdout.toString().trim() }
}

/** Whether `cwd` is inside a git work tree. */
export const isGitRepo = async ($: Shell, cwd: string): Promise<boolean> =>
  (await run($, cwd, ["rev-parse", "--is-inside-work-tree"])).ok

/** The currently checked-out branch name, or null (detached HEAD / not a repo). */
export const currentBranch = async ($: Shell, cwd: string): Promise<string | null> => {
  const { ok, stdout } = await run($, cwd, ["rev-parse", "--abbrev-ref", "HEAD"])
  return ok && stdout && stdout !== "HEAD" ? stdout : null
}

/** Whether the working tree has any uncommitted changes (staged or not). */
export const isDirty = async ($: Shell, cwd: string): Promise<boolean> => {
  const { ok, stdout } = await run($, cwd, ["status", "--porcelain"])
  return ok && stdout.length > 0
}

/**
 * Check out `branch`, creating it from the current HEAD when it doesn't exist
 * yet (an existing branch — e.g. from a recovered run — is reused as-is,
 * never reset). Returns false when the checkout failed.
 */
export const checkoutBranch = async ($: Shell, cwd: string, branch: string): Promise<boolean> => {
  const exists = (await run($, cwd, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`])).ok
  return (await run($, cwd, exists ? ["checkout", branch] : ["checkout", "-b", branch])).ok
}

/**
 * Stage everything and commit. Returns false when there was nothing to commit
 * or the commit failed — callers treat both as "no checkpoint taken".
 */
export const commitAll = async ($: Shell, cwd: string, message: string): Promise<boolean> => {
  if (!(await run($, cwd, ["add", "-A"])).ok) return false
  return (await run($, cwd, ["commit", "-m", message])).ok
}

/**
 * Stage and commit only the given paths — used to commit backlog mutations
 * (task moves, persisted plans) without sweeping up unrelated working-tree
 * changes. Returns false when nothing was committed.
 */
export const commitPaths = async ($: Shell, cwd: string, paths: readonly string[], message: string): Promise<boolean> => {
  if (paths.length === 0) return false
  if (!(await run($, cwd, ["add", "--", ...paths])).ok) return false
  return (await run($, cwd, ["commit", "-m", message, "--", ...paths])).ok
}

/** The committer identity configured for this tree, as `Name <email>`, or null. */
export const gitActor = async ($: Shell, cwd: string): Promise<string | null> => {
  const name = (await run($, cwd, ["config", "user.name"])).stdout
  const email = (await run($, cwd, ["config", "user.email"])).stdout
  if (!name && !email) return null
  return name && email ? `${name} <${email}>` : name || email
}
