import fs from "node:fs"
import path from "node:path"
import { listLoopKinds, loadManifest } from "@agentic-loop/core/manifest/load"
import { LoopManifestSchema, type LoopManifest } from "@agentic-loop/core/manifest/schema"
import type {
  ChecklistItem,
  KindDetailResponse,
  KindsResponse,
  ManifestIssue,
  SaveKindResponse,
  ValidateResponse,
} from "../../shared/api.js"
import type { HubDeps } from "../deps.js"
import { badRequest, json, notFound, ok, type JsonResponse, type ParsedRequest } from "../http.js"

/** Loop-kind manifest views + the creator's validate/save surface. */

/** Kind and stage names come from URLs and file writes — same slug rule everywhere. */
export const SLUG_RE = /^[a-z][a-z0-9-]{1,32}$/

export const getKinds = async (deps: HubDeps): Promise<JsonResponse> => {
  const kinds = listLoopKinds(deps.loopsDir).flatMap((kind) => {
    try {
      const { manifest } = loadManifest(deps.loopsDir, kind)
      return [{ kind, description: manifest.description, stages: manifest.stages.map((s) => s.name) }]
    } catch (err) {
      deps.log("warn", `skipping loop kind ${kind}: ${(err as Error).message}`)
      return []
    }
  })
  const response: KindsResponse = { kinds }
  return ok(response)
}

export const getKind = async (deps: HubDeps, req: ParsedRequest): Promise<JsonResponse> => {
  const kind = req.params["kind"] ?? ""
  if (!SLUG_RE.test(kind) || !listLoopKinds(deps.loopsDir).includes(kind)) return notFound(`loop kind ${kind}`)
  const { manifest, prompts } = loadManifest(deps.loopsDir, kind)
  const response: KindDetailResponse = { manifest, prompts }
  return ok(response)
}

// --- creator: validate + save ---

const issuesOf = (raw: unknown): ManifestIssue[] | null => {
  const result = LoopManifestSchema.safeParse(raw)
  if (result.success) return null
  return result.error.issues.map((i) => ({ path: i.path.join(".") || "(root)", message: i.message }))
}

export const validateKind = async (_deps: HubDeps, req: ParsedRequest): Promise<JsonResponse> => {
  const body = req.body as { manifest?: unknown } | undefined
  if (!body?.manifest) return badRequest("body must be {manifest}")
  const issues = issuesOf(body.manifest)
  const response: ValidateResponse = { valid: issues === null, issues: issues ?? [] }
  return ok(response)
}

const STUB = (kind: string, stage: string): string =>
  [
    `You are the ${stage.toUpperCase()} stage of the "${kind}" loop.`,
    "",
    "Goal: {{goal}}",
    "",
    "{{#task.id}}",
    "---",
    "Task: {{task.id}} — {{task.title}}",
    "{{/task.id}}",
    "",
    "---",
    `TODO: describe what ${stage} must do, its inputs (artifacts.<stage>), and`,
    "how it reports its result (work stages just finish; check stages MUST",
    "record a PASS/FAIL verdict via the loop_verdict tool).",
    "",
  ].join("\n")

