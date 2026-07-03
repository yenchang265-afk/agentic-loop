# agentic-loop

OpenCode plugin: `/loop` drives the full agentic development lifecycle
(define → plan → build → verify → review → ship) as one pipeline with two
human gates. See [AGENTS.md](AGENTS.md) for the skill-invocation rules,
intent→skill mapping, and plugin structure — that file is the single source
of truth for how agents should operate in this repo; don't restate it here.

## Project Structure

```
src/           → plugin implementation: index.ts (entry), loop/ (state machine,
                 driver, verdicts), task/ (backlog schema + store), config.ts
.opencode/     → agents/ and commands/ backing each /loop stage;
                 .opencode/skills symlinks to skills/
skills/        → skill library (SKILL.md per directory) invoked via the
                 `skill` tool, both by /loop stage agents and ad-hoc
references/    → supplementary checklists skills pull in when needed
```

## Conventions

- Every skill lives in `skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`)
- Description starts with what the skill does (third person), followed by trigger conditions ("Use when...")
- Every skill has: Overview, When to Use, Process, Common Rationalizations, Red Flags, Verification
- References are in `references/`, not inside skill directories

## Commands

- `npm install && npm run typecheck && npm test` — `tsc --noEmit` plus the `src/**/*.test.ts` unit tests for the loop state machine and task backlog

## Boundaries

- Never: Add skills that are vague advice instead of actionable processes
- Never: Duplicate content between skills — reference other skills instead
