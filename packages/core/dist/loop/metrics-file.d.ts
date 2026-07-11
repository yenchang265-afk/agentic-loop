import { z } from "zod";
/**
 * The structured metrics sidecar, `<tasksDir>/runs/<id>.metrics.json` — the
 * machine-readable twin of the run log's summary table. One entry is appended
 * per terminal event (done/stopped/error), mirroring the run-log convention.
 * Durable telemetry like the run logs themselves: numbers and stage names
 * only, no captured output, no secrets.
 *
 * `host` makes the observation asymmetry explicit: the opencode driver sees
 * per-stage tokens/cost (and records its sessionID so host storage can be
 * joined exactly); the Claude host never calls the LLM itself, so its entries
 * carry timing/verdicts only and tokens are joined from transcripts.
 */
export declare const RUN_METRICS_VERSION: 1;
declare const MetricsSampleSchema: z.ZodObject<{
    stage: z.ZodString;
    iteration: z.ZodNumber;
    ms: z.ZodNumber;
    verdict: z.ZodOptional<z.ZodString>;
    lens: z.ZodOptional<z.ZodString>;
    startedAt: z.ZodOptional<z.ZodString>;
    tokens: z.ZodOptional<z.ZodObject<{
        input: z.ZodNumber;
        output: z.ZodNumber;
        reasoning: z.ZodNumber;
        cacheRead: z.ZodNumber;
        cacheWrite: z.ZodNumber;
    }, z.core.$strip>>;
    cost: z.ZodOptional<z.ZodNumber>;
    model: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
declare const RunEntrySchema: z.ZodObject<{
    endedAt: z.ZodString;
    outcome: z.ZodEnum<{
        error: "error";
        done: "done";
        stopped: "stopped";
    }>;
    detail: z.ZodDefault<z.ZodString>;
    host: z.ZodEnum<{
        opencode: "opencode";
        claude: "claude";
    }>;
    sessionID: z.ZodOptional<z.ZodString>;
    samples: z.ZodArray<z.ZodObject<{
        stage: z.ZodString;
        iteration: z.ZodNumber;
        ms: z.ZodNumber;
        verdict: z.ZodOptional<z.ZodString>;
        lens: z.ZodOptional<z.ZodString>;
        startedAt: z.ZodOptional<z.ZodString>;
        tokens: z.ZodOptional<z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
            reasoning: z.ZodNumber;
            cacheRead: z.ZodNumber;
            cacheWrite: z.ZodNumber;
        }, z.core.$strip>>;
        cost: z.ZodOptional<z.ZodNumber>;
        model: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const RunMetricsSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    runs: z.ZodArray<z.ZodObject<{
        endedAt: z.ZodString;
        outcome: z.ZodEnum<{
            error: "error";
            done: "done";
            stopped: "stopped";
        }>;
        detail: z.ZodDefault<z.ZodString>;
        host: z.ZodEnum<{
            opencode: "opencode";
            claude: "claude";
        }>;
        sessionID: z.ZodOptional<z.ZodString>;
        samples: z.ZodArray<z.ZodObject<{
            stage: z.ZodString;
            iteration: z.ZodNumber;
            ms: z.ZodNumber;
            verdict: z.ZodOptional<z.ZodString>;
            lens: z.ZodOptional<z.ZodString>;
            startedAt: z.ZodOptional<z.ZodString>;
            tokens: z.ZodOptional<z.ZodObject<{
                input: z.ZodNumber;
                output: z.ZodNumber;
                reasoning: z.ZodNumber;
                cacheRead: z.ZodNumber;
                cacheWrite: z.ZodNumber;
            }, z.core.$strip>>;
            cost: z.ZodOptional<z.ZodNumber>;
            model: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type MetricsSample = z.infer<typeof MetricsSampleSchema>;
export type RunEntry = z.infer<typeof RunEntrySchema>;
export type RunMetrics = z.infer<typeof RunMetricsSchema>;
/** Absolute path of a task's metrics sidecar. Pure. */
export declare const metricsPath: (directory: string, tasksDir: string, id: string) => string;
/** Parse a sidecar's raw JSON; null on unparseable or schema-invalid content (fail closed). Pure. */
export declare const parseRunMetrics: (raw: string) => RunMetrics | null;
/**
 * Append one run entry to a sidecar's existing content (null/unparseable →
 * start fresh — telemetry never fails a run over a corrupt file) and return
 * the new serialized document. Pure.
 */
export declare const appendRunMetrics: (existingRaw: string | null, run: RunEntry) => string;
export {};
