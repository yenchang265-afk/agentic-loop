# agentic-loop

An [opencode](https://opencode.ai) plugin for transforming an engineer's workflow into an agentic loop.

It hooks session lifecycle events so an idle session can be re-driven toward an
open goal instead of stopping after a single turn.

## Install

Add it to your `opencode.json`:

```json
{
  "plugin": ["agentic-loop"]
}
```

Or drop a local copy in `.opencode/plugin/` for project-scoped use.

## Develop

```bash
npm install        # install @opencode-ai/plugin types + typescript
npm run typecheck  # tsc --noEmit
```

The plugin entry point is `src/index.ts`, exporting the `AgenticLoop` plugin.
Loop policy lives in `shouldContinue`.

## License

[Apache-2.0](./LICENSE)
