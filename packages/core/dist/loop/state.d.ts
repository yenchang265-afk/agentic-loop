import type { Verdict } from "./verdict.js";
/**
 * Loop state machine for the agentic loop:
 *
 *   plan → (park for plan review) · build → verify → review
 *
 * The transition helpers here are **pure**: given a state (and config) they
 * return a new state plus an `Action` describing what the driver should do, and
 * never touch a client or the store. That keeps the loop logic unit-testable
 * without opencode. The impure orchestration lives in `driver.ts`.
 *
 * Task authoring happens **before** the loop, in the `/agent-loop-task`
 * command: `new` interviews the user into a draft task and `approve <id>`
 * parks it planless in `queued/`. The loop claims a queued task and enters at
 * `plan` via `startAtPlan` — the PLAN stage writes the task's
 * `## Implementation Plan` right before execution, so plans don't rot while a
 * task sits parked. PLAN never blocks on a human: it terminates with a `park`
 * action (the driver moves the task to `plan-review/` and the loop exits).
 * `/agent-loop-task approve-plan <id>` is the human plan gate; the next claim
 * enters at `build` via `resumeAtBuild` with the approved plan as an artifact.
 *
 * Two check stages can fail and loop back, and both re-**build**: a VERIFY
 * FAIL re-builds with the failure threaded into the build prompt; a REVIEW
 * FAIL re-builds with the review feedback. Both share one iteration counter
 * and cap. If the plan itself is wrong, the cap stops the loop and a human
 * sends the task back to the PLAN stage via `/agent-loop-task replan <id>`.
 */
export type Stage = "plan" | "build" | "verify" | "review";
/** The stages in loop order. `plan` terminates with a park, not an advance. */
export declare const STAGES: readonly Stage[];
/** Link to the backlog task driving the loop, when started from one. */
export interface TaskRef {
    readonly id: string;
    /** Current on-disk path of the task file (updated as it moves between folders). */
    readonly path: string;
    /** Acceptance criteria threaded into the build/verify prompts. */
    readonly acceptance: readonly string[];
}
/** The git isolation for one loop's execution: work happens on `branch`, cut from `base`. */
export interface GitRef {
    readonly base: string;
    readonly branch: string;
    /**
     * Absolute path to this loop's dedicated worktree, when worktree isolation is
     * enabled (`worktreesDir` config). Absent ⇒ shared-tree mode: `branch` is
     * checked out in the main tree. Present ⇒ stages run pinned to this directory.
     */
    readonly worktree?: string;
}
export interface LoopState {
    /** The goal the loop is driving toward. */
    readonly goal: string;
    /** The stage currently running or most recently completed. */
    readonly stage: Stage;
    /** 0-based loop iteration; incremented on a verify-FAIL or review-FAIL re-build. */
    readonly iteration: number;
    /** Captured output text per completed stage, used to thread context forward.
     *  Also carries the approved plan under the `plan` key. */
    readonly artifacts: Readonly<Partial<Record<Stage | "plan", string>>>;
    /** Set when the loop was started from a backlog task; absent only for defensive fallbacks. */
    readonly task?: TaskRef;
    /** Set by the driver once execution is isolated on its own git branch. */
    readonly git?: GitRef;
}
/** What the driver should do next. All state changes are returned, not applied. */
export type Action = {
    readonly kind: "fire";
    readonly stage: Stage;
    readonly arguments: string;
} | {
    readonly kind: "done";
    readonly message: string;
}
/** PLAN finished: the driver validates the written plan, moves the task to `plan-review/`, and the loop exits. */
 | {
    readonly kind: "park";
    readonly message: string;
} | {
    readonly kind: "stop";
    readonly message: string;
} | {
    readonly kind: "noop";
};
export interface Config {
    readonly maxIterations: number;
    /** Repo-relative root of the task backlog (folders are statuses). */
    readonly tasksDir: string;
    /** Wall-clock cap on a single stage before the loop gives up on it. */
    readonly stageTimeoutMinutes: number;
    /** Per-task worktree root; unset ⇒ shared-tree branch switching. */
    readonly worktreesDir?: string;
    /** Shell command run in a fresh worktree after creation. */
    readonly worktreeSetup?: string;
    /** Extra REVIEW lenses; each runs one more focused review pass. */
    readonly reviewLenses: readonly string[];
}
/** Construct a LoopState entering execution at build, for a claimed
 *  in-progress task whose plan was approved via `/agent-loop-task approve-plan`. */
export declare const resumeAtBuild: (goal: string, task: TaskRef, plan: string) => LoopState;
/** Construct a LoopState entering at the PLAN stage, for a claimed `queued/`
 *  task. `priorPlan` carries a rejected/capped plan on a replan so the new
 *  plan addresses why the old one failed instead of repeating it. */
export declare const startAtPlan: (goal: string, task: TaskRef, priorPlan?: string) => LoopState;
/** Compose the prompt threaded into a stage command: goal + relevant prior artifacts. */
export declare const composeArgs: (state: LoopState, target: Stage) => string;
/**
 * Decide what to do when the session goes idle after `state.stage` completed.
 * `output` is that stage's captured assistant text (stored as its artifact).
 * `verdict` is the check stage's resolved verdict — recorded via the
 * `loop_verdict` tool and resolved by the driver, never parsed out of
 * `output` here (free text is an untrusted channel; see verdict.ts). A
 * missing verdict is a FAIL, not a stall.
 */
export declare const advanceOnIdle: (state: LoopState, config: Config, output: string, verdict?: Verdict | null) => {
    state: LoopState;
    action: Action;
};
/** The first step to drive for a freshly-constructed state — fires its own stage. */
export declare const firstStep: (state: LoopState) => {
    state: LoopState;
    action: Action;
};
export declare const getLoop: (sessionID: string) => LoopState | undefined;
/** The session whose live loop is driving the given task id, if any (this plugin instance only). */
export declare const findSessionDriving: (taskId: string) => string | undefined;
export declare const setLoop: (sessionID: string, state: LoopState) => void;
export declare const clearLoop: (sessionID: string) => boolean;
export declare const hasLoop: (sessionID: string) => boolean;
