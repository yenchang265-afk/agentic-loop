# OpenCode plugin

How the OpenCode variant executes, its full command surface, and install
details. For the shared pipeline picture see
[architecture.md](architecture.md); for the Claude Code variant see
[`claude-plugin/README.md`](../claude-plugin/README.md).

## Execution model

Work runs either on demand (`/agent-loop task <id>`) or in a `/agent-loop watch
[interval]` worker session, which claims tasks on every idle tick plus a
polling timer (default 5m, e.g. `/agent-loop watch 30s`) — build-ready
`in-progress/` tasks first, then `queued/` tasks to plan. A claimed queued
task runs the PLAN stage: the plan is written onto the task file (main tree,
no branch) and the task **parks in `plan-review/`** for the human plan gate
— the loop exits rather than blocking. Execution is
isolated on a `loop/<id>` git branch with a commit checkpoint per build
iteration; VERIFY/REVIEW record their verdicts through a `loop_verdict`
plugin tool (free-text verdicts are ignored), and every approval, verdict,
and build run is appended to the task file as a timestamped, attributed
audit note. Re-build loops are capped by `maxIterations` — if the cap trips,
the plan itself is suspect and a human sends it back with
`/agent-loop-task replan <id> <why>`.
A stage that outlives `stageTimeoutMinutes` fails the loop instead of
hanging it. On a REVIEW PASS the task parks in `in-review/` — the loop never
pushes or opens a PR itself; you review the branch diff, then run
`/agent-loop ship <id>` to move it to `completed/`. A run that stops early —
a crash, or a user **interrupt (ESC)** mid-drive — is resumed with
`/agent-loop recover <id>`: loop state is snapshotted after every stage, so
recovery resumes at the exact stage it reached. ESC is a **pause** — it halts
the loop after the in-flight stage settles and stops watch mode, but keeps the
snapshot (recover picks up there); a deliberate `/agent-loop stop` **ends** the
run and drops the snapshot, so there is nothing to recover.

Both knobs above (and the optional hardening: worktrees, review lenses,
secret redaction, run summaries) are configured in `.agentic-loop.json` —
see [configuration.md](configuration.md).

## Commands

Authoring + gates (`/agent-loop-task`):

- `/agent-loop-task new <idea>` — interview you (always — at minimum a
  restate-and-confirm) into a **planless draft** in `docs/tasks/draft/`
- `/agent-loop-task retask <id> [note]` — reshape a `draft/` task before you
  approve it: re-interview you (seeded by the optional note) and rewrite the
  same draft in place — same id, no plan. Drafts only (a parked plan uses
  `replan`)
- `/agent-loop-task approve <id>` — the task gate: park the reviewed draft in
  `docs/tasks/queued/` (audited + committed); the loop plans it on claim
- `/agent-loop-task approve-plan <id>` — the plan gate: validate the parked
  plan and move the task to `docs/tasks/in-progress/` (the build-ready
  queue), audited + committed
- `/agent-loop-task replan <id> [reason]` — reject a parked plan (or send a
  cap-tripped task back): moves it to `queued/` with the reason audited

The loop (`/agent-loop`):

- `/agent-loop task <id>` — run one task now: a `queued/` task enters at PLAN
  (plans, parks in `plan-review/`, exits); an `in-progress/` task enters at
  BUILD
- `/agent-loop watch [interval]` — turn this session into a worker: claims
  work on idle events plus a polling timer (`30s`, `5m`, `2h`, bare number =
  minutes; default `watchIntervalMinutes`); build work beats plan work.
  Takes the clone's **watch lease** (`runs/.watch-lease/`, heartbeat every
  tick) — a second opencode process watching the same clone is refused; a
  dead watcher's lease is taken over once its heartbeat goes stale
- `/agent-loop unwatch` — stop this session from claiming new work (timer
  included). Pressing **ESC** mid-drive does this too *and* interrupts the
  running loop (see `recover`); `unwatch` only clears the watch flag and leaves
  an in-flight loop to finish
- `/agent-loop doctor [fix]` — audit the backlog for stray folders/files,
  duplicate ids, and held claim markers; `fix` applies the unambiguous
  repairs (rescue strays to `draft/`, drop emptied folders, release stale
  markers)
- `/agent-loop recover <id>` — resume an in-progress task whose run stopped
  early — a crash/restart, or a user **interrupt (ESC)** — from its state
  snapshot (or its persisted plan), at the exact stage it reached
- `/agent-loop ship <id>` — move a reviewed `in-review/` task to `completed/`, audited
- `/agent-loop stop` — abort, clear state, and exit watch mode; **drops the
  snapshot** (deliberate end — nothing to recover, unlike an ESC pause)
- `/agent-loop status` — print the current loop (stage, iteration, watch cadence)
  plus a whole-backlog roll-up (counts, awaiting-approval/claimable/
  interrupted/in-review)

The old `/agent-loop <goal>` free-text mode, `/agent-loop next`, and `/agent-loop go` are gone —
task authoring and both gates always go through `/agent-loop-task`.

Gates on this substrate are **park-only**: watch mode has no interactive
channel, so a parked plan or a finished loop always waits for the
`/agent-loop-task approve-plan` / `/agent-loop ship` verbs. (The Claude Code
variant additionally offers the same choices inline via AskUserQuestion when
a human is driving.)

Outside the loop, one-off requests are handled ad hoc: see
[AGENTS.md](../AGENTS.md) for the intent-to-skill mapping — the plugin
bundles a `skills/` library (spec-driven-development,
test-driven-development, code-review-and-quality, and 20+ others) that both
the loop's stage agents and ad-hoc requests invoke by name via the `skill`
tool.

## Install

```bash
git clone <this-repo>
cd agentic-loop
npm install
./install.sh opencode
```

`./install.sh opencode` symlinks the agents, commands, skills, and references
into `~/.config/opencode/` (or `$OPENCODE_CONFIG_DIR`) and registers the
plugin as a local plugin file, so `/agent-loop` and the bundled skills work in
every OpenCode session. It's idempotent — re-run after `git pull` for
updates. Use `--copy` instead of symlinks, or pass a directory to install
somewhere other than the default OpenCode config dir. Bare `./install.sh`
installs the Claude Code plugin too.

On Windows, symlinks need WSL or symlink-capable Windows (Developer Mode);
without that, use `--copy` (no live updates — re-run after `git pull`).
