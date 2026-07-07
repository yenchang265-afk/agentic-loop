# Prerequisites & Dependencies

What you need installed to use each capability. `agentic-loop` ships two plugins
(**OpenCode** and **Claude Code**) over one core package. Most capabilities need only the
base install; a few need an external MCP server or CLI. Pick the row for what you want to
do and read across to its requirement.

## Base — required for everything (both plugins)

- **Node.js** (a recent LTS — the repo pins no `engines` field) and **npm**.
- **git** — every loop isolates work on a branch or worktree.
- Install:

  ```bash
  npm install     # installs all workspaces; builds @agentic-loop/core via the prepare script
  ./install.sh    # both plugins; or: ./install.sh opencode | claude
  ```

  See [Install](../README.md#install).

## Per host plugin

| Plugin | What it needs | Notes |
|--------|---------------|-------|
| **Claude Code** | The bundled `agentic-loop` MCP server — built by `./install.sh claude`, runs on Node, declared in [`claude-plugin/.mcp.json`](../claude-plugin/.mcp.json). Exposes `mcp__agentic-loop__loop_verdict`. | Load the plugin via `claude --plugin-dir` or the marketplace ([`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json)). |
| **OpenCode** | Symlinked into `~/.config/opencode` (or `$OPENCODE_CONFIG_DIR`) by `./install.sh opencode`. MCP servers are registered in `opencode.json`. | `watchIntervalMinutes` is an OpenCode-only config field ([configuration](configuration.md)). |

## Capability → prerequisite

| Capability | Requires |
|------------|----------|
| **Engineering loop** (PLAN → BUILD → VERIFY → REVIEW) | `git` + your project's test runners on the stage bash allowlist: npm / pnpm / yarn / bun / `node --test` / `npx tsc·vitest·jest·eslint` / pytest / go / cargo / make. |
| **VERIFY + REVIEW verdicts** (any loop) | The bundled `agentic-loop` MCP server (`loop_verdict`). Absent it, a stage cannot record a trusted verdict. |
| **Frontend / UI / browser testing** (`browser-testing-with-devtools` skill) | The **chrome-devtools MCP server** (`npx chrome-devtools-mcp@latest`) plus Chrome. Chrome **144+** only for `--autoConnect`; the default dedicated / `--isolated` profile has no version floor. |
| **PR sitter — GitHub** (`codePlatform: "github"`, default) | The **`gh`** CLI, authenticated. |
| **PR sitter — Azure DevOps CLI** (`codePlatform: "ado"`) | The **`az`** CLI + the `azure-devops` extension (`az extension add --name azure-devops`), authenticated via `az devops login` or `AZURE_DEVOPS_EXT_PAT`, plus an `ado` config block. |
| **PR sitter — Azure DevOps, no CLI** (`codePlatform: "ado-mcp"`) | The **`microsoft/azure-devops-mcp`** server registered under the name **`ado`** (so its tools surface as `mcp__ado__*`), `ado.selfLogin` set (required in this mode), and the MCP server's own auth (Entra / `az login` session / PAT). Polling is fulfilled by the read-only `loop-pr-poll` agent. |
| **Task tracker pairing** (Jira / Azure DevOps) | Nothing at runtime — pairing is **manual**; the loop never calls a tracker API. `projectManagement` only supplies authoring defaults. |
| **Worktree isolation** (`worktreesDir`, optional hardening) | A `worktreeSetup` command (e.g. `npm ci`) so each fresh worktree has installed deps. |

PR-sitter platform requirements and the full `ado` / `ado-mcp` setup are documented in
[configuration.md → Code platform](configuration.md#code-platform-codeplatform--ado).

## Skills

Of the 26 shared skills, only **`browser-testing-with-devtools`** declares an external
dependency (the chrome-devtools MCP server, above). The other 25 are prompt-only
workflows — no MCP server, CLI, or API key required.

## External MCP servers at a glance

| Server | Needed for | Registered as |
|--------|-----------|---------------|
| `agentic-loop` (bundled) | Trusted loop verdicts (VERIFY / REVIEW / PR-sitter stages) | `mcp__agentic-loop__*` — built by `./install.sh claude` |
| `chrome-devtools` | Browser / frontend testing skill | `mcp__chrome-devtools__*` — add to `.mcp.json` / `opencode.json` |
| `ado` (`microsoft/azure-devops-mcp`) | PR sitter in `ado-mcp` mode | `mcp__ado__*` — must be registered under the name `ado` |

## npm dependencies (for contributors)

- **Root + `packages/core`**: `yaml`, `zod`; dev/peer `@opencode-ai/plugin`, `tsx`,
  `typescript`, `@types/node`.
- **`claude-plugin/mcp-server`**: `@agentic-loop/core`, `@modelcontextprotocol/sdk`,
  `yaml`, `zod`.

This is a pure Node / TypeScript repo — no Python or other-language toolchain.
