# review-sitter

Sits on pull requests where your review is requested: reads the diff in the context of the surrounding code and posts one structured review comment per requested head. **Never approves, requests changes, or merges — the human reviewer stays the reviewer of record.**

FETCH → ASSESS → PUBLISH (no retry loop)

## Enable

Add to `.agentic-loop.json`:

```jsonc
{
  "loops": {
    "review-sitter": { "enabled": true }
  }
}
```

See [`docs/sitters.md`](../sitters.md) for all config options.

## Commands

**OpenCode**

```
/agentic-loop:review-sitter claim | watch [poll [interval] | cron <schedule> | idle | <interval>] | unwatch | stop | status
```

**Claude Code (MCP)**

```
/agentic-loop:review-sitter claim | status | stop
```

(Claude Code has no standing watcher; call `claim` again to pull the next PR.)

## Example: One-shot review of a PR

Manually invoke the loop to review one pending PR:

1. **Claim one PR**
   ```
   /agentic-loop:review-sitter claim
   ```
   Polls for the next PR where your review is requested. Runs FETCH (get the diff), then ASSESS (read the code and write a review), then PUBLISH (post the review as a comment). The comment includes observations, questions, and/or suggestions, but never approves or requests changes — you remain the reviewer of record.

2. **Check status**
   ```
   /agentic-loop:review-sitter status
   ```
   Shows which PR is being reviewed, or "idle" if none are pending.

## Example: Idle watcher for continuous review

Let the loop watch and review PRs automatically whenever you're idle:

1. **Start the idle-triggered watcher**
   ```
   /agentic-loop:review-sitter watch idle
   ```
   (OpenCode only.) The watcher polls on editor idle events (no keystroke for 5+ minutes) and claims one review. Useful if you want reviews posted without setting a fixed schedule.

2. **Stop the watcher**
   ```
   /agentic-loop:review-sitter stop
   ```
   Stops watching.

## Learn more

- Full pipeline, authority limits, and config: [`docs/sitters.md`](../sitters.md)
- Command reference: [`docs/opencode.md`](../opencode.md) (OpenCode), [`plugins/claude/README.md`](../../plugins/claude/README.md) (Claude Code)
- Architecture: [`docs/architecture.md`](../architecture.md)
