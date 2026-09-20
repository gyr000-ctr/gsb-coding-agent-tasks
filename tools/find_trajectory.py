"""按 SessionID 在本机定位轨迹文件（Codex / Claude Code）。

用法:
    python tools/find_trajectory.py <SessionID>
    python tools/find_trajectory.py <SessionID> --json

Codex:   ~/.codex/sessions/YYYY/MM/DD/rollout-<时间>-<session-id>.jsonl
Claude:  ~/.claude/projects/<项目 slug>/<session-id>.jsonl

跑题可能用单独的 CODEX_HOME（例如 ~/.codex-cli），所以除了默认目录，
还会顺带扫 $CODEX_HOME 和家目录下所有 .codex* 目录。
"""

import argparse
import glob
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HOME = os.path.expanduser("~")
CODEX_ROOT = os.path.join(HOME, ".codex", "sessions")
CLAUDE_ROOT = os.path.join(HOME, ".claude", "projects")


def codex_roots():
    """默认 ~/.codex/sessions，外加 $CODEX_HOME/sessions 与家目录下所有 .codex*/sessions。"""
    roots = [CODEX_ROOT]
    extra = os.environ.get("CODEX_HOME")
    if extra:
        roots.append(os.path.join(extra, "sessions"))
    roots.extend(sorted(glob.glob(os.path.join(HOME, ".codex*", "sessions"))))
    # Windows 的隔离布局：~/.codex-cli/.codex/sessions（HOME 的下一级才是 CODEX_HOME）
    roots.extend(sorted(glob.glob(os.path.join(HOME, ".codex*", ".codex", "sessions"))))
    seen, out = set(), []
    for root in roots:
        key = os.path.normcase(os.path.abspath(root))
        if key in seen or not os.path.isdir(root):
            continue
        seen.add(key)
        out.append(root)
    return out


def by_filename(root, session_id):
    hits = []
    if not os.path.isdir(root):
        return hits
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            if session_id in name and name.endswith(".jsonl"):
                hits.append(os.path.join(dirpath, name))
    return hits


def by_content(root, session_id, limit=400):
    """回退方案：SessionID 只出现在文件内容里时，扫描最近的 jsonl。"""
    if not os.path.isdir(root):
        return []
    candidates = []
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            if name.endswith(".jsonl"):
                path = os.path.join(dirpath, name)
                candidates.append((os.path.getmtime(path), path))
    candidates.sort(reverse=True)
    hits = []
    for _mtime, path in candidates[:limit]:
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                for _ in range(40):
                    line = fh.readline()
                    if not line:
                        break
                    if session_id in line:
                        hits.append(path)
                        break
        except OSError:
            continue
    return hits


def find(session_id):
    search = [(root, "codex") for root in codex_roots()] + [(CLAUDE_ROOT, "claude")]
    found = []
    # 先在所有根目录里按文件名找（文件名里的 SessionID 就是这一轮的，最可靠）
    for root, kind in search:
        for path in by_filename(root, session_id):
            found.append({"kind": kind, "path": path, "match": "filename"})
    if found:
        return found
    # 文件名里都没有，才退回扫内容。注意内容匹配可能命中"别的会话里提到过这个 ID"
    # 的文件（比如主持人在桌面版里念了一遍 SessionID），所以只能当兜底。
    for root, kind in search:
        for path in by_content(root, session_id):
            found.append({"kind": kind, "path": path, "match": "content"})
    return found


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("session_id")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    hits = find(args.session_id)
    if args.json:
        print(json.dumps({"session_id": args.session_id, "hits": hits}, ensure_ascii=False, indent=2))
        return 0 if hits else 1

    if not hits:
        print(f"没找到 SessionID {args.session_id} 对应的轨迹文件")
        for root in codex_roots():
            print(f"已搜索: {root}")
        print(f"已搜索: {CLAUDE_ROOT}")
        print("提示：如果这次跑在另一台机器上，把那边的 "
              "~/.codex/sessions/.../rollout-*.jsonl 拷到 tasks/<题号>/trajectories/ 即可。")
        return 1

    for hit in hits:
        size = os.path.getsize(hit["path"])
        print(f"[{hit['kind']}/{hit['match']}] {hit['path']}  ({size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
