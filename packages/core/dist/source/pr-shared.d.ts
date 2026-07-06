import type { Shell } from "../host.js";
import type { LoadedManifest } from "../manifest/schema.js";
import type { CodePlatform } from "../loop/state.js";
import type { PrLedger, PrSnapshot, PrTrigger } from "./ledger.js";
import type { TerminalOutcome, WorkItem } from "./types.js";
/**
 * The platform-neutral pieces shared by the hosted-PR work sources
 * (`github-pr.ts`, `ado-pr.ts`): human summaries of why a PR needs attention,
 * local claim markers (no hosted platform offers an atomic claim), fetching
 * the PR head for isolation reuse, and the WorkItem builder. Everything here
 * works on the normalized `PrSnapshot`, never on raw platform output.
 */
export declare const triggerSummary: (triggers: readonly PrTrigger[], snapshot: PrSnapshot) => string;
/** Local mkdir claim markers under `<tasksDir>/runs/pr-sitter/.claims/pr-<n>` — atomic across watchers on this filesystem. */
export declare const makeClaimMarkers: ($: Shell, directory: string, tasksDir: string) => {
    claim: (pr: number) => Promise<boolean>;
    release: (pr: number) => Promise<void>;
};
/** Fetch the PR head into a local branch ref so isolation can reuse it. */
export declare const fetchHead: ($: Shell, directory: string, headRef: string) => Promise<boolean>;
/**
 * The ledger update a terminal outcome earns. `freshHead`/`lastCommentAt` are
 * the PR's re-read state (a done outcome usually follows the sitter's own
 * push; recording it as handled is what prevents self-triggering). Pure.
 */
export declare const terminalLedgerUpdate: (ledger: PrLedger, outcome: TerminalOutcome, triggers: readonly PrTrigger[], snapshotHead: string, freshHead: string, lastCommentAt: string, now: string) => PrLedger;
/** Build the WorkItem a claimed PR enters the loop as, stamped with its code platform. */
export declare const prWorkItem: (loaded: LoadedManifest, platform: CodePlatform, snapshot: PrSnapshot, triggers: readonly PrTrigger[]) => WorkItem;
