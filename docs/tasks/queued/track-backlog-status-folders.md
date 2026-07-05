---
title: Track all backlog status folders in git
priority: 1
acceptance:
  - all seven status folders (draft, queued, plan-review, in-progress, in-review, completed, abandoned) exist under docs/tasks/ as tracked git paths (.gitkeep)
  - the task-backlog-management skill's folder checklist passes against a fresh clone
---
The repo ships the agentic-loop backlog tooling but has no docs/tasks/ tree of
its own — a fresh clone fails the task-backlog-management skill's verification
checklist ("all status folders exist, even if empty, via .gitkeep"), and
/explore or the loop would create folders ad hoc. Track the seven status
folders with .gitkeep files so the backlog root is present from clone time.

> Task approved — queued for planning [2026-07-05T13:13:18.955Z]
