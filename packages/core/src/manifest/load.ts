import fs from "node:fs"
import path from "node:path"
import { parseManifest, type LoadedManifest, type LoopManifest } from "./schema.js"

/**
 * Load loop-kind manifests from a `loops/` directory:
 *
 *   loops/<kind>/loop.json      — the manifest (schema.ts)
 *   loops/<kind>/stages/*.md    — per-stage prompt templates (template.ts)
 *
 * Loading is synchronous, once, at host startup — manifests are plugin
 * assets, not runtime state. A malformed manifest throws with the offending
 * path so a broken loop kind fails loud instead of driving garbage.
 */

/**
 * Work-source type names that were renamed after release, mapped old → new.
 * User-authored manifests in the wild still carry the old spelling, so it stays
 * a supported alias rather than a schema error — silently, not with a warning,
 * because the hub's Config tab round-trips manifests through this loader.
 */
const LEGACY_SOURCE_TYPES: Readonly<Record<string, string>> = { "github-pr": "pull-request" }

/**
 * Rewrite legacy `workSource.type` spellings to their current names, before the
 * schema sees them. Input is unvalidated JSON, so every shape assumption is
 * checked — anything that isn't the exact shape we rewrite is passed through
 * untouched for zod to reject with its own message.
 */
export const normalizeManifestJson = (raw: unknown): unknown => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw
  const { workSource } = raw as { workSource?: unknown }
  if (typeof workSource !== "object" || workSource === null || Array.isArray(workSource)) return raw
  const { type } = workSource as { type?: unknown }
  if (typeof type !== "string") return raw
  const renamed = LEGACY_SOURCE_TYPES[type]
  if (!renamed) return raw
  return { ...raw, workSource: { ...workSource, type: renamed } }
}

/** Load one loop kind's manifest + stage prompts. Throws on missing/invalid files. */
export const loadManifest = (loopsDir: string, kind: string): LoadedManifest => {
  const dir = path.join(loopsDir, kind)
  const manifestPath = path.join(dir, "loop.json")
  let manifest: LoopManifest
  try {
    manifest = parseManifest(normalizeManifestJson(JSON.parse(fs.readFileSync(manifestPath, "utf8"))))
  } catch (err) {
    throw new Error(`could not load loop manifest ${manifestPath}: ${(err as Error).message}`)
  }
  if (manifest.kind !== kind) {
    throw new Error(`loop manifest ${manifestPath} declares kind "${manifest.kind}" but lives in loops/${kind}/`)
  }
  const prompts: Record<string, string> = {}
  for (const stage of manifest.stages) {
    const promptPath = path.join(dir, stage.prompt)
    try {
      prompts[stage.name] = fs.readFileSync(promptPath, "utf8")
    } catch (err) {
      throw new Error(`could not load stage prompt ${promptPath}: ${(err as Error).message}`)
    }
  }
  return { manifest, prompts }
}

/** Every loop kind defined under `loopsDir` (any directory holding a loop.json). */
export const listLoopKinds = (loopsDir: string): string[] => {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(loopsDir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(loopsDir, e.name, "loop.json")))
    .map((e) => e.name)
    .sort()
}