/** Remaining manual steps for a saved kind, computed against the repo on disk. Pure given fs. */
const buildChecklist = (deps: HubDeps, manifest: LoopManifest): ChecklistItem[] => {
  const items: ChecklistItem[] = []
  const repo = deps.directory
  const agents = [...new Set(manifest.stages.map((s) => s.agent))]
  for (const agent of agents) {
    const dir = path.join(repo, "prompts", "agents", agent)
    items.push({ done: fs.existsSync(dir), label: `agent persona prompts/agents/${agent}/ (body.md + opencode.yaml + claude.yaml)` })
  }
  const missingAgent = agents.some((a) => !fs.existsSync(path.join(repo, "prompts", "agents", a)))
  items.push({ done: !missingAgent, label: "run `npm run gen:prompts` after authoring the personas" })
  for (const command of [...new Set(manifest.stages.map((s) => s.command))]) {
    const file = path.join(repo, "plugins", "opencode", "commands", `${command}.md`)
    items.push({ done: fs.existsSync(file), label: `opencode command wrapper plugins/opencode/commands/${command}.md` })
  }
  const claudeCmd = path.join(repo, "plugins", "claude", "commands", `${manifest.kind}.md`)
  items.push({ done: fs.existsSync(claudeCmd), label: `Claude command plugins/claude/commands/${manifest.kind}.md (/agentic-loop:${manifest.kind})` })
  const hookRefs = [...Object.values(manifest.hooks.compose ?? {}), ...Object.values(manifest.hooks.validateBeforeTransition ?? {})]
  for (const ref of hookRefs) {
    items.push({ done: false, label: `register hook "${ref}" at host startup (pattern: packages/core/src/kinds/)` })
  }
  let enabled = false
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(repo, ".agentic-loop.json"), "utf8")) as {
      loops?: Record<string, { enabled?: boolean }>
    }
    enabled = cfg.loops?.[manifest.kind]?.enabled === true
  } catch {
    // no config — engineering is default-on, everything else opt-in
  }
  if (manifest.kind !== "engineering") {
    items.push({ done: enabled, label: `enable in .agentic-loop.json: {"loops": {"${manifest.kind}": {"enabled": true}}}` })
  }
  return items
}

export const saveKind = async (deps: HubDeps, req: ParsedRequest): Promise<JsonResponse> => {
  const kind = req.params["kind"] ?? ""
  if (!SLUG_RE.test(kind)) return badRequest(`kind must match ${SLUG_RE}`)
  const body = req.body as
    | { manifest?: unknown; prompts?: Record<string, string>; overwrite?: boolean }
    | undefined
  if (!body?.manifest) return badRequest("body must be {manifest, prompts?, overwrite?}")

  const issues = issuesOf(body.manifest)
  if (issues) return json(400, { error: "manifest invalid", issues })
  const manifest = LoopManifestSchema.parse(body.manifest)
  if (manifest.kind !== kind) return badRequest(`manifest.kind "${manifest.kind}" must equal the URL kind "${kind}"`)
  for (const stage of manifest.stages) {
    if (!SLUG_RE.test(stage.name)) return badRequest(`stage name "${stage.name}" must match ${SLUG_RE}`)
    if (stage.prompt !== `stages/${stage.name}.md`)
      return badRequest(`hub-authored kinds keep prompts at stages/<stage>.md — stage "${stage.name}" declares "${stage.prompt}"`)
  }

  const loopsRoot = path.resolve(deps.loopsDir)
  const dir = path.resolve(loopsRoot, kind)
  if (dir !== path.join(loopsRoot, kind) || !dir.startsWith(loopsRoot + path.sep)) return badRequest("bad kind path")
  const exists = fs.existsSync(path.join(dir, "loop.json"))
  if (exists && !body.overwrite) return json(409, { error: `loop kind "${kind}" already exists — pass overwrite to update it` })

  const written: string[] = []
  fs.mkdirSync(path.join(dir, "stages"), { recursive: true })
  fs.writeFileSync(path.join(dir, "loop.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  written.push(`loops/${kind}/loop.json`)
  for (const stage of manifest.stages) {
    const file = path.join(dir, "stages", `${stage.name}.md`)
    const provided = body.prompts?.[stage.name]
    if (provided !== undefined && (body.overwrite || !fs.existsSync(file))) {
      fs.writeFileSync(file, provided.endsWith("\n") ? provided : `${provided}\n`)
      written.push(`loops/${kind}/stages/${stage.name}.md`)
    } else if (!fs.existsSync(file)) {
      fs.writeFileSync(file, STUB(kind, stage.name))
      written.push(`loops/${kind}/stages/${stage.name}.md (stub)`)
    }
  }

  const response: SaveKindResponse = { written, checklist: buildChecklist(deps, manifest) }
  return ok(response)
}
