import type { Client, Log, Shell } from "../host.js";
import type { LoadedManifest } from "../manifest/schema.js";
import type { AdoConfig } from "../loop/state.js";
import type { WorkSource } from "./types.js";
interface AdoPrDeps {
    readonly $: Shell;
    readonly client: Client;
    readonly directory: string;
    readonly tasksDir: string;
    readonly log: Log;
    readonly loaded: LoadedManifest;
    /** Azure DevOps coordinates (config `ado`). */
    readonly ado: AdoConfig;
    /** Clock injection for ledger stamps; defaults to the real time. */
    readonly now?: () => string;
}
export declare const makeAdoPrSource: (deps: AdoPrDeps) => WorkSource;
export {};
