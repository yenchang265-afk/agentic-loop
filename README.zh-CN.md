[English](README.md) | 简体中文

# agentic-loop

以受监督的状态机方式运行长期目标，而不是聊天式的来回问答。本仓库是一个
**多种类循环（loop）框架**：每种循环类型都是
[`packages/core/loops/<kind>/`](packages/core/loops/README.md) 下的一份声明式清单
（manifest）——阶段（stage）、状态转换（transition）和工作来源（work source）——由共享引擎解释执行，并由统一的调度器驱动。以两个并行插件的形式发布——一个面向
**OpenCode**，一个面向 **Claude Code**（[`plugins/claude/`](plugins/claude/README.md)）——两者都建立在同一个核心包（[`packages/core`](packages/core)）之上，共享人工把关点（human gate）、git 隔离、可信裁定（trusted verdict）和审计轨迹。

目前已发布五种循环类型。**engineering**（默认开启）在 `docs/tasks/` 任务积压
（backlog）上驱动一个目标经历 PLAN → BUILD → VERIFY → REVIEW，包含人工任务把关和
计划把关。四个**实验性**、可选启用的 **sitter**——`pr-sitter`、
`review-sitter`、`dep-sitter`、`main-sitter`——监视一个托管的目标面
（开放的 PR、评审请求、存在漏洞的依赖、变红的 CI）并驱动修复，同时把每一个
终态调用都留给人类。详见下方 [The sitters](#the-sitters-experimental)。

编写一种新的循环类型只需要一个 `loop.json` 加上阶段提示词——详见
[`packages/core/loops/README.md`](packages/core/loops/README.md)。

## 工程（engineering）循环

编写任务、把关和执行都是同一条命令。**`/agentic-loop:engineering`** 会通过
访谈把你引导进一份草稿任务（`new <idea>` —— 始终如此，这样目标和可验证的
验收标准来自你本人而不是猜测；**重量级想法会被拆分为若干兄弟草稿**，每个都是
一个纵向切片，外加一个 `type: epic` 追踪任务，因此不会有单个任务撑爆一次构建
上下文），而 `retask <id>` 则可以就地重塑一份你不满意的草稿。**`approve [id]`**
是唯一的把关动词，由任务所在的文件夹驱动：它可以把一份已评审的草稿排入队列
（任务把关），把一份暂存的计划释放进构建队列（计划把关），或者在你读过
diff 之后交付一份已完成的评审（发布）——一个任务始终只处于一个文件夹中，
因此这个动作永远不会有歧义，省略 id 的 `approve` 会推进当前唯一停在循环
把关点上的任务（永远不会是草稿）。**`replan [id] [reason]`** 是唯一的拒绝
动词：一份暂存的计划（或按 id 指定的、触发了上限的任务）会被送回
`queued/` 重新规划。规划发生在**执行前的按需时刻**——`plan <id>` 为一个
已排队任务运行 PLAN 并将其暂存，这样计划就不会在任务暂停等待期间过期——而
`claim`/`watch` 只构建已批准计划的任务（它们从不自动为已排队任务生成计划）：

| 阶段 | 作用 | 是否暂停？ |
|-------|------|---------|
| PLAN | 将 `## Implementation Plan` 写入被 `plan <id>` 认领的已排队任务，然后**将其暂存到 `plan-review/` 并退出** | 暂停 —— `approve` / `replan` 才是把关点，循环本身从不阻塞 |
| BUILD | 在自己的 `feature/<id>` 分支上以测试先行的方式实现已批准的计划 | 否 |
| VERIFY | 运行测试；失败则带着失败信息重新构建 | 否 |
| REVIEW | 检查分支 diff；失败则带着反馈重新构建 | 否 |

执行是在 `feature/<id>` git 分支上隔离进行的，裁定（verdict）只通过插件工具
可信，每一次状态转换都会被审计，循环本身从不推送或开启 PR——由你审阅 diff
并运行 `/agentic-loop:engineering approve`，它会推送分支并开启（或复用）一个
**draft** PR（GitHub 或 Azure DevOps，取决于 `codePlatform`）作为发布流程的一
部分。完整的执行模型（watch 模式、迭代上限、恢复）：
[docs/opencode.md](docs/opencode.md)。

## sitters（实验性）

四个可选启用的 sitter 会监视一个托管目标面并驱动修复，每一个都有自己的
`/agentic-loop:<kind>` 命令，共享 `claim` / `status` / `stop` 动词（在
OpenCode 上还有 `watch [trigger]` / `unwatch`）。它们都是**实验性的**——
其清单、配置项和默认值都可能还会变化。按仓库在 `.agentic-loop.json` 中
启用：

```json
{
  "loops": {
    "pr-sitter":     { "enabled": true, "query": "is:open author:@me" },
    "review-sitter": { "enabled": true },
    "dep-sitter":    { "enabled": true, "severityFloor": "high" },
    "main-sitter":   { "enabled": true, "branch": "main" }
  }
}
```

每个 sitter 都把它读取的 PR/评论/diff/CI 文本视为不可信输入，处于按阶段划分
的 bash + 平台白名单之后，并且把终态调用——合并、批准、关闭——留给人类。
每一个 sitter 具体做什么、它的流水线、它的配置项：
[docs/sitters.md](docs/sitters.md)；安全态势：
[docs/design/threat-model.md](docs/design/threat-model.md)。

## 安装

以下步骤假设系统先决条件已就绪（Node ≥ 20、git、`gh`、`curl`，如需浏览器相关
工作还需要 Chrome）。Azure DevOps 只需要 `curl` 加上 `AZURE_DEVOPS_EXT_PAT`
中的一个 PAT。对于全新的机器，`./bootstrap.sh` 会为你验证/安装这些依赖，
注册 `chrome-devtools` MCP 服务器，然后为你运行 `./install.sh`：

```bash
./bootstrap.sh                 # 全部；或 --no-ado / --no-browser / --check-only
```

手动路径（依赖已安装）：

```bash
git clone <this-repo>
cd agentic-loop
npm install             # npm workspaces —— 同时构建 @agentic-loop/core（prepare）
./install.sh            # 两个插件都装；或者：./install.sh opencode | claude
```

- 在仓库根目录运行 `npm install` 会安装所有 workspace（OpenCode 插件、
  `packages/core`、`plugins/claude/mcp-server`），并通过 `prepare` 脚本构建核心
  包——两个插件都消费核心包构建出的 `dist/`。
- `./install.sh opencode` 会把 agents/commands/skills/references 软链接进
  `~/.config/opencode/`（或 `$OPENCODE_CONFIG_DIR`）并注册插件——细节和标志
  （`--copy`、自定义目录）见 [docs/opencode.md](docs/opencode.md)。
- `./install.sh claude` 会构建内置的 MCP 服务器并链接共享的
  skills/references，然后打印加载方式（`claude --plugin-dir` 或市场安装）——
  细节见 [`plugins/claude/README.md`](plugins/claude/README.md)。
- 安装完成后，交互式终端会得到一个简短的**配置向导**来生成
  `.agentic-loop.json`——见 [docs/configuration.md](docs/configuration.md)。

幂等——`git pull` 之后重新运行即可更新。

## 卸载与清理

两个脚本分别撤销两种痕迹——已安装的插件，以及正在运行的循环留下的本地状态：

```bash
./uninstall.sh                 # 撤销 install.sh；或 opencode | claude | all
./scripts/clean.sh             # 仅移除 <tasksDir>/runs/ 中的临时状态
./scripts/clean.sh --purge     # 同时删除积压任务文件 + .agentic-loop.json
```

- **`./uninstall.sh`** 会移除本仓库链接进你 OpenCode 配置中的
  agents/commands/skills/references 条目和本地插件文件（只移除指回本仓库的
  软链接；`--copy` 也会移除拷贝），并删除已构建的 Claude
  `mcp-server/dist`。它不会动你的 `.agentic-loop.json` 和积压任务；卸载
  Claude 插件本身需要 `/plugin uninstall agentic-loop`。
- **`./scripts/clean.sh`** 清除驱动该项目的循环的本地状态（`$AGENTIC_LOOP_DIR`
  或当前目录）。默认只清空临时的 `<tasksDir>/runs/` 机器记忆——快照、指标、
  阶段标记、watch 租约、认领标记，以及各种类型的去重台账——循环会重新生成
  这些内容。`--backlog` 还会删除各状态文件夹中的任务文件（保留 `.gitkeep`
  和文件夹本身），`--config` 还会移除 `.agentic-loop.json`，`--purge` 三者
  全做。破坏性级别会先询问确认（用 `-y` 跳过）；`--dry-run` 只预览不删除。

## 命令

- `/agentic-loop:engineering new <idea>` · `retask <id> [note]` —— 通过访谈得到一份或多份
  planless 草稿，存于 `docs/tasks/draft/`；`retask` 会重新访谈并就地重塑
  一份草稿
- `/agentic-loop:engineering approve [id]` —— 唯一的按文件夹驱动的把关点：草稿 → 已排队
  （任务把关）、plan-review → 进行中（计划把关）、in-review → 已完成
  （发布，在你审阅分支 diff 之后）。省略 id 的 `approve` 会推进当前唯一
  停在循环等待点上的任务——永远不会是草稿
- `/agentic-loop:engineering replan [id] [reason]` —— 拒绝动词：把一份暂存的计划（或按 id
  指定的、触发了上限的任务）送回 `queued/` 重新规划
- `/agentic-loop:engineering plan <id>` · `claim` · `watch [interval]`（OpenCode）·
  `unwatch` · `recover <id>` · `stop` · `status` · `doctor [fix]` · `kinds` ——
  `plan` 为一个已排队任务运行 PLAN 并将其暂存（唯一的 PLAN 入口）；
  `claim` 拉取下一个可构建的 `in-progress/` 任务；`watch` 是一个仅作用于
  engineering 类型的常驻 worker
- `/agentic-loop:pr-sitter claim` · `watch [interval]`（OpenCode）· `unwatch` ·
  `stop` · `status` —— 相同的 claim/watch 语义，作用范围限定在 PR sitter
- `/agentic-loop:review-sitter` · `/agentic-loop:dep-sitter` ·
  `/agentic-loop:main-sitter` —— 同样的 `claim` / `watch`（OpenCode）/
  `unwatch` / `stop` / `status` 动词，各自作用于自己的类型（通过
  `loops.<kind>.enabled` 按需启用）

完整命令参考：[docs/opencode.md](docs/opencode.md)（OpenCode）·
[`plugins/claude/README.md`](plugins/claude/README.md)（Claude Code —— 没有
常驻的 `watch`；`claim` 就是拉取动作）。循环之外的临时请求会通过
[AGENTS.md](AGENTS.md) 映射到内置的 skills 库。

## 文档

- [docs/README.md](docs/README.md) —— `docs/` 下每份文档的索引，以及针对
  某个主题哪份文档是权威版本
- [docs/loops/](docs/loops/README.md) —— 每种类型一份文件（engineering、
  pr-sitter、review-sitter、dep-sitter、main-sitter）：其架构（阶段流水线、
  mermaid 图、配置项）、如何启用、命令面，以及 1-2 个实战示例
- [docs/architecture.md](docs/architecture.md) —— 仅框架本身（核心包、
  清单引擎、调度器、工作来源、watch 租约）以及 Claude Code 版本有何不同
- [docs/sitters.md](docs/sitters.md) —— 四个实验性 sitter 的共同点，
  并索引到 `docs/loops/` 下它们各自的文件
- [packages/core/loops/README.md](packages/core/loops/README.md) —— 如何编写一种新的循环类型
  （清单模式、提示词模板、hooks、工作来源）
- [docs/opencode.md](docs/opencode.md) —— OpenCode 执行模型、命令、安装细节
- [`plugins/claude/README.md`](plugins/claude/README.md) —— Claude Code 安装、
  命令、已知限制
- [docs/configuration.md](docs/configuration.md) —— `.agentic-loop.json`
  参考（用户级 + 仓库级分层）、各类型的 `loops` 区块，以及可选的加固项
  （worktree、评审视角、脱敏）
- [docs/templates/AGENTS.md](docs/templates/AGENTS.md) —— 可复制到由
  agentic-loop 驱动的项目中的起始 `AGENTS.md`/`CLAUDE.md`（循环工作流 +
  skill 映射）
- [docs/migration.md](docs/migration.md) —— 从早期版本迁移（单一的
  `/agent-loop` 命令、`/agent-loop-plan`、`in-planning/`、阻塞式 PLAN 把关）
- [docs/design/](docs/design/) —— 威胁模型、加固设计记录
  （包括 [07 — 多循环调度器](docs/design/improvements/07-multi-loop-scheduler.md)）
- [packages/hub/README.md](packages/hub/README.md) —— **管理面板（admin
  hub，测试版）**（`npm run hub -- --dir /path/to/repo` → http://127.0.0.1:4317）：
  循环监视器（积压看板、实时把关点通知、运行历史、按阶段的 token 用量）和
  可视化循环创建器；可以监视一个或多个仓库（`--dir` 可重复且支持 `*`
  通配符，或者在用户级 `~/.agentic-loop.json` 中设置 `hub.repos` —— 不配置
  仓库就不会监视）

每个主题只在一份文件中是权威的——完整的"哪份文档拥有哪个主题"索引见
[docs/README.md](docs/README.md)。更新权威文件并链接到它，不要复制内容。

## 目录结构

- `packages/core/` —— `@agentic-loop/core`：纯粹的循环引擎、清单层、
  工作来源 + 调度器、任务存储、git 隔离、快照、裁定、指标、配置 ——
  两个插件共享的一切
- `packages/core/loops/` —— 声明式的循环类型，每种类型一个目录
  （`engineering/`、`pr-sitter/`、`review-sitter/`、`dep-sitter/`、
  `main-sitter/`）：每种类型一份 `loop.json` 清单 + `stages/*.md` 提示词模板
- `packages/hub/` —— **管理面板（测试版）**：带有循环监视器和可视化循环
  创建器的本地 web 应用（[packages/hub/README.md](packages/hub/README.md)）
- `plugins/opencode/src/` —— OpenCode 插件：host 接线、在
  `session.idle` 上运行引擎的驱动器、配置扩展
- `plugins/opencode/agents/`、`plugins/opencode/commands/` —— 每个阶段和
  斜杠命令背后的 agent + 命令定义（从 `.opencode/` 软链接过来，用于本仓库
  自我托管）；`.opencode/skills` 软链接到 `skills/`
- `plugins/claude/` —— Claude Code 插件：命令、agents、hooks，以及驱动
  循环的内置 MCP 服务器（其 host 垫片位于 `mcp-server/src/shim.ts`）
- `skills/`、`references/` —— 阶段 agent 和临时请求所使用的工作流库
  （两个插件共享）
- `docs/tasks/` —— `/agentic-loop:engineering` 各动词读取的文件系统任务积压
- `install.sh` —— 安装一个或两个插件

## 开发

```bash
npm install && npm run typecheck:all && npm run test:all
```

`typecheck:all` / `test:all` 覆盖每一个 workspace：核心包
（`packages/core` —— 引擎、清单、调度器、来源、存储）、管理面板
（`packages/hub`）、OpenCode 插件（`src/**/*.test.ts`），以及 Claude
Code MCP 服务器（`plugins/claude/mcp-server`）。若只想运行 OpenCode 插件的
测试套件，可限定到它的 workspace —— `npm run typecheck -w agentic-loop` /
`npm test -w agentic-loop`（或者在 `plugins/opencode/` 内运行
`npm run typecheck`）；根 package 只定义 `:all` 脚本。

## 许可证

MIT
