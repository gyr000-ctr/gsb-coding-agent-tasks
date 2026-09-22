# 轨迹里的 skill / harness 注入：问题是什么、怎么解决的

一句话：**这些问题不在轨迹文件里改，而在跑题用的 `CODEX_HOME` 里关。**
技能清单、权限说明、环境上下文、协作模式这几块都是 codex CLI 每轮往会话里塞的
「harness 前导」，把注入关掉，rollout 里自然就只剩 prompt、模型的输出和工具调用。

这篇是给要复现这套做法的人看的：症状、根因、改哪几个开关、怎么验证、踩过哪些坑。
本机的具体适配记录在 `docs/本机配置-Windows说明.md`（第 7、8 条是这件事）。

---

## 1. 症状：轨迹里混进了跟题目无关的大段文字

提交要的是 codex CLI 自己写的那份 rollout（`sessions/.../rollout-*.jsonl`）。
没做任何处理时，它长这样（真实文件、真实字数，用 `tools/rollout_info.py` 量的）：

| 轨迹 | 跑的时间 | 注入合计 | 明细 |
|---|---|---|---|
| `ZZ-003/A` | 09-20 13:35 | **7308 字** | `skills_instructions` 5174、`collaboration_mode` 1348、`environment_context` 423、`permissions` 363 |
| `ZZ-005/A` | 09-20 15:14 | **7308 字** | 同上 |
| `ZZ-006/A` | 09-20 16:21 | **19769 字** | 再多 `app-context` 9245、`multi_agent_mode` 271、`other` 2264；`skills_instructions` 5738 |
| `ZZ-009/A` | 09-20 18:00 | **7308 字** | 同 ZZ-003 |
| `ZZ-012/A` | 09-21 11:02 | **7308 字** | 同 ZZ-003 |
| `ZZ-016/A` | 09-21 15:39 | **0 字** | 无 |
| `ZZ-017/A` | 09-21 15:40 | **0 字** | 无 |

那 5174 字的 `skills_instructions` 里是当时能看见的 12 个技能，每个带一句描述和一个
`SKILL.md` 路径：

```
<skills_instructions>
## Skills
A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. ...
### Skill roots
- `r0` = `C:/Users/Administrator/.codex/skills`
- `r1` = `C:/Users/Administrator/.codex/skills/.system`
- `r2` = `.../.codex-cli/.codex/plugins/cache/openai-primary-runtime`
- `r3` = `.../plugins/cache/openai-primary-runtime/spreadsheets/26.909.61513/skills`
### Available skills
- imagegen: Generate or edit raster images when ...
- openai-docs: Use for Codex models/pricing, scheduled tasks, skills, settings, ...
- plugin-creator / skill-creator / skill-installer / documents / pdf /
  presentations / spreadsheets / excel-live-control / template-creator /
  pairwise-gsb-question-authoring: ...
</skills_instructions>
```

问题有三层：

1. **对账难看**：轨迹本身是「prompt + 模型行为」的证据，前面却垫了七千多字跟题目无关的说明。
2. **两台机器/两轮不一样**：技能清单取决于这台机器装了什么插件、技能根目录指向哪，
   换个环境那段文字长度就变了，两轮 harness 就不「完全相同」了。
3. **会漏本机信息**：`environment_context` 里带着本机 `cwd`、日期、时区。

## 2. 根因：这是 harness 每轮主动注入的，不是模型写出来的

codex CLI 每开一轮，会把下面这些当成 developer / user 消息块塞进会话最前面：

| 块 | 内容 | 来源 |
|---|---|---|
| `<skills_instructions>` | 可用技能清单（名字 + 描述 + `SKILL.md` 路径 + 技能根目录表） | `CODEX_HOME/skills` 目录 + 各插件 `cache/.../skills` + `[[skills.config]]` 里没禁用的条目 |
| `<permissions instructions>` | 审批策略、沙箱说明 | CLI 固定前导 |
| `<environment_context>` | `cwd`、日期、时区、workspace roots | CLI 固定前导 |
| `<collaboration_mode>` | 当前协作模式那段说明 | CLI 固定前导 |
| `<app-context>` | 桌面客户端相关的说明（这一块只在被桌面配置污染时出现） | 桌面客户端的配置/插件 |

