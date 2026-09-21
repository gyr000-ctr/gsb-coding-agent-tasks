"""读原始 rollout，抠出提交前要核验的事实。

轨迹文件现在是**原样上交**（codex CLI 自己写的那份 jsonl，一字不改），
所以不再有清洗这一步。但原始文件里混着 harness 注入的内容，直接看很难核对，
这个模块负责把关键事实拆出来：

- 这次跑在哪个工作区（`cwd`）—— 用来判断这条轨迹到底属于 A 还是 B
- 用的哪个模型、上下文窗口多大（项目要求必须是 1000000）
- harness 往这轮里塞了多少内容（技能清单 / 权限 / 环境上下文）
- 真正的 prompt 原文（去掉 harness 段），用来和 tasks/<题号>/prompt.md 比对

这些事实会存进 meta.json，作为「两次跑同一起点」的证据。
"""

import hashlib
import json
import os


# 注入进 user / developer 消息的 harness 块：这些不是用户写的话
HARNESS_PREFIXES = (
    "<environment_context>",
    "<skills_instructions>",
    "<permissions instructions>",
    "<user_instructions>",
    "<multi_agent_mode>",
    "<collaboration_mode",
    "<apps_instructions",
    "<app-context>",
    "# AGENTS.md",
    "# AGENTS.md instructions",
)


def read_lines(path):
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        return fh.readlines()


def normalize(text):
    return (text or "").replace("\r\n", "\n").replace("\r", "\n").strip()


def sha256_text(text):
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def is_harness_text(text):
    stripped = (text or "").lstrip("\ufeff \t\r\n")
    return any(stripped.startswith(prefix) for prefix in HARNESS_PREFIXES)


def split_user_item(payload):
    """一条 user 消息里可能混着 harness 段（环境上下文）和真正的 prompt。

    返回 (真正的用户内容, 丢掉的段数)。
    """
    content = payload.get("content") or []
    kept, dropped = [], 0
    for part in content:
        text = part.get("text", "") if isinstance(part, dict) else ""
        if is_harness_text(text):
            dropped += 1
            continue
        kept.append(part)
    return kept, dropped


def _field(text, tag):
    """从 harness 注入的块里抠出一个 <tag>值</tag>。"""
    start = text.find(f"<{tag}>")
    if start < 0:
        return ""
    start += len(tag) + 2
    end = text.find(f"</{tag}>", start)
    return text[start:end].strip() if end > start else ""


def iter_records(lines):
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            continue


def prompt_text(lines):
    """轨迹里的 prompt 原文（首条 user 消息里去掉 harness 段的部分）。"""
    for record in iter_records(lines):
        payload = record.get("payload") or {}
        if (record.get("type") == "response_item" and payload.get("type") == "message"
                and payload.get("role") == "user"):
            kept, _dropped = split_user_item(payload)
            text = "".join(part.get("text", "") for part in kept)
            if text.strip():
                return text
    return ""


def rollout_evidence(path):
    """把原始 rollout 里、核验提交时要看的事实整理成一个 dict。"""
    evidence = {
        "session_id": "",
        "cwd": "",
        "current_date": "",
        "timezone": "",
        "model": "",
        "model_provider": "",
        "cli_version": "",
        "originator": "",
        "model_context_window": None,
        "approval_policy": "",
        "sandbox_mode": "",
        "raw_lines": 0,
        "raw_bytes": 0,
        "raw_sha256": "",
        "harness_chars": 0,
        "harness_parts": {},
        "prompt_sha256": "",
        "prompt_chars": 0,
    }
    if not path or not os.path.isfile(path):
        return evidence

    lines = read_lines(path)
    evidence["raw_lines"] = len([l for l in lines if l.strip()])
    evidence["raw_bytes"] = os.path.getsize(path)
    with open(path, "rb") as fh:
        evidence["raw_sha256"] = hashlib.sha256(fh.read()).hexdigest()
    prompt_parts = []

    for record in iter_records(lines):
        rtype = record.get("type")
        payload = record.get("payload") or {}

        if rtype == "session_meta":
            evidence["session_id"] = evidence["session_id"] or payload.get("session_id", "")
            evidence["cwd"] = evidence["cwd"] or payload.get("cwd", "")
            evidence["cli_version"] = payload.get("cli_version") or evidence["cli_version"]
            evidence["originator"] = payload.get("originator") or evidence["originator"]
            evidence["model_provider"] = payload.get("model_provider") or evidence["model_provider"]
            continue

        if rtype == "turn_context":
            evidence["model"] = payload.get("model") or evidence["model"]
            evidence["cwd"] = evidence["cwd"] or payload.get("cwd", "")
            evidence["current_date"] = payload.get("current_date") or evidence["current_date"]
            evidence["timezone"] = payload.get("timezone") or evidence["timezone"]
            evidence["approval_policy"] = payload.get("approval_policy") or evidence["approval_policy"]
            sandbox = payload.get("sandbox_policy") or {}
            if isinstance(sandbox, dict):
                evidence["sandbox_mode"] = sandbox.get("type") or evidence["sandbox_mode"]
            continue

        if rtype == "event_msg":
            # 上下文窗口只写在这种事件里，轨迹原样交也是能查的，这里顺手记一份
            if payload.get("type") == "task_started" and isinstance(
                payload.get("model_context_window"), int
            ):
                evidence["model_context_window"] = payload["model_context_window"]
            continue

        if rtype != "response_item" or payload.get("type") != "message":
            continue

        role = payload.get("role")
        parts = [p for p in (payload.get("content") or []) if isinstance(p, dict)]
        if role == "developer":
            for part in parts:
                block = (part.get("text") or "").lstrip("\ufeff \t\r\n")
                name = block.split(">", 1)[0][1:] if block.startswith("<") else "other"
                key = name.split()[0] if name else "other"
                evidence["harness_parts"][key] = evidence["harness_parts"].get(key, 0) + len(block)
                evidence["harness_chars"] += len(block)
            continue
        if role == "user":
            for part in parts:
                block = part.get("text", "")
                if is_harness_text(block):
                    evidence["harness_parts"]["environment_context"] = (
                        evidence["harness_parts"].get("environment_context", 0) + len(block)
                    )
                    evidence["harness_chars"] += len(block)
                    for tag in ("cwd", "current_date", "timezone"):
                        value = _field(block, tag)
                        if value and not evidence[tag]:
                            evidence[tag] = value
                    continue
                if block:
                    prompt_parts.append(block)

    prompt = "\n".join(prompt_parts)
    evidence["prompt_sha256"] = sha256_text(normalize(prompt)) if prompt else ""
    evidence["prompt_chars"] = len(prompt)
    return evidence
