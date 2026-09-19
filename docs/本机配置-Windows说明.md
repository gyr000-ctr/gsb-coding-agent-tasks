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

- 推送需要 GitHub 凭据（本机还没有任何 GitHub 凭据/SSH key），并且要有
  `kundawang/coding-agent-tasks` 的写权限；没有就走自己的仓库。
- `submit` 依赖 `lark-cli`（本机没装），dry-run 之外的上传要等它到位。