技能那块的长度直接跟着「这台机器能看见几个技能」走，所以同一台机器不同时间跑出来都可能不一样
（5174 / 5738 / 4888 都出现过）。

## 3. 为什么不直接对文件做后处理

**提交要求是原始 rollout，逐字节上证。** 本仓库的做法是 `t record` 用
`shutil.copy2` 原样拷进 `tasks/<题号>/trajectories/`，同时把
`raw_sha256` / `raw_lines` 一并记进 `meta.json` 的 `runs.A/B.evidence`，事后可以复核
「交上去的就是 CLI 写的那份」。

一旦在中间插一个清洗脚本：

- 交出去的就不再是 CLI 写的那份文件，「原样上交」这条口径先破了；
- 洗过的文件和原始文件对不上，`raw_sha256` 失去意义；
- 注入块是 harness 版本相关的，CLI 升级就会新增/改名（`app-context`、`multi_agent_mode`
  就是这么冒出来的），清洗脚本永远追在后面，漏一块就是一条不合规的轨迹。

所以正确的位置是**源头**：让 harness 一开始就不注入。文件一个字都不用动。

## 4. 怎么解决（四步，改的都是跑题用的 `CODEX_HOME`）

前提：跑题用的是单独一份 CLI 配置（本机是 `C:\Users\Administrator\.codex-cli\.codex\config.toml`），
**桌面客户端那份 `~\.codex` 不用动、也别动**。
每改一次都先复制一份 `config.toml.bak-before-<改了什么>-<日期>`。

配置改完**要新开窗口**才生效（跑题是「一次会话 = 一轮」，旧窗口里的会话配置不变），
而且上一轮跑出来的轨迹不会因为这次改动变干净——那一轮得删掉重跑。
另外这四个开关和技能配置都是 CLI 自己的键，跨版本可能改名或新增；不确定时按第 5 节实测一轮，
以量出来的 `harness_parts` 为准。

### 4.1 关掉技能清单（`skills_instructions` 归零）

在 `config.toml` 里给每个 `SKILL.md` 加一条禁用，五个内置技能 + 出题技能一个不落：

```toml
[[skills.config]]
path = "C:/Users/Administrator/.codex/skills/.system/imagegen/SKILL.md"
enabled = false

[[skills.config]]
path = "C:/Users/Administrator/.codex/skills/.system/openai-docs/SKILL.md"
enabled = false

[[skills.config]]
path = "C:/Users/Administrator/.codex/skills/.system/plugin-creator/SKILL.md"
enabled = false

[[skills.config]]
path = "C:/Users/Administrator/.codex/skills/.system/skill-creator/SKILL.md"
enabled = false

[[skills.config]]
path = "C:/Users/Administrator/.codex/skills/.system/skill-installer/SKILL.md"
enabled = false

[[skills.config]]
path = "C:/Users/Administrator/.codex/skills/pairwise-gsb-question-authoring/SKILL.md"
enabled = false
```

要临时用一个技能，就把对应那条改回 `true`（或者删掉那条）——但那一轮的轨迹里会重新出现
技能清单，别拿它当提交用的那一轮。

### 4.2 关掉插件和 MCP（技能根目录、工具说明的来源）

把 `config.toml` 里的 `[plugins.*]`、`[marketplaces.*]`、`[mcp_servers.*]`
（本机出现过 `node_repl`、`cua_repl`）整段删掉。这些段会把桌面客户端的插件目录整个带进来，
既贡献技能根目录 `r2` / `r3`，也贡献 `<app-context>` 那种大块说明。

配套的还有仓库这边：`tools/task.py` 里 `HARNESS_LINKS = ("skills",)`
——每轮的运行环境只把 `skills` 目录联接过去（配置里那些路径要能解析），
`plugins` 反而留一个**空目录**，不链接共享那份。

### 4.3 关掉四块固定前导（`permissions` / `environment_context` / `collaboration_mode` / `apps`）

写到 `config.toml` 的**最顶部**（第一个表头之前）：

```toml
include_permissions_instructions = false
include_apps_instructions = false
include_collaboration_mode_instructions = false
include_environment_context = false
```

