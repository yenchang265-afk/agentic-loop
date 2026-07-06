/**
 * The platform-neutral pieces shared by the hosted-PR work sources
 * (`github-pr.ts`, `ado-pr.ts`): human summaries of why a PR needs attention,
 * local claim markers (no hosted platform offers an atomic claim), fetching
 * the PR head for isolation reuse, and the WorkItem builder. Everything here
 * works on the normalized `PrSnapshot`, never on raw platform output.
 */
export const triggerSummary = (triggers, snapshot) => triggers
    .map((t) => {
    switch (t) {
        case "failing-checks":
            return `failing checks: ${snapshot.failingChecks.join(", ")}`;
        case "changes-requested":
            return "review requested changes";
        case "new-comments":
            return `${snapshot.newComments.length} unanswered comment(s)`;
        case "merge-conflict":
            return "merge conflict with the base branch";
    }
})
    .join("; ");
/** Local mkdir claim markers under `<tasksDir>/runs/pr-sitter/.claims/pr-<n>` — atomic across watchers on this filesystem. */
export const makeClaimMarkers = ($, directory, tasksDir) => {
    const claimsDir = `${directory}/${tasksDir}/runs/pr-sitter/.claims`;
    return {
        claim: async (pr) => {
            await $ `mkdir -p ${claimsDir}`.quiet().nothrow();
            const out = await $ `mkdir ${`${claimsDir}/pr-${pr}`}`.quiet().nothrow();
            return out.exitCode === 0;
        },
        release: async (pr) => {
            await $ `rmdir ${`${claimsDir}/pr-${pr}`}`.quiet().nothrow();
        },
    };
};
/** Fetch the PR head into a local branch ref so isolation can reuse it. */
export const fetchHead = async ($, directory, headRef) => {
    const out = await $ `git -C ${directory} fetch origin ${`+refs/heads/${headRef}:refs/heads/${headRef}`}`
        .quiet()
        .nothrow();
    if (out.exitCode !== 0) {
        // The branch may be checked out somewhere (fetch refuses to move it) —
        // fall back to a plain fetch so at least the remote ref is fresh.
        const plain = await $ `git -C ${directory} fetch origin ${headRef}`.quiet().nothrow();
        return plain.exitCode === 0;
    }
    return true;
};
/**
 * The ledger update a terminal outcome earns. `freshHead`/`lastCommentAt` are
 * the PR's re-read state (a done outcome usually follows the sitter's own
 * push; recording it as handled is what prevents self-triggering). Pure.
 */
export const terminalLedgerUpdate = (ledger, outcome, triggers, snapshotHead, freshHead, lastCommentAt, now) => outcome.kind === "done"
    ? {
        ...ledger,
        headShaHandled: freshHead,
        ...(lastCommentAt ? { lastCommentAtHandled: lastCommentAt } : {}),
        ...(triggers.includes("merge-conflict") ? { conflictAttempt: { headSha: freshHead, baseSha: "" } } : {}),
        updatedAt: now,
    }
    : {
        ...ledger,
        failedAttempts: [
            ...ledger.failedAttempts,
            { headSha: snapshotHead, trigger: triggers.join("+") || "unknown", at: now },
        ],
        updatedAt: now,
    };
/** Build the WorkItem a claimed PR enters the loop as, stamped with its code platform. */
export const prWorkItem = (loaded, platform, snapshot, triggers) => {
    const goal = `PR #${snapshot.number} "${snapshot.title}" — address what needs attention and get it back to green ` +
        `(${triggerSummary(triggers, snapshot)}). Base: ${snapshot.baseRefName}, head: ${snapshot.headRefName}. ` +
        `Never merge the PR; that stays a human call.`;
    const state = {
        kind: loaded.manifest.kind,
        goal,
        stage: loaded.manifest.stages[0]?.name ?? "triage",
        iteration: 0,
        artifacts: {},
        git: { base: snapshot.baseRefName, branch: snapshot.headRefName },
        platform,
    };
    return {
        id: `pr-${snapshot.number}`,
        loopKind: loaded.manifest.kind,
        title: `PR #${snapshot.number}: ${snapshot.title}`,
        entryStage: state.stage,
        state,
        claimMessage: `Watch: claimed PR #${snapshot.number} — ${triggerSummary(triggers, snapshot)}`,
        ref: { snapshot, triggers },
    };
};
