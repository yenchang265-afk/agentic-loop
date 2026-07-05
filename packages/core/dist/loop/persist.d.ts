import type { Client, Shell } from "../host.js";
import { type LoopState } from "./state.js";
/** Absolute path of a task's state snapshot. Pure. */
export declare const statePath: (directory: string, tasksDir: string, id: string) => string;
/** Write a snapshot of the loop state. Best-effort — never fails the drive over telemetry. */
export declare const saveState: ($: Shell, directory: string, tasksDir: string, id: string, state: LoopState) => Promise<void>;
/** Load and validate a snapshot; null on absent, unreadable, invalid JSON, or schema failure. */
export declare const loadState: (client: Client, directory: string, tasksDir: string, id: string) => Promise<LoopState | null>;
/** Remove a task's snapshot. Best-effort; idempotent on an absent file. */
export declare const clearState: ($: Shell, directory: string, tasksDir: string, id: string) => Promise<void>;
/** Task ids that have a state snapshot on disk (a strong "resume me" signal). `[]` if none. */
export declare const listSnapshotIds: (client: Client, directory: string, tasksDir: string) => Promise<string[]>;