**位置是硬要求**：这四个是顶层键，写到文件末尾就落进最后一个 `[projects.'...']` 表里，
等于没设。踩过一次，实测当时还注入 816 字。

### 4.4 每轮一份独立 `CODEX_HOME`（保证两轮一样、又互不串）

同一台机器跑 A / B，两轮共用一份 `CODEX_HOME` 时 `sessions/` 和 `history.jsonl` 是同一个目录，
另一轮的完整对话就躺在那里；更重要的是「两轮 harness 完全一致」这条没法保证。
本仓库的做法（`tools/task.py` 的 `ensure_side_home()`，双击 `A-run.cmd` / `B-run.cmd` 时触发）：

```
~\.coding-agent-tasks\homes\<题号>-<A|B>\.codex\      <- 这一轮专属
```

- `config.toml`：每次从模板重铺一份，两轮逐字节一致（`t cycle` 会比对哈希，不一致会报），
  只额外补上本题 A / B 两个工作区的信任项（免得弹「是否信任此目录」）；
- `skills/`：目录联接指回共享那份（只读）；
- `plugins/`：**空目录**（见 4.2）；
- `auth.json` / `relay_base_instructions.txt` / `relay_model_catalog.json`：从模板拷；
- 启动器把 `CODEX_HOME` 写死成这一轮的，再调 CLI。

顺带一个坑：`codex_cli_config_path()` 要忽略「`CODEX_HOME` 已经指向 `homes/` 底下」的情况并回落到
真正的模板。否则每轮拿自己那份当模板铺自己，铺不出来，直接回落到共享 home，隔离白做。

## 5. 改完怎么验（这一步不能省）

**跑一轮真的会话**（不是 `--help`），然后用 `rollout_info` 读原始 rollout，看两个字段：
`harness_chars`（总字数）和 `harness_parts`（各块明细）。期望是 `0` 和空。

日常做法就是跑完记账那一步：`t record` 会把注入块逐条打出来——

```bat
t record ZZ-016 a --side a --session <A-SessionID>
```

- 有注入 → `· 这条轨迹里还有 harness 注入：skills_instructions 5174 字、… —— 跑题配置里的
  include_* 要都是 false（见 docs/本机配置-Windows说明.md 第 8 条），确认之前先别提交这一轮`
- 没注入 → `· 轨迹里没有任何 harness 注入：只有 prompt、模型的输出和工具调用`

临时想单独量一份文件：

```powershell
uv run python -c 'import sys;sys.path.insert(0,"tools");import rollout_info as r;e=r.rollout_evidence(r"C:\path\to\rollout-....jsonl");print(e["harness_chars"], e["harness_parts"])'
```

不确定原始 rollout 在哪，用 SessionID 找：

```bat
uv run python tools\find_trajectory.py <SessionID>
```

顺带提醒：验证要看**改动之后新跑的那一轮**。已经跑完的轨迹不会因为改配置而变干净，
只能删掉重跑（别去洗文件，见第 3 节）。

## 6. 判读口径：文件里还有哪些文字是「正常」的

关到「零」指的是**没有 harness 注入的消息块**，不是说文件里只剩 prompt 的字。
rollout 格式本身就带这些记录字段，它们不算往对话里塞内容：

| 字段 | 还有什么 | 说明 |
|---|---|---|
| `session_meta.base_instructions` | 模型的基础提示词（本机实测 21298 字，`provenance: custom`，来自 `relay_base_instructions.txt`） | 换模型/换 provider 就会变；ZZ-016/ZZ-017 四条轨迹逐字一致，正是「两轮 harness 相同」的证据。这是 CLI 记录自己的配置，不是本轮注入 |
| `turn_context` | `cwd`、`current_date`、`timezone`、`approval_policy`、`sandbox_policy`、`model`、`collaboration_mode`（里面的 `developer_instructions` 实测 1307 字）等 | 结构化元数据。`include_collaboration_mode_instructions=false` 挡掉的是那条 developer **消息**，不是这个记录字段 |
| `event_msg` / `world_state` / `token_usage_record` | 事件、token 计数、窗口大小 | 对账用得上（`model_context_window` 只在 `task_started` 里） |

