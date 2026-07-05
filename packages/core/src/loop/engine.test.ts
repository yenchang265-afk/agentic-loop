import assert from "node:assert/strict"
import { test } from "node:test"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadManifest } from "../manifest/load.js"
import { advance, composePrompt, firstStep } from "./engine.js"
import type { Config, LoopState, TaskRef } from "./state.js"
import { advanceOnIdle, composeArgs, resumeAtBuild, startAtPlan } from "./state.js"
import type { Verdict } from "./verdict.js"

/**
 * Parity suite: the manifest-interpreted engine must reproduce the hardcoded
 * engineering state machine exactly — identical actions AND byte-identical
 * composed prompts — before `advanceOnIdle`/`composeArgs` may be deleted.
 * Loads the real `loops/engineering/` manifest, not a fixture.
 */

const LOOPS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..", "loops")
const eng = loadManifest(LOOPS_DIR, "engineering")

const config: Config = {
  maxIterations: 3,
  tasksDir: "docs/tasks",
  stageTimeoutMinutes: 60,
  reviewLenses: [],
}

const mk = (goal: string, task?: TaskRef): LoopState => ({
  goal,
  stage: "build",
  iteration: 0,
  artifacts: {},
  ...(task ? { task } : {}),
})

const task: TaskRef = { id: "add-foo", path: "/r/docs/tasks/in-progress/add-foo.md", acceptance: [] }

// --- golden parity: composePrompt ≡ composeArgs, byte for byte ---

const PROMPT_STATES: Record<string, LoopState> = {
  "build entry with plan": resumeAtBuild("add foo", task, "PLAN BODY"),
  "plan entry": startAtPlan("add foo", task),
  "replan with prior plan + acceptance": startAtPlan("g", { id: "t", path: "/p", acceptance: ["Returns 429 over limit"] }, "OLD PLAN"),
  "all artifacts": { ...mk("goalX"), artifacts: { plan: "P", build: "B", review: "R" } },
  "verify feedback": { ...mk("g"), artifacts: { plan: "P", verify: "V FAIL: missing test" } },
  "acceptance criteria": mk("g", { id: "t", path: "/p", acceptance: ["Returns 429 over limit", "Configurable per route"] }),
  "git shared-tree": { ...mk("g"), git: { base: "main", branch: "loop/add-foo" } },
  "git worktree": { ...mk("g"), git: { base: "main", branch: "loop/add-foo", worktree: "/wt/add-foo" }, artifacts: { plan: "P", build: "B" } },
  "no task no git": mk("bare goal"),
}

test("composePrompt reproduces composeArgs byte-identically for every stage × state", () => {
  for (const [label, state] of Object.entries(PROMPT_STATES)) {
    for (const stage of ["plan", "build", "verify", "review"]) {
      assert.equal(composePrompt(eng, state, stage), composeArgs(state, stage), `${label} → ${stage}`)
    }
  }
})

// --- golden parity: advance ≡ advanceOnIdle across the whole transition table ---

const strip = <T extends object>(o: T): Record<string, unknown> => {
  const { toStatus: _dropped, ...rest } = o as Record<string, unknown>
  return rest
}

const CASES: { label: string; state: LoopState; output: string; verdict?: Verdict | null }[] = [
  { label: "plan parks", state: startAtPlan("add foo", task), output: "plan written" },
  { label: "build fires verify", state: resumeAtBuild("add foo", task, "PLAN BODY"), output: "diff summary" },
  { label: "verify PASS", state: { ...mk("g"), stage: "verify" }, output: "all criteria met", verdict: "PASS" },
  { label: "verify FAIL re-builds", state: { ...mk("g"), stage: "verify", artifacts: { plan: "P" } }, output: "gap: missing test", verdict: "FAIL" },
  { label: "verify FAIL drops stale review", state: { ...mk("g"), stage: "verify", iteration: 1, artifacts: { plan: "P", review: "OLD REVIEW" } }, output: "still failing", verdict: "FAIL" },
  { label: "verify FAIL at cap stops", state: { ...mk("g"), stage: "verify", iteration: 2 }, output: "gaps remain", verdict: "FAIL" },
  { label: "verify missing verdict = FAIL", state: { ...mk("g"), stage: "verify", iteration: 2 }, output: "I think it's fine?", verdict: null },
  { label: "verify text PASS untrusted", state: { ...mk("g"), stage: "verify" }, output: "all good\nLOOP_VERIFY: PASS", verdict: null },
  { label: "verify ERROR stops", state: { ...mk("g"), stage: "verify" }, output: "test runner missing", verdict: "ERROR" },
  { label: "review PASS done", state: { ...mk("g"), stage: "review" }, output: "five-axis review clean", verdict: "PASS" },
  { label: "review FAIL re-builds", state: { ...mk("g"), stage: "review", artifacts: { plan: "P" } }, output: "gap: missing input validation", verdict: "FAIL" },
  { label: "review FAIL drops stale verify", state: { ...mk("g"), stage: "review", artifacts: { plan: "P", verify: "OLD VERIFY PASS" } }, output: "findings", verdict: "FAIL" },
  { label: "review FAIL at cap stops", state: { ...mk("g"), stage: "review", iteration: 2 }, output: "findings remain", verdict: "FAIL" },
  { label: "review missing verdict = FAIL", state: { ...mk("g"), stage: "review", iteration: 2 }, output: "looks okay I guess", verdict: null },
  { label: "review ERROR stops", state: { ...mk("g"), stage: "review", iteration: 1 }, output: "could not read the diff", verdict: "ERROR" },
]

test("advance reproduces advanceOnIdle exactly (states and actions) across the transition table", () => {
  for (const c of CASES) {
    const legacy = advanceOnIdle(c.state, config, c.output, c.verdict ?? null)
    const engine = advance(eng, c.state, config, c.output, c.verdict ?? null)
    assert.deepEqual(engine.state, legacy.state, `${c.label}: state`)
    assert.deepEqual(strip(engine.action), strip(legacy.action), `${c.label}: action`)
  }
})

// --- the manifest's additive semantics (what the legacy fn could not express) ---

test("park and done actions carry the manifest's toStatus", () => {
  const park = advance(eng, startAtPlan("g", task), config, "plan written")
  assert.equal(park.action.kind, "park")
  if (park.action.kind === "park") assert.equal(park.action.toStatus, "plan-review")

  const done = advance(eng, { ...mk("g"), stage: "review" }, config, "clean", "PASS")
  assert.equal(done.action.kind, "done")
  if (done.action.kind === "done") assert.equal(done.action.toStatus, "in-review")
})

test("firstStep fires the state's own stage with its composed prompt", () => {
  const s = resumeAtBuild("add foo", task, "PLAN BODY")
  const { action } = firstStep(eng, s)
  assert.equal(action.kind, "fire")
  if (action.kind === "fire") {
    assert.equal(action.stage, "build")
    assert.equal(action.arguments, composeArgs(s, "build"))
  }
})

test("the engineering manifest names commands, agents, and check-stage allowlists", () => {
  const plan = eng.manifest.stages.find((s) => s.name === "plan")
  assert.equal(plan?.command, "plan-task")
  assert.equal(plan?.isolation, "none")
  const verify = eng.manifest.stages.find((s) => s.name === "verify")
  assert.equal(verify?.kind, "check")
  assert.ok((verify?.bashAllowlist.length ?? 0) > 0)
})
