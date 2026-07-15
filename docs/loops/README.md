# Loop kinds

Each kind is a single agentic loop. Use the links below to get started with a specific kind, then read the canonical docs for full detail.

- [**engineering**](engineering.md) — PLAN (parks at human gate) → BUILD → VERIFY → REVIEW over `docs/tasks/` backlog
- [**pr-sitter**](pr-sitter.md) — TRIAGE → FIX → VERIFY → PUBLISH over open pull requests
- [**review-sitter**](review-sitter.md) — FETCH → ASSESS → PUBLISH over pull requests where your review is requested
- [**dep-sitter**](dep-sitter.md) — SCAN → UPGRADE → VERIFY → PUBLISH over vulnerable/outdated dependencies
- [**main-sitter**](main-sitter.md) — DIAGNOSE → REMEDY → VERIFY → PUBLISH over red default-branch CI

For the manifest format and authoring a new kind, see [`packages/core/loops/README.md`](../../packages/core/loops/README.md).
