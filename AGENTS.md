# AGENTS.md

## 文件定位约定

给用户任何本地文件时（尤其是轨迹文件），一律让用户能直接点开定位：

- **绝对路径 + Markdown 链接**：`[说明](C:\...\file.jsonl)`。
  不要只写文件名、相对路径或网盘链接。
- **轨迹文件要给两份位置**，并写清哪份是哪份：
  - 原始 rollout：`~\.coding-agent-tasks\homes\<题号>-<A|B>\.codex\sessions\<年>\<月>\<日>\rollout-<时间>-<session>.jsonl`
  - 仓库副本：`tasks\<题号>\trajectories\<A|B>-<session>.jsonl`
- **顺带给所在目录**，方便在资源管理器里直接打开该文件夹。
- 报数字（行数、字节数）时放在路径旁边，方便一眼核对是不是同一份。
