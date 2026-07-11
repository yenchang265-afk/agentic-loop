import {
  STATUSES,
  findByIdIn,
  hasPlan,
  extractPlan,
  listByStatus,
  listClaimIds,
  summarizeBacklog,
  type TaskStatus,
} from "@agentic-loop/core/task/store"
import { isPaired, type Task } from "@agentic-loop/core/task/schema"
import { auditBacklog, hasAnomalies } from "@agentic-loop/core/task/audit"
import type { BacklogResponse, TaskCard, TaskDetailResponse } from "../../shared/api.js"
import type { HubDeps } from "../deps.js"
import { badRequest, notFound, ok, type JsonResponse, type ParsedRequest } from "../http.js"
import { extractAuditNotes } from "../notes.js"

/** Read-only backlog views: the board roll-up and single-task detail. */

const toCard = (task: Task): TaskCard => ({
  id: task.id,
  title: task.title,
  type: task.type,
  priority: task.priority,
  labels: task.labels,
  acceptance: task.acceptance,
  paired: isPaired(task),
  hasPlan: hasPlan(task),
})

const isStatus = (s: string): s is TaskStatus => (STATUSES as readonly string[]).includes(s)

export const getBacklog = async (deps: HubDeps): Promise<JsonResponse> => {
  const byStatus: Partial<Record<TaskStatus, readonly Task[]>> = {}
  for (const status of STATUSES) {
    byStatus[status] = await listByStatus(deps.client, deps.directory, deps.tasksDir, status, deps.log)
  }
  const full = byStatus as Readonly<Record<TaskStatus, readonly Task[]>>
  const claimedIds = await listClaimIds(deps.sh, deps.directory, deps.tasksDir)
  const anomalies = await auditBacklog(deps.client, deps.directory, deps.tasksDir)
  const cards = {} as Record<TaskStatus, readonly TaskCard[]>
  for (const status of STATUSES) cards[status] = (full[status] ?? []).map(toCard)
  const response: BacklogResponse = {
    statuses: STATUSES,
    tasks: cards,
    summary: summarizeBacklog(full, claimedIds),
    claimedIds,
    anomalies: hasAnomalies(anomalies) ? anomalies : null,
  }
  return ok(response)
}

export const getTaskDetail = async (deps: HubDeps, req: ParsedRequest): Promise<JsonResponse> => {
  const status = req.params["status"] ?? ""
  const id = req.params["id"] ?? ""
  if (!isStatus(status)) return badRequest(`unknown status "${status}"`)
  const task = await findByIdIn(deps.sh, deps.directory, deps.tasksDir, status, id, deps.log)
  if (!task) return notFound(`task ${id} in ${status}`)
  const response: TaskDetailResponse = {
    card: toCard(task),
    status,
    body: task.body,
    plan: extractPlan(task),
    notes: extractAuditNotes(task.body),
  }
  return ok(response)
}
