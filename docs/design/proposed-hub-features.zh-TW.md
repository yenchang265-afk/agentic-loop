[English](proposed-hub-features.md) | 繁體中文

# 提議的管理面板功能——彌合讀寫落差

這是一份**提案＋實作計畫**，而非已發布工作的設計紀錄（那是 [`improvements/`](./improvements/README.md)，其七項計畫全都在**核心端（core-side）**——在這份文件之前，管理面板一直沒有自己的設計文件）。

它回答一個問題：除了管理面板出廠時就有的唯讀監視器和迴圈建立器之外，[`packages/hub/`](../../packages/hub/README.md) 接下來該做什麼？

這個答案由一項可衡量的觀察所驅動：**核心（core）公開了一整套寫入 API，而管理面板從未呼叫過。** 以下每一項功能都在彌合其中一個落差，而且——這是支撐整份文件的關鍵發現——**沒有一項需要在核心中新增程式碼。**

管理面板*目前*做些什麼，見 [`packages/hub/README.md`](../../packages/hub/README.md)；它在整個系統中的位置，見 [`architecture.md`](../architecture.md)；設定項，見 [`configuration.md`](../configuration.md)。本文件不重述這些內容。

每一個條目都是對照真實的合約撰寫的（路徑與行號均已對照撰寫當下的原始碼驗證過），因此任何一項都能直接執行，不需要再重新翻譯（解讀）一次：

- **Gap（落差）**——已存在、已測試，但管理面板從未呼叫過的核心匯出項目。
- **Surface（介面）**——路由、傳輸型別（wire types）和元件，遵循 `packages/hub/src/server/routes/kinds.ts` 中已經確立的模式。
- **Authority（授權）**——這項功能讓瀏覽器的一次點擊能做什麼，對應回 [`threat-model.md`](./threat-model.md)。與 [`proposed-loops.md`](./proposed-loops.md) 相同的階梯，外加一個新的層級。
- **Cost（成本）**——S／M／L：
  - **S**——僅路由＋元件；組合既有的核心匯出項目，不授予新的授權。
  - **M**——新的授權，附測試。
  - **L**——新的授權*而且*帶有需要自成一套防護機制（rails）的全新失敗模式。

授權等級，依影響範圍（blast radius）由小到大排列：

1. **read（唯讀）**——不寫入任何東西（管理面板目前擁有的授權）。
2. **backlog-write（待辦寫入）**——寫入設定的 `tasksDir` 下的任務檔案，並提交（commit）——engineering 迴圈已經擁有這項授權。
3. **config-write（設定寫入）**——寫入 `.agentic-loop.json`。**新的層級，管理面板專屬**：設定檔是授予所有*其他*授權的檔案，因此即使它只動到一個小檔案，寫入它仍然是比 backlog-write 更高一階的授權。
4. **push / comment（推送／留言）**——推送分支、開啟 PR。在機器之外可見。

## Summary（摘要）

