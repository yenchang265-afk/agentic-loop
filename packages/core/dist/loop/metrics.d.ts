import type { Stage } from "./state.js";
import type { Verdict } from "./verdict.js";
/**
 * Per-run stage metrics — wall-clock and verdict history — rendered into the
 * run log on a terminal event so "is the loop converging or burning
 * iterations?" is answerable weeks later. The accumulator lives in the driver
 * (keyed by session, in-memory); the rendering here is **pure**. See
 * docs/design/improvements/06.
 */
/** Token counts for one stage pass, when the host can observe them (opencode). */
export interface StageTokens {
    readonly input: number;
    readonly output: number;
    readonly reasoning: number;
    readonly cacheRead: number;
    readonly cacheWrite: number;
}
export interface StageSample {
    readonly stage: Stage;
    readonly iteration: number;
    readonly ms: number;
    /** Present for check stages (verify/review) only. */
    readonly verdict?: Verdict | "none";
    /** The review lens, when this sample is one lens pass of a multi-lens review. */
    readonly lens?: string;
    /** ISO start of the pass — lets host transcripts be joined by time window. */
    readonly startedAt?: string;
    /** Present only when the host observes usage (the Claude host cannot). */
    readonly tokens?: StageTokens;
    readonly cost?: number;
    readonly model?: string;
}
export type Outcome = "done" | "stopped" | "error";
/** Format a millisecond duration as `2m 41s` / `45s` / `1h 03m`. Pure. */
export declare const formatDuration: (ms: number) => string;
/** Format a token count as `12.3k` / `456` / `2.1M`. Pure. */
export declare const formatTokens: (n: number) => string;
/**
 * Render a `## Run summary` markdown block from the collected samples. Pure —
 * the caller stamps the timestamp and appends via `appendRunLog`. Token and
 * cost columns appear only when at least one sample carries usage, so logs
 * from hosts that can't observe tokens render exactly as before.
 */
export declare const renderRunSummary: (samples: readonly StageSample[], outcome: Outcome, detail: string, maxIterations: number, stampISO: string) => string;
