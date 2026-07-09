import { STATUSES } from "./store.js";
const ALLOW = { allow: true };
const block = (reason) => ({ allow: false, reason });
const HOW_TO_MUTATE = "the folder a backlog file lives in IS its state — mutate it only through the loop tools " +
    "(loop_task_approve / loop_plan_approve / loop_replan / loop_ship / loop_move / loop_doctor) " +
    "or the /agent-loop-task verbs, never by hand.";
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The backlog-relative remainder of `filePath` (e.g. "draft/a.md"), or null when outside the backlog. */
export const backlogRelPath = (filePath, tasksDir) => {
    const normalized = filePath.replace(/\\/g, "/");
    const m = new RegExp(`(?:^|/)${escapeRe(tasksDir)}/(.+)$`).exec(normalized);
    return m?.[1] ?? null;
};
/**
 * Edit-shaped tools (Write / Edit / MultiEdit / NotebookEdit) targeting a
 * single file path. Allowed inside the backlog: authoring drafts
 * (`draft/*.md` — the `loop-plan-author` inbox) and a live PLAN stage writing
 * the plan onto its own task in `queued/`. Everything else — status folders,
 * `runs/`, unknown dirs — is blocked.
 */
export const classifyEdit = (filePath, ctx) => {
    const rel = backlogRelPath(filePath, ctx.tasksDir);
    if (rel === null)
        return ALLOW;
    const segments = rel.split("/");
    const isDirectMd = segments.length === 2 && segments[1].toLowerCase().endsWith(".md");
    if (isDirectMd && segments[0] === "draft")
        return ALLOW;
    if (isDirectMd && segments[0] === "queued" && ctx.planTaskId && segments[1] === `${ctx.planTaskId}.md`) {
        return ALLOW;
    }
    return block(`agentic-loop: direct edits under ${ctx.tasksDir}/ are limited to draft/*.md ` +
        `(and the live PLAN stage's own queued/ task) — ${HOW_TO_MUTATE}`);
};
// Read-only commands an agent may run against the backlog (glob syntax, same
// matcher semantics as the VERIFY/REVIEW stage allowlists).
const READ_ONLY = [
    "ls*",
    "cat *",
    "head *",
    "tail *",
    "grep *",
    "rg *",
    "find *",
    "wc *",
    "diff *",
    "stat *",
    "tree*",
    "git status*",
    "git diff*",
    "git log*",
    "git show*",
    "git blame*",
    "git -C * status*",
    "git -C * diff*",
    "git -C * log*",
    "git -C * show*",
    "git -C * blame*",
];
// Tokens that turn an otherwise read-only command into a mutation (find -exec/-delete).
const MUTATING_TOKENS = [" -exec", " -execdir", " -delete", " -ok "];
const toRe = (glob) => new RegExp("^" + glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "s");
const matchesAny = (cmd, globs) => globs.some((g) => toRe(g).test(cmd.trim()));
// Protected sub-folders: their presence signals a backlog reference even when the
// tasksDir prefix was split off by a `cd` (`cd docs && … tasks/queued/…`).
const PROTECTED_SUBDIRS = [...STATUSES, "runs"];
/**
 * Does `command` reference the backlog, even via an aliased path? Strip shell
 * quotes/backslashes first (so `docs/ta''sks`, `'docs/tasks'`, `docs/ta\sks`
 * collapse to `docs/tasks`), then match the full tasksDir OR a `<base>/<status>/`
 * subpath — what a `cd <parent>` split must still name to land in the folder.
 */
const referencesBacklog = (command, tasksDir) => {
    const norm = command.replace(/['"\\]/g, "");
    if (norm.includes(tasksDir))
        return true;
    const base = tasksDir.split("/").pop();
    return PROTECTED_SUBDIRS.some((s) => new RegExp(`(?:^|[^\\w])${escapeRe(base)}/${escapeRe(s)}(?:/|\\s|$)`).test(norm));
};
/**
 * Bash commands. A command that never references the backlog dir is allowed.
 * One that does is default-denied unless every pipeline segment matches the
 * read-only allowlist, with no output redirection and no `find -exec`-style
 * escape — so `mv`, `mkdir`, `rm`, `sed -i`, `tee`, and `>` into the backlog
 * are blocked by construction.
 */
export const classifyBash = (command, ctx) => {
    if (!referencesBacklog(command, ctx.tasksDir))
        return ALLOW;
    if (/>/.test(command)) {
        return block(`agentic-loop: redirecting output while referencing ${ctx.tasksDir}/ is blocked — ${HOW_TO_MUTATE}`);
    }
    if (MUTATING_TOKENS.some((t) => command.includes(t))) {
        return block(`agentic-loop: this command can mutate ${ctx.tasksDir}/ — ${HOW_TO_MUTATE}`);
    }
    // Split on newlines as well as shell operators: a bare `\n` chains two commands
    // just like `;`, and the read-only globs compile with the dotAll (`s`) flag, so
    // without this a read-only first line ("ls …") would let its `.*` span the newline
    // and swallow a following mutation ("rm -rf …"). Each line/segment must match the
    // allowlist on its own. (Residuals — heuristic defense-in-depth, not a sandbox:
    // a deep `cd docs/tasks/queued && cp x .` then bare relative op, `$(rm …)` command
    // substitution, and a dir name assembled from shell vars (`ta${x}sks`) still evade;
    // conversely a genuine unrelated `<base>/<status>/` path can produce a rare false block.)
    const segments = command
        .split(/&&|\|\||;|\||\n|\r/)
        .map((s) => s.trim())
        .filter(Boolean);
    if (segments.every((s) => matchesAny(s, READ_ONLY)))
        return ALLOW;
    return block(`agentic-loop: only read-only commands (ls/cat/head/tail/grep/rg/find/wc/diff/stat/tree, git reads) ` +
        `may reference ${ctx.tasksDir}/ — ${HOW_TO_MUTATE}`);
};
/** Route a tool call to the right classifier. Unknown tools are allowed (not this guard's concern). */
export const classifyMutation = (tool, args, ctx) => {
    if (/^(write|edit|multiedit|notebookedit)$/i.test(tool)) {
        return args.filePath ? classifyEdit(args.filePath, ctx) : ALLOW;
    }
    if (/^bash$/i.test(tool)) {
        return args.command ? classifyBash(args.command, ctx) : ALLOW;
    }
    return ALLOW;
};
/** Re-export for hosts that report which folders are protected. */
export const PROTECTED_STATUSES = STATUSES;
