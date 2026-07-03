# agentic-loop

**An OpenCode plugin that turns engineering workflow into an automatic agentic loop.**

`/loop <goal>` drives the full development lifecycle — DEFINE → PLAN → BUILD →
VERIFY → REVIEW → SHIP — as one pipeline, with two human gates: you approve
the plan before code gets written, and you review the findings and draft PR
before it ships.

```
  DEFINE          PLAN           BUILD          VERIFY         REVIEW          SHIP
 ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐
 │ Idea │ ───▶ │ Spec │ ───▶ │ Code │ ───▶ │ Test │ ───▶ │  QA  │ ───▶ │  Go  │
 │Refine│      │  PRD │      │ Impl │      │Debug │      │ Gate │      │ Live │
 └──────┘      └──────┘      └──────┘      └──────┘      └──────┘      └──────┘
```

## Install

```bash
git clone <this-repo>
cd agentic-loop
npm install
```

Point OpenCode at the plugin directory (or add it as a dependency per your
OpenCode plugin loading convention).

## Usage

- **`/loop <goal>`** — start a new loop for `<goal>`. Runs DEFINE then PLAN, then pauses for you to review the plan.
- **`/loop next`** — pick the highest-priority task from `docs/tasks/in-planning/` and start the loop on it.
- **`/loop task <id>`** — start the loop on a specific in-planning task.
- **`/loop go`** — approve whatever is currently gated (plan or review) and let the loop continue.
- **`/loop stop`** — abort the loop and clear its state.
- **`/loop status`** — print the current stage, iteration, and pause state.

On a VERIFY FAIL within the iteration cap, the loop re-plans with the failure
feedback; on a REVIEW FAIL within the cap, it re-builds with the review's
feedback. SHIP never pushes or opens a PR itself — you review the draft PR
description and rollback plan, then push and open the PR yourself. That's the
final human gate.

Outside the loop, one-off requests still get agent-driven skill execution via
[AGENTS.md](AGENTS.md) and the `skill` tool — the plugin ships a bundled
`skills/` library (spec-driven-development, test-driven-development,
code-review-and-quality, and 20+ others) that both the loop's stage agents and
ad-hoc requests invoke by name.

## Project Structure

```
src/           → plugin implementation: index.ts (entry), loop/ (state machine,
                 driver, verdicts), task/ (backlog schema + store), config.ts
.opencode/     → agents/ and commands/ backing each /loop stage;
                 .opencode/skills symlinks to skills/
skills/        → skill library (SKILL.md per directory) the stage agents and
                 ad-hoc requests invoke via the `skill` tool
references/    → supplementary checklists skills pull in when needed
```

## Development

```bash
npm install && npm run typecheck && npm test
```

`typecheck` runs `tsc --noEmit`; `test` runs the `src/**/*.test.ts` unit tests
for the loop state machine and task backlog.

## License

MIT
