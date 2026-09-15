# -*- coding: utf-8 -*-
"""导出 WorkBuddy 会话转录 (.jsonl) 为可读 HTML。只读操作，不修改任何源文件。"""
import json
import os
import html
from datetime import datetime

BASE = r"C:/Users/刘存安/.workbuddy/projects/d-0-DeskMove-0829 Banana＆seedream-0928 JIEYOU系列-8、我们的JIEYOU宇宙④trae pro"
OUT = r"D:/0-DeskMove/0829 Banana＆seedream/0928 JIEYOU系列/8、我们的JIEYOU宇宙④trae pro/artifacts/聊天记录导出_20260914.html"

# 会话标题映射（来自 workbuddy.db sessions 表 custom_title / title）
TITLES = {
    "0d00afc0-9195-4578-89e2-2ea23d329da5": "0829 Buddy再体验（将个人练习榜改为吉他练习榜）",
    "2261cea0-15e0-488c-a66f-f050aec4b791": "0911 新窗口②",
    "8e30315b-be32-4611-a314-5eef8c12918a": "0902 新窗口（用户隔离/云端配置排查）",
    "da6bc3ee-db9b-4ef0-966a-c35ea31d9a6e": "0914 新窗口③",
    "de53a856-fad2-45e8-b0ce-420d4493591b": "处理图片中显示的问题（当前会话）",
}


def clean_user_text(t: str) -> str:
    # 去掉系统注入块，只留真实用户输入
    if "<system-reminder" in t:
        parts = []
        for seg in t.split("<system-reminder"):
            idx = seg.find("</system-reminder>")
            seg2 = seg[idx + len("</system-reminder>"):] if idx != -1 else seg
            parts.append(seg2)
        t = "".join(parts)
    t = t.replace("<user_query>", "").replace("</user_query>", "")
    t = t.replace("<image_local_path>", "\n[图片路径: ").replace("</image_local_path>", "]\n")
    return t.strip()


def render_text_block(text: str) -> str:
    return "<p>" + html.escape(text).replace("\n", "<br/>") + "</p>"


def parse_session(path: str):
    events = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            events.append(obj)
    events.sort(key=lambda o: o.get("timestamp", 0) or 0)
    return events


def build_session_html(sid: str) -> str:
    path = os.path.join(BASE, sid + ".jsonl")
    if not os.path.exists(path):
        return ""
    events = parse_session(path)
    title = TITLES.get(sid, sid[:8])
    first_ts = None
    msg_count = 0
    tool_count = 0
    body = []

    for obj in events:
        ts = obj.get("timestamp")
        if ts and first_ts is None:
            first_ts = ts
        t = obj.get("type")
        if t == "message":
            role = obj.get("role", "?")
            msg_count += 1
            texts = []
            for c in obj.get("content", []):
                if isinstance(c, dict) and c.get("type") in ("input_text", "text"):
                    tx = c.get("text", "")
                    if tx:
                        texts.append(tx)
            full = "\n".join(texts)
            if role == "user":
                full = clean_user_text(full)
            if not full.strip():
                continue
            cls = "user" if role == "user" else "assistant"
            label = "存安" if role == "user" else "小柚"
            tstr = datetime.fromtimestamp(ts / 1000).strftime("%m-%d %H:%M") if ts else ""
            body.append(
                f'<div class="msg {cls}"><div class="meta"><span class="who">{label}</span>'
                f"<span class=\"time\">{tstr}</span></div>{render_text_block(full[:6000])}</div>"
            )
        elif t == "function_call":
            tool_count += 1
            name = obj.get("name") or obj.get("tool") or "tool"
            body.append(
                f'<details class="tool"><summary>🔧 工具调用 · {html.escape(str(name))}</summary></details>'
            )
        elif t == "reasoning":
            # 摘要一行，折叠
            s = obj.get("summary") or obj.get("text") or ""
            if isinstance(s, list):
                s = " ".join(str(x) for x in s)
            s = str(s)[:120]
            if s.strip():
                body.append(f'<details class="think"><summary>💭 思考</summary><p>{html.escape(s)}…</p></details>')

    tstr0 = datetime.fromtimestamp(first_ts / 1000).strftime("%Y-%m-%d %H:%M") if first_ts else "—"
    return f"""
<section class="session">
  <h2>{html.escape(title)}</h2>
  <p class="sid">会话 ID：<code>{sid}</code> ｜ 开始于 {tstr0} ｜ 消息 {msg_count} 条 · 工具调用 {tool_count} 次</p>
  {''.join(body) if body else '<p class="empty">（此会话无文本消息）</p>'}
</section>
"""


def main():
    css = """
    :root { --ink:#2b2620; --paper:#faf7f2; --card:#ffffff; --line:#e6dfd3;
            --user-bg:#f2ead9; --ai-bg:#eef3ee; --accent:#8a6d3b; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { background:var(--paper); color:var(--ink);
           font-family:"Noto Serif SC","Source Han Serif SC","SimSun",serif;
           line-height:1.75; padding:48px 16px; }
    .wrap { max-width:860px; margin:0 auto; }
    h1 { font-size:26px; letter-spacing:2px; margin-bottom:8px; }
    .sub { color:#7a6f5d; font-size:14px; margin-bottom:40px; }
    .session { background:var(--card); border:1px solid var(--line); border-radius:14px;
               padding:28px 30px; margin-bottom:36px; box-shadow:0 2px 10px rgba(60,45,20,.06);
               animation:fade .5s ease both; }
    @keyframes fade { from{opacity:0; transform:translateY(8px);} to{opacity:1; transform:none;} }
    .session h2 { font-size:20px; border-left:4px solid var(--accent); padding-left:12px; margin-bottom:6px; }
    .sid { font-size:12px; color:#9a8f7c; margin-bottom:20px; word-break:break-all; }
    .msg { border-radius:10px; padding:14px 18px; margin:14px 0; font-size:15px; }
    .msg.user { background:var(--user-bg); }
    .msg.assistant { background:var(--ai-bg); }
    .meta { font-size:12px; color:#8d8271; margin-bottom:6px; display:flex; gap:12px; }
    .who { font-weight:700; color:var(--accent); }
    .tool, .think { margin:8px 0 8px 24px; font-size:13px; color:#8a7f6c; }
    summary { cursor:pointer; }
    .empty { color:#b0a68f; text-align:center; padding:20px; }
    code { font-family:Consolas,monospace; font-size:11px; }
    """
    sids = [s for s in TITLES]
    parts = []
    for sid in sids:
        h = build_session_html(sid)
        if h:
            parts.append(h)
    doc = f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>JIEYOU 聊天记录导出 · 2026-09-14</title>
<style>{css}</style></head>
<body><div class="wrap">
<h1>JIEYOU 宇宙 · 聊天记录备份</h1>
<p class="sub">导出于 2026-09-14 19:55 ｜ 数据源：本地会话转录文件（完整无损） ｜ 仅供查阅，界面恢复后可继续在应用内使用</p>
{''.join(parts)}
</div></body></html>"""
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(doc)
    print("written:", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
