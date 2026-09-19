# 本机配置说明（Windows，Administrator 这台机器）

这份文件记录**这台机器**上为了让流程跑起来做的适配。仓库里的流程说明（`README.md`、
`docs/怎么用这套作业-lk线.md`）照旧适用，只是 Windows 上跑题用的客户端在下面这个位置。

## 本机的路径

| 东西 | 位置 |
|---|---|
| 题库仓库 | `C:\Users\Administrator\Documents\coding-agent-tasks`（桌面上有「题库仓库」快捷方式） |
| 跑题用的 Codex CLI 配置 | `C:\Users\Administrator\.codex-cli\.codex\config.toml`（CODEX_HOME） |
| 跑题用的启动器 | `codexcli`（= `.codex-cli\.codex\bin\codexr.cmd` 的别名） |
| 跑题轨迹 | `C:\Users\Administrator\.codex-cli\.codex\sessions\YYYY\MM\DD\rollout-*.jsonl` |
| 失败存档 | `C:\Users\Administrator\.coding-agent-tasks\runs\<题号>\<A|B>-<时间戳>\` |
| 题目工作区 | `桌面\GSB题目\<题号>\A|B`（`t new` 自动铺） |
| prompt 副本 | `桌面\prompt原文\<题号>-<项目名>.txt` |

## 这台机器上做的三处适配

1. **新增 `codexcli` 命令**：流程的 A/B 启动器调的是 `codexcli`，而隔离脚本装出来的
   wrapper 叫 `codexr`。现在 `%APPDATA%\npm\codexcli.cmd` 和
   `.codex-cli\.codex\bin\codexcli.cmd` 都会转发到 `codexr.cmd`，两处都放是为了不依赖
   PATH 的刷新时机。
2. **`tools/task.py`**：`codex_cli_config_path()` 除了 `~/.codex-cli/config.toml`，也会认
   Windows 隔离布局的 `~/.codex-cli/.codex/config.toml`，这样 `t new/prep/cycle` 写的目录
   信任（免「是否信任此目录」弹窗）才会落进真正生效的那份配置。
3. **`tools/find_trajectory.py`**：扫描目录里加了 `~/.codex-cli/.codex/sessions`，
   否则按 SessionID 找不到这台机器的轨迹文件。
4. **A/B 启动器**（`tools/task.py` 里的 `write_launchers`）：Windows Terminal 开新标签之前先把
   `TERM` 设成 `xterm-256color`（有些启动方式会带进来 `TERM=dumb`，Codex 会停在
   「Continue anyway? [y/N]」不往下走）；每一步写进
   `~\.coding-agent-tasks\logs\<题号>-<A|B>.log`；`wt` 用不了就退回独立窗口；
   任何一步失败都停在窗口里把日志尾部打出来，不再一闪而过。
5. **修 relay 模型目录**（`C:\Users\Administrator\.codex-cli\repair-model-catalog.py`）：
   供应商脚本为了把窗口放到 1M，克隆了一个内置 catalog 条目，而那个条目带着桌面客户端的
   工具模式（`tool_mode = code_mode_only`）、多智能体版本和整套 `functions.xxx` 提示词。
   CLI 于是按桌面客户端描述工具，模型调 `functions_exec`，CLI 回 `unsupported call`，
   模型一步都动不了（看起来像一直在等授权）。现在把这些字段去掉、`base_instructions`
   换成 CLI 自己的提示词，窗口仍旧是 1M。**如果哪天重跑了供应商的 setup 脚本，记得再执行一次
   这个修复脚本**，否则工具又会被关掉。

## 跑题环境（已在 `~/.codex-cli/.codex/config.toml` 里配好）

模型 `auto_model/urm`（super_relay 网关）、上下文窗口 1,000,000、推理 `high`、
思考摘要 `auto`、审批 `never` + `danger-full-access`（不弹确认）。
改动前备份在 `config.toml.bak-before-workflow-<时间戳>`。

改动只发生在 CLI 专用目录，桌面客户端的 `~/.codex` 没有被碰过。

自检：

```powershell
codexcli debug models   # 能看到 auto_model/urm
cmd /c "codexcli exec --skip-git-repo-check ""reply with exactly: ok"""
```

## 提交前要补的东西

- `tools/submit_config.json` 的 `submitter_name` 必须填**飞书显示名**，否则 `submit` 找不到表行；
  同一个文件里的 `submitter_open_id` 可以留空。
- 仓库的 git 身份现在是占位值（`gsb-user`），提交数据前改成自己的名字拼音和邮箱：

  ```bat
  git config user.name  "<你的名字拼音>"
  git config user.email "<你的邮箱>"
  ```

- **远端**：`origin` 指向自己的公开仓库 `https://github.com/liiing123/gsb-coding-agent-tasks`
  （独立仓库，不是 fork；台账里的快照/轨迹链接都指向它）；
  原仓库记在 `upstream`，要合并别人的更新用 `git fetch upstream && git merge upstream/main`。
- **网络**：这台机器直连 `github.com:443` 不通，git 已配置走本地代理
  `http://127.0.0.1:10090`（写在本仓库的 git config 里，不用每次手动设）。
- `submit` 依赖 `lark-cli`（本机没装），dry-run 之外的上传要等它到位。

## 日常怎么用

```bat
:: 在仓库目录里（或点桌面「题库仓库」进去），t 就是 uv run python tools\task.py
t list                       :: 看所有题目与 A/B 状态
t new <你的前缀>-001 --workspace <起始环境目录> --prompt-file p.txt ^
      --title "..." --task-type "0-1 代码生成" --difficulty 困难 ^
      --lang "JavaScript, Canvas, 原生 ES module（无构建、无依赖）" ^
      --harness "Codex CLI" --harness-version "0.155.1" --os Windows ^
      --env-level "无外部依赖"
t report <题号>               :: 输出要填的字段
submit <题号> --uid 14X       :: 先 dry-run 预览，确认后加 --write
```

建完题后，桌面 `GSB题目\<题号>\` 下会有 `A-run.cmd` / `B-run.cmd`，双击就是干净的一轮：
窗口里**只贴 prompt 原文**，跑完先 `t record <题号> a --side a --session <SessionID>` 再关窗口。

## 几条别踩的线

- **题号用自己的前缀**（名字缩写加序号，例如 `wjt-001`），别用 `lk-` 或 `T`，会和别人撞。
- 出题前先看 `docs/雷同题黑名单.md`，撞题会被拒收。
- **GSB 结论和理由必须人自己写**，项目文档禁止用 AI 分析轨迹或代写理由。
- 带 API Key 的文件（`C:\Users\Administrator\Downloads\vendor-instruction (1)\vendor\codex-cli-setup.sh`、
  `codexr.cmd`、`.codex-cli\.codex\*`）**不要提交进仓库、不要外发**。
  需要重配 relay 时，原件在 `C:\Users\Administrator\Downloads\windows适配\windows适配\`
  （`codex-isolate.ps1` + `使用说明.md`）和 `Downloads\vendor-instruction (1)\vendor\`。
