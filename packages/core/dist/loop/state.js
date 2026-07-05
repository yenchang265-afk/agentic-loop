/** The stages in loop order. `plan` terminates with a park, not an advance. */
export const STAGES = ["plan", "build", "verify", "review"];
/** Construct a LoopState entering execution at build, for a claimed
 *  in-progress task whose plan was approved via `/agent-loop-task approve-plan`. */
export const resumeAtBuild = (goal, task, plan) => ({
    goal,
    stage: "build",
    iteration: 0,
    artifacts: { plan },
    task,
});
/** Construct a LoopState entering at the PLAN stage, for a claimed `queued/`
 *  task. `priorPlan` carries a rejected/capped plan on a replan so the new
 *  plan addresses why the old one failed instead of repeating it. */
export const startAtPlan = (goal, task, priorPlan) => ({
    goal,
    stage: "plan",
    iteration: 0,
    artifacts: priorPlan ? { plan: priorPlan } : {},
    task,
});
const withArtifact = (state, stage, output) => ({
    ...state,
    artifacts: { ...state.artifacts, [stage]: output },
});
/** Drop a stale check artifact so a re-build doesn't thread outdated feedback. */
const withoutArtifact = (state, stage) => {
    const { [stage]: _dropped, ...rest } = state.artifacts;
    return { ...state, artifacts: rest };
};
/** Compose the prompt threaded into a stage command: goal + relevant prior artifacts. */
export const composeArgs = (state, target) => {
    const a = state.artifacts;
    const accept = state.task?.acceptance ?? [];
    const acceptBlock = (heading) => `${heading}\n${accept.map((c) => `- ${c}`).join("\n")}`;
    const parts = [`Goal: ${state.goal}`];
    if (target === "plan") {
        if (state.task) {
            parts.push(`Task file: ${state.task.path} — write the ## Implementation Plan onto this file in place.`);
        }
        if (a.plan) {
            parts.push(`Prior plan (rejected or capped out — the new plan must address why this one failed, using the task file's audit notes):\n${a.plan}`);
        }
        if (accept.length)
            parts.push(acceptBlock("Acceptance criteria (the plan must lead to satisfying each):"));
    }
    else if (target === "build") {
        if (a.plan)
            parts.push(`Approved plan:\n${a.plan}`);
        if (a.verify)
            parts.push(`Verify failure to address:\n${a.verify}`);
        if (a.review)
            parts.push(`Review feedback to address:\n${a.review}`);
        if (accept.length)
            parts.push(acceptBlock("Acceptance criteria (the build must satisfy each):"));
    }
    else if (target === "verify") {
        if (a.plan)
            parts.push(`Plan & acceptance criteria:\n${a.plan}`);
        if (a.build)
            parts.push(`Build summary:\n${a.build}`);
        if (accept.length)
            parts.push(acceptBlock("Acceptance criteria (the verdict must check each):"));
    }
    else if (target === "review") {
        if (a.plan)
            parts.push(`Approved plan:\n${a.plan}`);
        if (a.build)
            parts.push(`Build summary:\n${a.build}`);
        if (state.git) {
            const wt = state.git.worktree;
            const diffCmd = wt
                ? `git -C ${wt} diff ${state.git.base}...${state.git.branch}`
                : `git diff ${state.git.base}...${state.git.branch}`;
            parts.push(`Diff boundary: this loop's work is the commits on branch ${state.git.branch} since ${state.git.base} — ` +
                `review exactly \`${diffCmd}\`, nothing outside it.`);
        }
    }
    // Worktree pinning: BUILD/VERIFY/REVIEW run in the one plugin instance, so the
    // isolated checkout is threaded in as an instruction rather than a real cwd.
    if (state.git?.worktree) {
        parts.push(`Worktree: this loop's isolated checkout is ${state.git.worktree} — every file you read, edit, or ` +
            `test lives THERE, not in the repo root. Use absolute paths under it for edit/read; prefix every ` +
            `shell command with \`cd ${state.git.worktree} && \` (or use \`git -C ${state.git.worktree} …\`). ` +
            `Never modify anything outside it.`);
    }
    return parts.join("\n\n");
};
const fire = (state, stage) => ({
    state: { ...state, stage },
    action: { kind: "fire", stage, arguments: composeArgs({ ...state, stage }, stage) },
});
/**
 * Decide what to do when the session goes idle after `state.stage` completed.
 * `output` is that stage's captured assistant text (stored as its artifact).
 * `verdict` is the check stage's resolved verdict — recorded via the
 * `loop_verdict` tool and resolved by the driver, never parsed out of
 * `output` here (free text is an untrusted channel; see verdict.ts). A
 * missing verdict is a FAIL, not a stall.
 */
