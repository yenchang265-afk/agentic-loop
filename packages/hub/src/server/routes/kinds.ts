import { listLoopKinds, loadManifest } from "@agentic-loop/core/manifest/load"
import type { KindDetailResponse, KindsResponse } from "../../shared/api.js"
import type { HubDeps } from "../deps.js"
import { notFound, ok, type JsonResponse, type ParsedRequest } from "../http.js"

/** Loop-kind manifest views for the creator tab. */

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