所以自查时**别拿全文 grep 下结论**：直接搜 `skill` 还会命中的是这些记录字段。
判断口径就一条——`response_item` / `message` 里还有没有 `role=developer|user` 的注入块。
`rollout_info` 量的是这个。

## 7. 踩过的坑（照搬时注意）

1. **四个 `include_*` 写到文件末尾** → 落进最后一个 `[projects.'...']` 表，等于没设。必须写在顶部。
2. **只关技能、没关四块前导** → 轨迹里还剩 800 多字，而且 `environment_context` 会把本机 cwd 带出去。
3. **重跑了供应商的 setup 脚本** → `[plugins.*]` / MCP / `tool_mode` 又回来，轨迹里出现
   `<app-context>`（`ZZ-006` 那条就是 19769 字，还带着 `gpt-5.5` / 窗口 996147 的痕迹）。
   重跑完要再执行一次 `repair-model-catalog.py` 和本文这套配置，并且**新开窗口重跑这一轮**。
4. **手敲 `codexcli` 而不是点启动器** → `CODEX_HOME` 落到共享那份，两轮共用 sessions，
   注入也按共享配置走。要重开窗口。
5. **想「反正交了也看不出来」去洗文件** → 见第 3 节，直接重跑更省事。
6. **Windows 上 `core.autocrlf=true` 的副作用**：committed 的 blob 和原始 rollout 逐字节一致
   （`t record` 用 `shutil.copy2` 二进制拷贝），但**工作区里**那份会被检出成 CRLF，
   大小比原始文件多出「每行一个字节」（例：`ZZ-016/A` 原始 372093 字节 / 146 行，
   工作区 372239 字节）。核 sha256 要用 `git show HEAD:<路径>` 或直接量原始 rollout，
   别拿工作区文件去对。想彻底避免这类歧义，可以加一行 `.gitattributes`：

   ```
   *.jsonl -text
   ```

## 8. 换个环境照搬的检查清单

- [ ] 跑题用的 CLI 有自己独立的 `CODEX_HOME`，和桌面客户端那份分开；
- [ ] 改之前备份 `config.toml`（`config.toml.bak-before-...`）；
- [ ] `[[skills.config]] enabled = false` 覆盖所有 `SKILL.md`（改完全文搜一遍 `SKILL.md` 别漏）；
- [ ] 没有 `[plugins.*]` / `[marketplaces.*]` / `[mcp_servers.*]`；
- [ ] 四个 `include_* = false` 在**第一个表头之前**；
- [ ] 每轮一份 `homes/<题号>-<A|B>/.codex`，两轮 `config.toml` 哈希一致，`plugins/` 空目录；
- [ ] 窗口从启动器开（`CODEX_HOME` 才指得对）；
- [ ] 跑完 `t record` 的 `harness_parts` 是空的，`model_context_window` 是 1000000，prompt 与
      `prompt.md` 一致；
- [ ] 轨迹**原样**进 `tasks/<题号>/trajectories/`，`meta.json` 里留着 `raw_sha256` / `raw_lines`。

## 9. 效果（本机实测，可复核）

| 题号 | 修之前 | 修之后 | 证据文件 |
|---|---|---|---|
| `ZZ-016` | （同款配置下约 7308 字注入） | `harness_chars = 0`、`harness_parts = {}` | `tasks/ZZ-016/trajectories/A-01a0c2e8-….jsonl`、`B-01a0c2e8-….jsonl` |
| `ZZ-017` | 同上 | 同上 | `tasks/ZZ-017/trajectories/A-01a0c2e8-….jsonl`、`B-01a0c2e8-….jsonl` |

判定依据记在 `tasks/<题号>/meta.json` 的 `runs.A/B.evidence` 里（`harness_chars`、
`harness_parts`、`raw_sha256`、`raw_lines`、`model`、`model_context_window`、`prompt_sha256`），
和提交的轨迹文件一一对应，事后可复核。

相关文档：`docs/本机配置-Windows说明.md`（第 7、8 条 + 三份 CODEX_HOME 的关系表）、
`README.md` 的《轨迹文件：原样上交，不做清洗》。