export const advanceOnIdle = (state, config, output, verdict = null) => {
    const s = withArtifact(state, state.stage, output);
    switch (s.stage) {
        case "plan":
            // PLAN never advances into BUILD directly — the human plan gate sits
            // between them. The driver validates the written plan, moves the task
            // to plan-review/, and ends the loop.
            return {
                state: s,
                action: {
                    kind: "park",
                    message: "Plan written — parked in plan-review/ for human review. Approve with /agent-loop-task approve-plan.",
                },
            };
        case "build":
            return fire(s, "verify");
        case "verify": {
            if (verdict === "PASS") {
                return fire(s, "review");
            }
            if (verdict === "ERROR") {
                // The check itself couldn't run — a broken environment, not a bad
                // build. Re-building would burn iterations on something no build fixes.
                return {
                    state: s,
                    action: {
                        kind: "stop",
                        message: "✗ Loop stopped — verify could not run (environment/infrastructure error). Fix the environment, then /agent-loop recover the task.",
                    },
                };
            }
            // FAIL (or no recorded verdict): re-build if budget remains, else stop.
            if (s.iteration + 1 < config.maxIterations) {
                // Drop any stale review feedback — it judged an older build.
                const next = { ...withoutArtifact(s, "review"), iteration: s.iteration + 1 };
                return fire(next, "build");
            }
            return {
                state: s,
                action: {
                    kind: "stop",
                    message: `✗ Loop stopped — verify failed after ${config.maxIterations} iterations. If the plan itself is wrong, send it back to the PLAN stage with /agent-loop-task replan <id>.`,
                },
            };
        }
        case "review": {
            if (verdict === "PASS") {
                return {
                    state: s,
                    action: { kind: "done", message: "✓ Loop done — review passed. Ship it yourself." },
                };
            }
            if (verdict === "ERROR") {
                return {
                    state: s,
                    action: {
                        kind: "stop",
                        message: "✗ Loop stopped — review could not run (environment/infrastructure error). Fix the environment, then /agent-loop recover the task.",
                    },
                };
            }
            // FAIL (or no recorded verdict): re-build if budget remains, else stop.
            if (s.iteration + 1 < config.maxIterations) {
                // Drop the stale verify output — it passed on an older build.
                const next = { ...withoutArtifact(s, "verify"), iteration: s.iteration + 1 };
                return fire(next, "build");
            }
            return {
                state: s,
                action: {
                    kind: "stop",
                    message: `✗ Loop stopped — review failed after ${config.maxIterations} iterations. If the plan itself is wrong, send it back to the PLAN stage with /agent-loop-task replan <id>.`,
                },
            };
        }
    }
};
/** The first step to drive for a freshly-constructed state — fires its own stage. */
export const firstStep = (state) => ({
    state,
    action: { kind: "fire", stage: state.stage, arguments: composeArgs(state, state.stage) },
});
// --- In-memory store (lost on opencode restart; see README known limitations) ---
const store = new Map();
export const getLoop = (sessionID) => store.get(sessionID);
/** The session whose live loop is driving the given task id, if any (this plugin instance only). */
export const findSessionDriving = (taskId) => {
    for (const [sessionID, state] of store)
        if (state.task?.id === taskId)
            return sessionID;
    return undefined;
};
export const setLoop = (sessionID, state) => void store.set(sessionID, state);
export const clearLoop = (sessionID) => store.delete(sessionID);
export const hasLoop = (sessionID) => store.has(sessionID);
