---
description: Draft a backlog task by interviewing you, plan it, or approve the plan for execution by /agent-loop
argument-hint: new <idea> | task <id> | approve <id>
---

Plan authoring for the agentic loop — planning happens **here**, before the
loop; `/agent-loop` only executes approved plans.

**Argument:** `$ARGUMENTS`

Dispatch:

- **`new <idea>`** — turn a rough idea into a **planless draft** in
  `docs/tasks/draft/`. YOU (the current agent) run the interview — subagents
  cannot converse with the user:
  1. **Always** invoke the `interview-me` skill first (never silently skip):
     if the idea already states a clear goal and testable criteria, a single
     restate-and-confirm question suffices; when anything is vague, run the
     full one-question-at-a-time interview. Pin down the goal and 2–5
     testable acceptance criteria.
  2. Show the drafted task (title, priority, acceptance, body) and get an
     explicit "looks right" from the user.
  3. Invoke the **`loop-plan-author`** subagent with the confirmed details to
     write the single draft file. Drafting and planning are two steps by
     design — the human reviews the draft before plan effort is spent.
  4. **Offer to continue** — ask the user one plain question: "Draft `<id>`
     is written. Continue to planning now, or stop here?"
     - **Yes** → call the `loop_plan_task` tool with the id, then invoke
       **`loop-plan-author`** in `task` mode to write the
       `## Implementation Plan` onto the file in place. Show the user the
       plan (or a faithful summary) and ask the second gate: "Approve this
       plan and start the build now?"
     - **Yes again** → call `loop_plan_approve`, then `loop_start` with the
       same id, report each tool's message, and **end your turn** — the
       plugin drives BUILD → VERIFY → REVIEW once the turn settles. If
       `loop_start` says the task was just claimed by another watcher,
       report that as success by other means — do not retry.
     - **No at either gate, or any tool error** → stop cleanly and name the
       manual command that resumes from exactly there
       (`/agent-loop-plan task <id>` / `/agent-loop-plan approve <id>` /
       `/agent-loop task <id>`).
     Never call these tools without the explicit in-chat yes for that gate —
     one yes covers one gate only. Never skip a stage: the tools enforce
     draft → in-planning → in-progress one move at a time.
- **`task <id>`** — plan a task (`<id>` = filename without `.md`). The plugin
  first moves a `docs/tasks/draft/` task to `docs/tasks/in-planning/`
  (audited + committed) **before** this turn; then invoke **`loop-plan-author`**
  in `task` mode to read the task and the relevant code and write its
  `## Implementation Plan` onto that same file in place. Use this after
  reviewing a draft, for `/explore`-filed drafts, and to re-plan a task
  whose loop hit the iteration cap.
- **`approve <id>`** — the plugin handles this deterministically **before**
  this turn starts: it validates the task has an `## Implementation Plan`,
  moves it to `docs/tasks/in-progress/` (the approved queue
  `/agent-loop watch` claims from), appends an audited note, and commits.
  **Invoke nothing, write nothing** — report the toast's outcome (approved /
  no plan yet / not found) and stop.

The flow is two-step by design: `new` (interview → draft) → human reviews →
`task <id>` (plan written) → human reviews the plan → `approve <id>` → then
`/agent-loop task <id>` or `/agent-loop watch` executes it. The gates are
unchanged — each still needs its own explicit human yes — but after `new`
every gate can be taken conversationally in the same session (step 4 above)
instead of by re-invoking the command; the manual commands remain the
fallback and re-entry points.