| # | 功能 | 彌合的落差 | 授權 | 成本 | 狀態 |
|---|---------|---------------|-----------|------|--------|
| [1](#1--gate-actions) | 把關動作（Gate actions） | `loop/gate.ts`——**零個管理面板呼叫者** | backlog-write, push | M | **已發布** |
| [2](#2--backlog-doctor) | 待辦醫生（Backlog doctor） | `task/store.ts` 的寫入那一半 | backlog-write | M | **已發布** |
| [3](#3--creator-prompt-preview) | 建立器提示詞預覽（Creator prompt preview） | `manifest/template.ts` 的 `renderPrompt` | read | S | **已發布** |
| [4](#4--config-editor) | 設定編輯器（Config editor） | **目前沒有任何地方會寫入 `.agentic-loop.json`** | config-write | L | **已發布** |

**這四項功能全都已經發布**，外加 PR 0 的基礎工程。以下對它們所彌合落差的描述，維持撰寫當下所使用的現在式——管理面板目前實際做了什麼，見 `architecture.md`、管理面板的 README 以及 `configuration.md`。這份文件現在是設計歷史，而不是待辦清單。

建議順序——**PR 0（基礎）→ 3 → 1 → 2 → 4**——的理由見 [Sequencing（排序）](#sequencing)。設定編輯器是最主要的訴求，但刻意**最後**才發布。

---

## The gap（落差）

> **寫於這一切都還沒發布之前**，並保留原本的時態：這是變動的論證，不是對現況的描述。這四項功能後來全都已經落地，因此 `architecture.md`、`packages/hub/README.md`、`configuration.md` 和 `threat-model.md`（T14–T16）現在都描述了這個寫入介面——關於管理面板做什麼，是它們，而不是這份文件，才是權威版本。

管理面板原本是一個測試版的管理應用程式，**觀察**迴圈：待辦看板、即時活動、執行歷史、token 用量、迴圈建立器。依設計全部唯讀——[`architecture.md`](../architecture.md) 曾說它「**觀察**……而從不驅動迴圈」。

這個立場在四個具體的地方已經過時：

| 核心能力 | 狀態 | 管理面板目前狀況 |
|---|---|---|
| `loop/gate.ts` —— `approveTask:101`、`approvePlan:150`、`replanTask:200`、`shipTask:241` | 已發布，已測試 | **零個呼叫者。** 管理面板能偵測把關點（SSE 的 `gate` 事件、`gateStatuses` 欄位高亮），卻一個都無法操作。`packages/hub/README.md:111` 明確地把這件事留到以後再做。 |
| `task/store.ts` 的寫入那一半 —— `rescueStray:549`、`releaseOrphanedClaims:456` | 已發布，已測試 | 未被使用。`Board.tsx:65` 顯示一個死路徽章，寫著*「待辦異常——請執行 doctor」*——它叫你自己去打一個 CLI 動詞。 |
| `.agentic-loop.json` | —— | **沒有任何東西會寫入它。** `routes/kinds.ts:108` 在建立器流程的最後叫你自己手動編輯這個檔案。 |
| `manifest/template.ts` 的 `renderPrompt:61` | 已發布，已測試 | 未被使用。建立器盲寫提示詞的骨架。 |

**這個立場在實務上其實早就破功了**：建立器會透過 `POST /api/kinds`（`routes/kinds.ts:113`）寫入 `loops/<kind>/`。所以誠實的做法是把這條界線正式定下來，而不是假裝它還撐得住。

### The new boundary（新的界線）

> 管理面板執行**人工把關動作**、**待辦修復**和**設定編輯**——透過*兩個 host 已經在用的同一套共用核心進入點*。它不驅動**階段**。

管理面板變成把關點的**第四個呼叫者，而不是第四個驅動者**。這個區別就是整套安全論證的核心，任何提到它的文件都應該一字不差地這樣寫。

### Why core needs no new code（為什麼核心不需要新增程式碼）

這是這個設計正確與否最有力的訊號。`GateCtx`（`gate.ts:22-35`）是一個 host 注入接縫，它的文件字串（docstring）**早就預期會有第三個 host** 透過「磁碟上的階段標記」來回答 `isDriving`。管理面板正是那個 host。

| 需求 | 核心匯出項目 | 裁決 |
|---|---|---|
| 把關操作 | `approveTask:101`、`approvePlan:150`、`replanTask:200`、`shipTask:241` | 組合即可。`HubDeps` 已經提供每一個 `GateCtx` 欄位；只需要把 `sh` 改名成 `$`。 |
| Doctor | `auditBacklog`、`rescueStray:549`、`releaseOrphanedClaims:456`、`isOrphanedPlanClaim:406`、`listClaimIds`、`appendNote:578`、`commitPaths` | 組合即可。 |
| 預覽 | `renderPrompt:61`、`promptContext:32`、`verdictContractBlock`（`verdict.ts:79`） | 組合即可——**不是** `composePrompt:68`（見 [3](#3--creator-prompt-preview)）。 |
| 設定 | `mergeConfigLayers:248`、`readUserLayer:293`、`resolveUserConfigPath:230`、`ConfigSchema:150`、`BaseConfigSchema.shape` | 組合即可。 |
| 來源歸屬（Provenance） | —— | **管理面板端。** 核心若要做，就得再維護一份合併規則的副本。見 [Crux B](#crux-b--the-layer-footgun)。 |
| 各類型旋鈕（knob）驗證 | —— | **管理面板端，僅供參考。** 收緊核心的規則是一項破壞相容性的變動。見 [Crux C](#crux-c--loops-is-looseobject)。 |

核心端只需要動兩處、各約一行，而且都只是註解：在 `orchestrate.ts:107` 加一個指向管理面板旋鈕註冊表的指標，以及在 `config.ts:94` 加一句說明，指出這個寬鬆的合約是刻意設計的，並會在下游被檢查（lint）。

**如果這裡的某個 PR 開始想要更動核心，那就是這項功能已經走偏的警訊。**

---

<a id="1--gate-actions"></a>

## 1 — 把關動作（Gate actions）

**授權：backlog-write, push · 成本：M · 狀態：已發布**

把關欄位任務卡片上的核准／重新規劃／發布按鈕。

**伺服器端**——新增 `server/routes/gate.ts`，作用範圍限定在單一儲存庫，`mutating: true`：

```
POST /api/gate/:action    body: { id, expectStatus, reason?, kind? }
  action ∈ approve-task | approve-plan | replan | ship
```

這條路由背後有三個關鍵決策：

- **一對一對應到明確的操作**，而不是 `*Any` 這類捷徑。`approveAny:320` 的存在是為了解決*人類在 CLI 中沒有輸入 id* 時的歧義。而管理面板的按鈕就長在某一欄的某一張特定卡片上——這種歧義根本不存在。如果用 `approveAny`，就可能讓一場競速執行*和按鈕上寫的不同的把關動作*。
- **`expectStatus`沒有商量餘地。** 看板是由 SSE 驅動的，可能會有延遲。要驗證任務是否仍處於客戶端當時看到的狀態（一次 `findByIdIn`）；不符 → **409**，並附上目前的狀態。少了這一步，在過期的看板上點一下，就可能發布一個迴圈其實早已移動過的任務。
- **200 規則。** 對**每一個格式正確的請求都回傳 200**，並原封不動帶上 `GateResult`。`ok: false` 是一種*領域層級的拒絕*（「它在 queued，不在 draft」），不是傳輸錯誤——而 `web/api.ts` 的 `parse` 在 `!res.ok` 時會拋出例外（:5-8），這會丟掉 `variant`，也就是核心刻意建模出來的資訊／警告區別（`gate.ts:38-46`）。400 保留給格式錯誤的請求內容／無效的 id，409 保留給 `expectStatus` 不符的情況。

在 `id` 抵達檔案系統之前，先透過 `isSafeId`（`http.ts:85`）過濾——這條規則 `backlog.ts:84` 已經在套用了。短雜湊前綴（例如 `f7k3`）可以通過。

**傳輸型別（Wire types）**—— `export type { GateResult, GateVariant } from "@agentic-loop/core/loop/gate"`。這是 `shared/api.ts:7-8` 中僅型別的重新匯出（re-export）模式；零手動維護的重複程式碼。

**前端**—— `web/monitor/GateActions.tsx`，掛載在 `Board.tsx` 的 `TaskCardView`（:16）中，該元件已經會接收 `gated: boolean`。每一個按鈕都包在 `<Confirm>` 裡。

**Ship（發布）是這份文件中姿態轉變最大的一項**，它的文案必須把這件事講清楚。`shipTask:259` 會呼叫 `shipPr`——瀏覽器上的一次點擊會在真實的遠端開啟一個真實的 pull request。`variant="danger"`，確認視窗的說明文字寫著：*「會提交到 git，並且開啟一個 pull request。這在你的機器之外是看得見的。」* 刻意**不用** dry-run 來緩解——一個假裝發布卻沒有真正發布的 dry-run，比一個確認視窗更糟糕的謊言。

不需要新的 SSE 型別：把關操作會移動 `tasksDir` 底下的檔案，而 `watch.ts` 已經會發出 `backlog` / `gate` 事件。先樂觀地渲染 `result.message`，剩下的交給 SSE 去校正。

---

<a id="2--backlog-doctor"></a>

## 2 — 待辦醫生（Backlog doctor）

**授權：backlog-write · 成本：M · 狀態：已發布**

**完全**鏡射 `loop_doctor` 的語意——MCP 伺服器和 OpenCode 的動詞已經取得一致，第三套分歧的語意只會是一座 bug 工廠。

**伺服器端**——新增 `server/routes/doctor.ts`：

- `GET /api/doctor`（範圍限定，唯讀）—— `auditBacklog` + `formatAnomalies` + `listClaimIds` → `{ findings, anomalies, heldClaims }`。
- `POST /api/doctor/fix`（範圍限定，`mutating: true`）—— 對每個迷途任務執行 `rescueStray:549` 並附上一則稽核備註；rmdir 未知目錄；用 `isOrphaned: isOrphanedPlanClaim`（`store.ts:406`）執行 `releaseOrphanedClaims:456`，**僅限 `queued`**——這一點很容易漏掉，一旦搞錯就會釋放還活著的計畫認領（plan claim）。最後執行一次 `commitPaths`。

**重複項目永遠不會被自動修復。** 兩個 host 都拒絕這麼做；管理面板也拒絕。用同樣的指引把它們呈現出來（「留一份，其餘的搬到 abandoned」）。管理面板是*最不適合*用來猜哪一份才是權威版本的地方——不要加一個只有管理面板才有的「解決重複」按鈕。

**認領釋放是比較細膩的那一半。** 釋放一個迴圈正在使用中的認領，會讓第二個認領者搶到同一個任務。注意這裡和把關點正好相反：在把關點那邊，有認領代表「拒絕」；但在這裡，認領*正是*要被釋放的東西，所以 `isDriving` 不能拿來當判斷依據——依定義，每一個候選對象都是被認領的。改用核心自己的孤兒判斷式（`isOrphanedClaim:394`，以及 `queued/` 專用的 `isOrphanedPlanClaim:406`），這正是 `releaseOrphanedClaims:456` 拿它們來用的目的。迷途任務和空目錄則無關，永遠可以安全修復。

**前端**—— `web/monitor/DoctorPanel.tsx`。掛接點早就存在：把 `Board.tsx:65` 那個死路徽章，改成打開面板的按鈕。`BacklogResponse.anomalies` 已經在驅動它是否顯示。

---

<a id="3--creator-prompt-preview"></a>

## 3 — 建立器提示詞預覽（Creator prompt preview）

**授權：read · 成本：S · 狀態：已發布**

在建立器內，用範例情境（context）渲染一份階段提示詞。

`POST /api/kinds/preview`——一個**非 `mutating`** 的 POST，沿用 `validateKind` 的先例（`main.ts:141`）。不寫入任何東西；`X-Hub-Client` 這個標頭防護的是有副作用的操作，不是讀取操作。

**不要呼叫 `composePrompt`**（`engine.ts:68`）。它恰好會在建立器所撰寫的那些類型上拋出例外，原因有兩個：它需要一個從磁碟讀取的 `LoadedManifest`（正在預覽的清單還沒被儲存），而且它會透過註冊表解析 `hooks.compose[stage]`——對於一個由管理面板撰寫的類型來說，這會指向一個未註冊的 hook。改成直接組合底層的匯出項目：

```
renderPrompt(prompts[stage], promptContext(sampleState))
  + if stage.kind === "check" → append verdictContractBlock(stage)   // verdict.ts:79
  + if manifest.hooks.compose[stage] → note: "stage has compose hook <ref>;
                                              preview shows the un-hooked render"
```

忠實呈現 `composePrompt` 的輸出結果，而且不會拋出例外。

**範例情境的切換開關就是這項功能的全部價值所在。** 它的價值不在於「看到文字」，而在於*看到哪些條件區塊被觸發*。給使用介面三個開關（with-task／with-git／with-worktree），讓撰寫者能立刻看到 `{{#task.id}}` 和 `{{#worktree}}` 亮起或消失。少了這些開關，這不過是一個包裝過的 `cat`。

**在伺服器端執行，而不是在客戶端**——這是一個真實存在、而且被明確點出來的取捨：`renderPrompt` 是純函式，理論上*可以*在瀏覽器裡執行。但 `shared/api.ts:11-13` 明訂了這條界線——SPA 只以**純型別**的方式匯入核心，從不匯入執行期程式碼。為了省下 2 毫秒的來回時間，把 `template.ts` + `engine.ts` 拉進 bundle，只為了一項功能就打破這條界線，並不划算。乖乖用 POST。

---

<a id="4--config-editor"></a>

## 4 — 設定編輯器（Config editor）

**授權：config-write · 成本：L · 狀態：已發布**

這是最主要的訴求，也是真正藏著地雷（footgun）的一項。新增 `server/configfile.ts`（原始層級 IO）、`configlayers.ts`（來源歸屬）、`knobs.ts`（諮詢性質的檢查）、`routes/config.ts`。

成本是 **L**，不是 M，因為以下三個關鍵難題（crux）中有兩個是全新的失敗模式——無聲的資料損毀，以及機密資訊外洩——需要它們自己專屬的防護機制（rails），而不只是測試。

<a id="crux-a--the-strip-footgun"></a>

### Crux A —— 剝除欄位的地雷

**原始資料才是模型；zod 只是一個檢查工具（linter）。**

`BaseConfigSchema`（`config.ts:61`）是一個普通的 `z.object` → **zod v4 會剝除未知的鍵**。所以先執行 `ConfigSchema.parse(raw)`，再把結果寫回去，會無聲無息地刪掉：

- **`watchIntervalMinutes`**——僅限 host 端使用的欄位，由 OpenCode 外掛透過 `safeExtend`（`plugins/opencode/src/config.ts:21`）加進去，不在核心裡；以及
- **整個 `hub` 區塊**（`packages/hub/src/server/config.ts:12`）——*管理面板一開始正是靠它才找到這個儲存庫的*。

寫入一份已經解析過的設定，會讓管理面板刪掉自己的設定。以下這套演算法就是為了防止這件事而存在：

```
READ(layer):
  raw    = JSON.parse(readFileSync(<layerPath>))   // parse error → 200 {parseError}, NOT 500 —
                                                   // the editor must render it
  merged = mergeConfigLayers(userRaw ?? {}, repoRaw ?? {})   // core's exported merge, verbatim
  issues = ConfigSchema.safeParse(merged).issues             // .data DISCARDED — validator only
  → { layer, raw, effective, issues, provenance, passthrough, redactedPaths }

WRITE(layer, patch):
  raw  = re-read from disk NOW (never trust a client echo)
  next = applyPatch(raw, patch)                    // key-path set/delete on the RAW object
  un-redact: patch value === "__REDACTED__" → keep raw's existing value
  issues = ConfigSchema.safeParse(merged-with-next).issues → any? 400.
                                                   // never write an invalid config
  warnings = lintLoopKnobs(next.loops, boards)     // advisory, does NOT block
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n")
  repo.reload() → 200 { written, warnings }
```

`next` 是從 `raw` 衍生出來的，所以未知的鍵能夠存活下來，**因為它們從來沒有被 zod 處理過一輪**。

**讓看不見的東西被看見。** 不要只是默默保留未知欄位——回傳 `passthrough`：列出存在於原始資料中、但不在 `BaseConfigSchema.shape` 裡的鍵，並把它們渲染成一個唯讀區塊。這樣一來，`watchIntervalMinutes` 和 `hub` 就會*被標示出來、被保留、但不可編輯*——而一個頂層的打字錯誤（例如 `maxIteration`）也會出現在這裡，而不是憑空消失。同一套機制，換來誠實的使用者體驗，還順便免費抓到一整類真實存在的 bug。

`hub` 區塊在 v1 版本中維持**唯讀**：它只在啟動時被讀取一次（`main.ts:48`），所以從管理面板編輯它只會悄悄地什麼都不做——這比乾脆不提供編輯還糟。儲存庫層級的 `hub` 鍵已經因為循環依賴而被刻意忽略（`hub/src/server/config.ts:5-10`）；編輯器選擇拒絕它，而不是去寫一個沒有人會讀的鍵。

<a id="crux-b--the-layer-footgun"></a>

### Crux B —— 分層的地雷

**編輯一個明確指定的層級；來源歸屬的計算放在管理面板端，不放在核心。**

`mergeConfigLayers:248` 會把使用者層級（`~/.agentic-loop.json`）合併到儲存庫層級**之下**，且是在解析*之前*進行。如果編輯器顯示的是*合併後的最終*設定，並把它存回儲存庫的檔案，就會**把使用者層級攤平寫進儲存庫檔案**——把 `ado.pat` 從 `~/.agentic-loop.json` 寫進一個 `config.ts:121-126` 明確警告過必須保持在 gitignore 中的檔案。

**這就是機密資訊外洩，也是這項功能可能造成的最糟情況。** 四道防護機制：

1. **路由明確指定層級。** `GET/POST /api/config?layer=repo|user`（外加 `?repo=<id>`）。永遠沒有「最終合併結果」的編輯模式。`effective` 只用來顯示，明顯是唯讀的，旁邊會附上每個欄位的來源歸屬徽章。
2. **來源歸屬的邏輯放在管理面板端，不放在核心。** `readUserLayer:293`的匯出正是為了這個用途（它的文件字串就提到了管理面板）；儲存庫層級則是直接讀檔案。`provenanceOf(userRaw, repoRaw, path) → "repo" | "user" | "default"` 大約 20 行。如果放進核心，就意味著**要多維護一份合併規則的實作，還得跟 `mergeConfigLayers` 保持同步**——這正是這個程式庫已經在對抗的那種「兩份副本各自漂移」的失敗模式（`audit.ts:2-5`、`kinds.ts:98-108`）。核心的合約維持單一：只有一個合併函式，並匯出它。**但正因為這是一種鏡射（mirror）實作，才最容易出錯**，所以要用一個可信賴的驗證機制（oracle）釘住它，而不是單靠信任：寫一個屬性測試（property test），針對產生出來的各種層級組合，斷言每一條葉節點路徑上，`mergeConfigLayers(u, r)` 的值都等於來源歸屬邏輯所回報的層級名稱所對應的值。一旦漂移，就會變成一個測試失敗，而不是一個顯示錯誤的徽章。這個鏡射實作必須使用**跟核心一樣的遞迴規則**——只有純物件（plain object）才遞迴；**陣列、純值和 `null` 一律整體取代**（`config.ts:248-257`）。如果對 `reviewLenses` 做一個天真的逐元素走訪，回報出來的來源歸屬會跟 `mergeConfigLayers` 實際的行為對不上。
3. **`ado.pat`永遠不會傳到瀏覽器。** 在一個*已知的路徑*上遮罩，而不是靠正規表示式：用哨兵值 `"__REDACTED__"` 取代，並把這個路徑列在 `redactedPaths` 中。如果寫入請求原封不動地回傳這個哨兵值，就代表「沒有變更」→ 保留原始資料裡既有的值。這也是為什麼寫入操作要重新從磁碟讀取，而不是信任客戶端回傳的內容。
4. **Gitignore 防護。** 在**儲存庫**層級對 `ado.pat` 執行*設定*寫入操作之前，先執行 `git check-ignore -q .agentic-loop.json`。如果沒有被忽略 → **400**，並附上 `config.ts:121-126` 中的警告文字。短短兩行程式碼，就把一段沒有人會去讀的文件註解，變成一道在關鍵時刻真正生效的強制防護。

<a id="crux-c--loops-is-looseobject"></a>

### Crux C —— `loops` 是 `looseObject`

**在管理面板端以警告的形式做檢查；不要動核心的結構描述（schema）。**

`orchestrate.ts:107-138` 是**依位置、透過字串鍵、用陽春的 `typeof` 檢查**來讀取各類型專屬的旋鈕（knob）：

| `workSource.type` | 旋鈕（knob） | 檢查方式 | 位置 |
|---|---|---|---|
| `github-pr` | `query` | string | `orchestrate.ts:112` |
| `dependency-scan` | `severityFloor` | string | `:124` |
| `dependency-scan` | `includeOutdated` | boolean | `:125` |
| `dependency-scan` | `ecosystem` | string | `:126` |
| `ci-runs` | `branch` | string | `:132` |

打錯字（例如 `severityfloor`）或型別錯誤（例如 `severityFloor: 7`）都會**被悄悄忽略**——迴圈會套用預設值繼續跑，卻沒有人被告知。抓出這種情況，正是設定編輯器最大的賣點。

> **附註：** 目前唯一能發現這張表格內容的方式，就是去讀 `orchestrate.ts` 的原始碼。[`configuration.md:126`](../configuration.md) 宣稱這些旋鈕「由該類型自行驗證」；事實並非如此。修正這份文件本身就值得做，跟這項功能無關。

**收緊核心的 `loops` 結構描述是錯誤的方向**，這是整份文件中最該堅決反對的一點。`looseObject` 是*刻意*的設計（`config.ts:86-90`：各類型專屬的旋鈕「隨附而行，由該類型自行驗證」），而且類型本身是使用者可以自行撰寫的——整個建立器功能存在的目的就是為了撰寫類型。把它改成嚴格模式會是一項**破壞相容性的變動**：任何現有設定只要帶有一個核心不認得的旋鈕，就會讓 `loadConfig` 失敗，一次性弄壞兩個 host 以及每一個使用者的儲存庫。一份依 `manifest.workSource.type` 為鍵的各類型專屬結構描述，最終還是得放進核心裡、依類型載入、並且和 `orchestrate.ts` 保持同步——同樣的漂移問題，卻有更大的影響範圍。

取而代之的做法是：`server/knobs.ts`，一個以 `workSource.type` 為鍵（可以從 `deps.boards[].sourceType` 取得）的諮詢性質註冊表。`lintLoopKnobs(rawLoops, boards) → ConfigWarning[]`，分成四類，全都**不會阻擋寫入**——它們只會在寫入結果上附加註記，絕不會讓寫入失敗：

- **未知的鍵**——`severityfloor` → *「未知的旋鈕；你是不是想打 `severityFloor`？它將會被悄悄忽略。」* 不分大小寫比對＋編輯距離為 1 的比對，幾乎能抓到所有真實發生的打字錯誤。
- **型別錯誤**——`severityFloor: 7` → *「只有在是字串時才會被讀取（`orchestrate.ts:124`）；已忽略。」*
- **來源錯誤**——在一個 backlog 類型上出現 `query` → *「僅適用於 `github-pr` 類型；已忽略。」*
- **未知的類型**——某個 `loops.<kind>`，卻找不到對應的 `loops/<kind>/` 清單。

**明確點出的取捨：** 這個註冊表重複了原本存在於 `orchestrate.ts` 中的知識，可能會漂移。這個風險是被接受的，並附上大約 15 行程式碼的緩解措施：一個**漂移警報測試**，讀取 `orchestrate.ts` 的原始碼，用正規表示式抓出每一次旋鈕存取，並斷言這個集合和註冊表的鍵完全一致。萬一真的發生漂移，逃生出口就是把這個註冊表提升進核心、放在 orchestrate *旁邊*，讓 orchestrate 反過來讀它——這是嚴格意義上更好的終局狀態，但不值得為此卡住現在這項功能。

### 補上 kinds.ts 的缺口

`routes/kinds.ts:98-108` 用一個原始的 `fs.readFileSync` + `JSON.parse` 讀取 `.agentic-loop.json`，繞過了核心的 `loadConfig`，純粹只是為了檢查 `loops.<kind>.enabled`——然後在 :108 產生一個「請自己手動編輯檔案」的檢查清單項目。把這個原始讀取改成 `readConfigLayer(deps, "repo")`，並把 :108 改成 `{ done: enabled, label: "enable in the Config tab", href: "#config" }`。

這正是這項功能存在的目的所要補上的迴圈缺口，也是為什麼 PR 0 要把 kinds 路由的作用範圍限定下來。

### 重新載入的故事

設定**只在啟動時**被讀取（`main.ts:86`）；沒有任何東西在監看 `.agentic-loop.json`。**兩個部分缺一不可**——只有寫入路由的話，任何一次用 `$EDITOR` 做的編輯（這是很常見的情況）之後，伺服器都會處於過期狀態：

1. **寫入路由 → `repo.reload()`。** 就地執行，不需要重啟。
2. **監看器 → 重新載入。** 在 `WatchSnapshot`（`watch.ts:13-22`）和 `scanSnapshot`（:37）中加入 `configKey`；`diffSnapshots` 發出一個新的 `{ type: "config" }` 事件；`main.ts:157` 的廣播回呼在扇出（fan-out）**之前**呼叫 `repo.reload()`；`web/events.tsx` 新增一個 `config` 版本計數器。

有兩個後續影響必須實際處理，不能假裝不存在：

- **重新載入可能會拋出例外**（錯誤的 JSON、在一份壞掉的清單上呼叫 `kindBoards`）→ 要捕捉例外、**保留舊的 deps**、記錄下來，並且*仍然要廣播*，讓設定路由能正確地把解析錯誤呈現出來。一次手動編輯搞壞的檔案，絕對不能把看板清空或讓伺服器掛掉。
- **`tasksDir` 或狀態的聯集可能會改變**，而監看器正是由這兩者建構出來的（`main.ts:149-158`）→ 重新載入時，只要其中之一變了，就要停止並重啟該儲存庫的監看器。否則管理面板會悄悄地永遠監看著舊的資料夾。

---

<a id="sequencing"></a>

## Sequencing（排序）

**PR 0（基礎）→ 3（預覽）→ 1（把關）→ 2（doctor）→ 4（設定）。**

這四項功能之間的耦合程度並不相同。把關、doctor 和設定三者都需要目前還不存在的同樣三樣東西：`HubDeps` 上一份即時的 `Config`、一個 `isDriving` 驗證機制（oracle），以及限定儲存庫範圍的 kinds 路由。如果把這些東西埋在隨便哪一個先出貨的功能裡面，就會被埋沒；先把它們一次建好，之後每一個 PR 都會變小。

- **設定最後才出貨**，儘管它是最主要的訴求——它是唯一需要處理重新載入問題的功能，而一旦 `repo.deps` 變成 PR 0 引入、且已經被 PR 1–2 實際操練過的可變容器，重新載入就會容易得多。
- **預覽第二個出貨**——瑣碎且唯讀，能在沒有寫入風險的情況下，驗證 PR 0 那個限定範圍的 kinds 變動是否可靠。
- **把關排在 doctor 之前**——doctor 是在*更嚴格*的正確性標準下重複使用 `isDriving`（釋放一個還活著的認領，比拒絕一次重新規劃更糟糕）。

### PR 0 —— 寫入路徑的基礎工程 —— **已發布**

不會發布任何使用者看得到的功能。在它之後的一切都會變得很小。

- **`server/deps.ts`**—— 在 `HubDeps` 上加入 `readonly config: Config`。
- **`server/repo.ts`**（新增）—— 儲存庫註冊表，附帶 `reload()`。從 `main.ts` 抽出來，而不是加進去：`main.ts` 是一支有副作用的進入點腳本（解析 argv、綁定 socket、遇到錯誤輸入就結束），裡面的東西沒有一個能被測試匯入——而 `reload()` 那條「保留最後一份可用設定」的防護機制，值得被驗證。`scoped()` 已經會在每個請求時重新讀取 `repo.deps`，所以重新指定這個欄位不需要任何處理器（handler）層級的接線工程。一次會改變 `tasksDir` 或狀態聯集的重新載入，也會重啟由這兩者建構出來的監看器。
- **限定 kinds 路由的作用範圍**—— `getKinds` / `getKind` / `validateKind` / `saveKind` 傳入的是 `defaultRepo.deps`，所以 `buildChecklist`（`kinds.ts:78-111`）**在第二個儲存庫上會悄悄地算錯**。這是一個潛藏 bug 的修復，不只是前置工程：`?repo=` 帶一個未知的 id 現在會回傳 400，而不是悄悄地改用預設值。
- **新增 `server/gatectx.ts`**—— 六行程式碼，把 `HubDeps` 映射成 `GateCtx`。這正是核心完全不需要改動的全部原因。
- **新增 `server/driving.ts`**——[`isDriving` 驗證機制（oracle）](#the-isdriving-oracle)。同時也成為唯一的階段標記讀取器（`routes/active.ts` 會匯入它）。
- **新增 `web/ui/Confirm.tsx`**——仿照 `ui/Button.tsx` 單一原語（one-primitive）的風格。`detail` 是**用文字說明真實世界會發生的副作用**（例如「提交到 git，並對 `main` 開啟一個 pull request」），而不是「你確定嗎？」。PR 1–4 中每一個有副作用的按鈕都會透過它。
- **`web/api.ts`**—— `postAction<T>`，在收到 200 且 `ok:false` 時不會拋出例外（見[200 規則](#1--gate-actions)）。
- **`tsconfig.test.json`**（新增，原本沒有規劃）—— 測試檔案原本從未被做過型別檢查；見[Verification（驗證）](#verification)那段的小陷阱。

<a id="the-isdriving-oracle"></a>

### `isDriving` 驗證機制（oracle）

這是這份文件中最細膩的一塊。把 `readStageMarker` / `StageMarkerSchema` 從 `routes/active.ts:23-29,86-98`抽到 `driving.ts` 中，讓 `active.ts` 反過來匯入它——只留一個讀取器，而不是兩個會彼此漂移的讀取器。

```
makeDrivingOracle(deps, now?) → { isDriving: (id) => boolean; markerTaskId; claimedIds; watcherLive; leasePid }
```

兩種訊號，依強度排序：

1. **認領標記——最關鍵的訊號。** 一個迴圈會在開始驅動一個任務*之前*先認領它（在 `<status>/.claims/` 底下做一次原子性的 `mkdir`，`store.ts:341`），並在整個過程中持續持有這個認領，所以**驅動中必定意味著已被認領**。這讓認領成為一個**按任務**的訊號。要掃描每一個已啟用類型所宣告的認領池（`board.pools`，`routes/backlog.ts:51` 已經是這樣做的）——PLAN 的認領存在於 `queued/`，不只在 `in-progress/`。
2. **階段標記**（`runs/.stage.json`）——由 Claude host 在階段執行期間寫入，並記錄了任務名稱。OpenCode host 則完全不寫這個檔案。

`isDriving(id)` 就是 `claimed.has(id) || id === markerTaskId`。

這個偏向是刻意設計的：一個擱淺的認領會造成一次假性拒絕，這只是一個 doctor 就能清除的、可回復的小麻煩。但錯誤地判斷為*沒有*在驅動中，會讓一個正處於 BUILD 半途的任務被重新排入佇列，摧毀既有的工作成果。**拿不準的時候，就當作正在驅動中。**

**watch 租約刻意不被當作驅動中的訊號。** 這很誘人——因為 OpenCode host 不寫階段標記，所以一個活著的監看器看起來像是一個不透明的盲點。但事實並非如此：監看器會先認領才驅動，所以一個持有*任何*認領的活躍監看器，其實是在輪詢，而不是在驅動中。如果拿租約來做阻擋，只要監看器還在跑，就會拒絕每一個把關動作——而這正是正常的工作流程（你在核准的時候，監看器仍在輪詢）。它只會以 `watcherLive` / `leasePid` 的形式被回報，僅供上下文參考，以及讓拒絕訊息更誠實而已。

剩下的競速情境——監看器列出可認領的工作、你重新規劃、監看器接著才去認領——這和 `claimTask` 那個原子性的 `mkdir` 留給任何兩個認領者的時間窗口是一樣的，而兩個 host 早就已經在跟這個情況共存了。`expectStatus`（[1](#1--gate-actions)）能進一步縮小這個窗口。

---

## 安全態勢

**這個態勢原本就是對的；這裡的工作是不要削弱它。** 每一條新增的、有副作用的路由都原封不動地繼承了：

- 綁定在 127.0.0.1（`main.ts:167`）
- `isLocalHost` 這個 Host 標頭／DNS 重綁定（rebinding）防護（`http.ts:196`）
- `mutating: true` 的路由一律要求 `X-Hub-Client: 1`（`http.ts:221`）——這是 CSRF 防護。系統從不提供任何 CORS 標頭，所以跨來源的頁面既無法讀取回應，也無法在沒有觸發預檢請求（preflight）失敗的情況下送出那個標頭。
- 1 MB 的請求內容上限（`http.ts:129`）、每一個抵達檔案系統的 id 都會經過 `isSafeId`（`http.ts:85`）、路徑範圍限制（`kinds.ts:131-133`）

**不要新增任何新機制。** 唯一真正的風險是在新路由上忘了加 `mutating: true` 或 `isSafeId`——把它列成每一條路由都要檢查的審查清單項目。

依風險排序，每一項都附上它對應的防護機制：

| # | 風險 | 緩解措施 |
|---|---|---|
| 1 | 設定寫入把使用者層級攤平 → **把 `ado.pat` 提交進版本控制** | 路由明確指定層級；`effective` 永遠不會被寫入；哨兵值的往返機制；gitignore 防護（[Crux B](#crux-b--the-layer-footgun)） |
| 2 | 設定寫入**剝除了 `watchIntervalMinutes` / `hub`** | 原始資料才是模型；一項重點回歸測試；可見的 passthrough（[Crux A](#crux-a--the-strip-footgun)） |
| 3 | **重新規劃在 BUILD 進行到一半時重新排入佇列** → 摧毀既有工作 | `isDriving` 讀取認領（驅動中必定意味著已被認領）＋階段標記，並偏向判定為「驅動中」（[驗證機制](#the-isdriving-oracle)） |
| 4 | 一次點擊**開啟一個真實的 PR** | 危險等級的 `<Confirm>`，用白話文說明其影響 |
| 5 | 過期看板上的把關動作 | `expectStatus` → 409 |
| 6 | Doctor **釋放一個還活著的認領** | 使用核心自己的孤兒判斷式（`isOrphanedClaim` / `isOrphanedPlanClaim`），而不是 `isDriving`——依定義，每一個候選對象都是被認領的 |
| 7 | 手動編輯出錯的設定弄掛伺服器 | 拋出例外時保留舊的 deps |

風險 1 和 2 正是設定編輯器**成本為 L**、且最後才發布的原因。

### 關於機密資訊遮罩

這一點值得講清楚，因為很容易搞反：**遮罩處理早就做好了，管理面板是免費繼承到這個能力的。**

[Improvement 05](./improvements/05-secret-redaction.md) 把 `redact` 發布為一項**寫入邊界**的管控——核心會在持久化產出物落地到磁碟*之前*先清除機密資訊，接線於 `store.ts:579`（`appendNote`）、`:610` 和 `:617`（`appendPlan`）。所以管理面板在 `backlog.ts:90` 所提供的任務檔案中，由 agent 寫入的那些部分，在寫入的當下就已經完成遮罩了。

因此，如果在管理面板的**讀取**路徑上再套用一次 `redact()`，對真正需要遮罩的內容來說完全是多餘的，而它那條通用賦值規則（`redact.ts:53`）反而會吃掉任何*討論*到認證（auth）的任務中原本合理的文字內容——而 engineering 任務經常會討論到這個主題。所以不要這麼做。

設定中的 `ado.pat` 是另一個不同的問題，需要用不同的工具處理：它是一個**路徑已知**的機密資訊，所以用哨兵值就能精準處理（[Crux B](#crux-b--the-layer-footgun)）。用正規表示式在這裡是錯誤的工具。

---

<a id="verification"></a>

## Verification（驗證）

**管理面板目前是這樣被測試的：** 透過 `tsx` 執行 `node --test`，不使用任何框架（`packages/hub/package.json`）。基本模式（`routes/kinds.test.ts:13-23`）是：建構一個字面量的 `HubDeps`，用 `{ params, query, body }` 呼叫處理器，再對 `JsonResponse` 做斷言。透過 `os.tmpdir()` 使用真實檔案系統的測試固定物（fixture）（`routes/save.test.ts`）。已經發布的清單同時也兼作測試固定物。

**兩個容易踩到的陷阱：**

- `HubDeps` 在 PR 0 中新增了 `config` → **所有既有的測試固定物都必須加上它**。這是機械式的改動，大約 6 個檔案；要在 PR 0 就做，不要拖到之後。更糟的是，沒有任何東西會*告訴*你這件事：`tsconfig.json` 同時也兼作建置設定，所以它排除了 `*.test.ts`，以免測試被打進 `dist/`——而執行器是 `tsx`，它只是剝除型別而不會檢查型別。一個已經不再符合 `HubDeps` 的測試固定物，既不會讓建置失敗，也不會讓測試套件失敗。PR 0 新增了 `tsconfig.test.json` 來補上這個缺口；`packages/core` 有一樣的缺口，尚未修復。
- 測試的 glob 沒有涵蓋 `creator/` 以外的 `src/web/*.test.ts`。新增的前端測試要放在那裡，或者明確地擴大 glob 的涵蓋範圍。

依功能分別列出：

- **Gate**（`routes/gate.test.ts`）—— 使用 tmpdir + `git init`。每一個動作都要移動檔案並提交；`expectStatus` 不符 → 409；帶路徑穿越的 id → 400；**當標記指向該 id 時，重新規劃會被拒絕**；**當任務持有認領時，重新規劃會被拒絕**；**當監看器租約活著、但任務未被認領時，允許重新規劃**（因為監看器在輪詢，不是在驅動中）；`ok:false` 回傳 200，並保留 `variant`。Ship 使用一個會讓 `gh` 失敗的 stub `sh`——斷言任務仍然完成，且備註記錄了「PR not opened」（`gate.ts:265-268`）。**測試中不接觸網路。**（`driving.ts` 自己的完整矩陣則由 `driving.test.ts` 涵蓋，已在 PR 0 中落地。）
- **Doctor**——回報結果是唯讀的（斷言在一次 GET 之後，檔案系統仍然逐位元組（byte）完全相同）；修復動作會救回一個迷途任務並提交；重複項目只回報、不動它；**新鮮的**認領不會被釋放，**孤兒**認領則會；一個和既有草稿撞名的迷途任務，會被放進 `failed`，且不會拋出例外。
- **Preview**——engineering 已發布的真實提示詞能正確渲染；開關會改變輸出結果；check 類型的階段會拿到裁定合約區塊；帶有 compose hook 的階段會回傳那則備註、且不會拋出例外；未知的階段 → 400。
- **Config**——最重的測試套件，而且理所當然：
  - **剝除欄位的回歸測試（這是最重要的一項測試）**——一個儲存庫檔案裡同時有 `watchIntervalMinutes` **和** 一個 `hub` 區塊；修補 `maxIterations`；斷言這兩者都逐位元組完整保留。
  - **層級隔離**——使用者層級有 `ado.pat`；在儲存庫層級修補 `maxIterations`；斷言儲存庫檔案**沒有**多出一個 `ado` 鍵。
  - **來源歸屬驗證機制**——針對 `mergeConfigLayers` 的屬性測試；陣列和 `null` 一律整體取代。
  - **機密資訊往返測試**——GET 會遮罩成哨兵值；POST 若原樣回傳哨兵值，保留真實的值；POST 帶新值則會取代它。
  - **gitignore 防護**——在檔案沒有被忽略的情況下設定 `ado.pat` → 400。
  - **驗證**——`codePlatform: "ado"` 卻沒有 `ado` 區塊 → 400，並附上路徑 `["ado"]` 的 `superRefine` 問題；`ado` 缺少 `selfLogin` → 在 `["ado","selfLogin"]` 回傳 400（`config.ts:150-169`）。
  - **旋鈕檢查**——打字錯誤 → 建議；型別錯誤 → 警告；來源錯誤 → 警告；**全部仍然會寫入**（僅供參考）。
  - **漂移警報**——註冊表的鍵 === 從 `orchestrate.ts` 用正規表示式抓出來的旋鈕名稱。
  - **解析錯誤**——格式錯誤的 JSON → 200，附上 `parseError`，而不是 500。
  - **重新載入**——一次失敗的重新載入，會讓舊的 deps 維持完整不變。

**端對端測試。** `npm run test:all` 和 `npm run typecheck:all`（型別檢查會同時跑伺服器和前端兩份 tsconfig，所以新的傳輸型別必須同時滿足兩者）。接著實際操作真實的應用程式：啟動管理面板，在 `plan-review/` 中對某個任務點一下把關按鈕，確認檔案確實被移動**且有一次提交落地**；啟動一個 OpenCode 監看器，確認重新規劃會被拒絕；在 Config 分頁編輯 `maxIterations`，確認看板**不需要重啟**就能反映出來；用 `$EDITOR` 手動編輯檔案，確認監看器會重新載入。

---

## 待更新的文件

依照[improvements 的慣例](./improvements/README.md#conventions-every-plan-follows)，文件也是「完成」的一部分：

- ~~**[`architecture.md`](../architecture.md)**~~ ——**已完成**（PR 1）。「觀察……而從不驅動迴圈」這句話，在 PR 1 落地的那一刻起就不再成立。現在陳述的是精確的界線：管理面板透過兩個 host 都在用的**同一套共用核心進入點**執行人工把關動作——它不驅動*階段*。**是把關點的第四個呼叫者，而不是第四個驅動者。**
- ~~**[`packages/hub/README.md`](../../packages/hub/README.md)**~~ ——**已完成**（PR 1）。「刻意維持唯讀」這條但書已經拿掉；寫入介面、兩列式的寫入表格，以及誠實列出的限制都補上了（**對一個已被認領的任務執行把關動作會被拒絕，直到該認領被釋放為止**，而且**ship 會開啟一個真實的 PR**）。`docs/manual.html` 那個唯讀狀態的小標籤，也因為同樣的原因過期了，現已一併修正。
- **[`configuration.md`](../configuration.md)** —— 仍待處理，涉及設定編輯器（[4](#4--config-editor)）。要記載編輯器的內容：層級明確的編輯方式、來源歸屬、passthrough 規則、`ado.pat` 遮罩、gitignore 防護、諮詢性質的旋鈕檢查。**交叉連結到 `loops.<kind>` 的旋鈕表格**（[Crux C](#crux-c--loops-is-looseobject)），並修正 :126 那句「由該類型自行驗證」的說法——這是一項獨立於這項功能之外、本身就值得做的文件修正。
- ~~**[`threat-model.md`](./threat-model.md)**~~ ——**已完成**（PR 4）。新增了 T14–T16：HTTP 介面（localhost／Host／`X-Hub-Client`，以及誠實承認目前沒有身分驗證這項殘留風險）、過期看板與活躍迴圈的把關防護，以及設定寫入——這是整個模型中授予其他一切授權的那個檔案。
