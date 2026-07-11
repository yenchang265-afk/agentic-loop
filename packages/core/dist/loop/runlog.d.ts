/**
 * Parse the durable run log (`<tasksDir>/runs/<id>.md`) back into structure.
 * The writers live beside this module: stage sections are appended by the
 * hosts via `appendRunLog` with `## <stage>[ (lens: <l>)] · iteration N · <ISO>`
 * headers, and terminal events append `## run · <outcome>` followed by the
 * `## Run summary · …` block from `renderRunSummary` (metrics.ts). Keeping
 * parser and writers in one package lets the round-trip be tested in one
 * place. Pure; tolerant of unknown sections (forward compatibility).
 */
export interface RunLogStageSection {
    readonly stage: string;
    readonly lens?: string;
    /** 1-based, as written in the header. */
    readonly iteration: number;
    readonly at: string;
    /** The stage's captured output (trimmed). */
    readonly body: string;
}
export interface RunSummaryRow {
    readonly stage: string;
    readonly lens?: string;
    /** 1-based, as rendered in the table. */
    readonly iteration: number;
    /** `PASS` / `FAIL` / `ERROR` / `none`; undefined when rendered as `—`. */
    readonly verdict?: string;
    /** Wall-clock as rendered (`2m 41s`); `seconds` is its parsed value. */
    readonly duration: string;
    readonly seconds: number;
    /** Raw cell text of any extra columns (e.g. tokens/cost added later), keyed by header. */
    readonly extra: Readonly<Record<string, string>>;
}
export interface RunLogSummary {
    readonly outcome: string;
    readonly detail?: string;
    readonly at: string;
    readonly rows: readonly RunSummaryRow[];
    readonly iterationsUsed?: number;
    readonly cap?: number;
    readonly total?: string;
    /** Total run cost in dollars, when the footer carries a `cost: $…` segment. */
    readonly cost?: number;
}
export interface ParsedRunLog {
    readonly sections: readonly RunLogStageSection[];
    readonly summaries: readonly RunLogSummary[];
}
/** Inverse of metrics.ts `formatDuration` (`1h 03m` / `2m 41s` / `45s`) → seconds. Pure. */
export declare const parseDuration: (text: string) => number;
/** Parse a run log's markdown. Unknown `##` sections are skipped. Pure. */
export declare const parseRunLog: (markdown: string) => ParsedRunLog;
