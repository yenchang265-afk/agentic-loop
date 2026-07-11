import type { BacklogSummary, TaskStatus } from "@agentic-loop/core/task/store"
import type { BacklogAnomalies } from "@agentic-loop/core/task/audit"
import type { LoopManifest } from "@agentic-loop/core/manifest/schema"

/**
 * The hub's wire types, shared verbatim by the node server and the browser
 * bundle. Type-only imports from core keep the two sides in lockstep with the
 * real backlog/manifest shapes without pulling core code into the SPA.
 */

/** A task card on the monitor board — frontmatter summary, no body. */
export interface TaskCard {
  readonly id: string
  readonly title: string
  readonly type?: string
  readonly priority: number
  readonly labels: readonly string[]
  readonly acceptance: readonly string[]
  readonly paired: boolean
  readonly hasPlan: boolean
}

export interface BacklogResponse {
  readonly statuses: readonly TaskStatus[]
  readonly tasks: Readonly<Record<TaskStatus, readonly TaskCard[]>>
  readonly summary: BacklogSummary
  readonly claimedIds: readonly string[]
  /** Structural anomalies from the backlog audit; null when the sweep found none. */
  readonly anomalies: BacklogAnomalies | null
}

/** One `> <event> [<ISO> by <actor>]` audit blockquote from a task body. */
export interface AuditNote {
  readonly event: string
  readonly at: string
  readonly by: string
}

export interface TaskDetailResponse {
  readonly card: TaskCard
  readonly status: TaskStatus
  readonly body: string
  readonly plan?: string
  readonly notes: readonly AuditNote[]
}

export interface KindSummary {
  readonly kind: string
  readonly description: string
  readonly stages: readonly string[]
}

export interface KindsResponse {
  readonly kinds: readonly KindSummary[]
}

export interface KindDetailResponse {
  readonly manifest: LoopManifest
  readonly prompts: Readonly<Record<string, string>>
}

export interface ApiError {
  readonly error: string
}
