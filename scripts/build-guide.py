"""Render the project guide with only the Python standard library."""

from pathlib import Path
import html, re

root = Path(__file__).resolve().parents[1]


def inline(text):
    escaped = html.escape(text)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    return re.sub(r"\[([^\]]+)\]\((https://[^ )]+)\)", r'<a href="\2">\1</a>', escaped)


def render(source):
    lines = source.splitlines()
    parts = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith("```"):
            block = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                block.append(lines[i])
                i += 1
            parts.append(
                "<pre><code>" + html.escape("\n".join(block)) + "</code></pre>"
            )
            i += 1
            continue
        if line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                if not re.match(r"^\|\s*-", lines[i]):
                    rows.append(
                        [inline(c.strip()) for c in lines[i].strip("|").split("|")]
                    )
                i += 1
            parts.append(
                '<div class="table-wrap"><table><thead><tr>'
                + "".join("<th>" + c + "</th>" for c in rows[0])
                + "</tr></thead><tbody>"
                + "".join(
                    "<tr>" + "".join("<td>" + c + "</td>" for c in row) + "</tr>"
                    for row in rows[1:]
                )
                + "</tbody></table></div>"
            )
            continue
        if line.startswith("#"):
            level = len(line) - len(line.lstrip("#"))
            parts.append(f"<h{level}>" + inline(line[level:].strip()) + f"</h{level}>")
            i += 1
            continue
        if re.match(r"^(- |\d+\. )", line):
            ordered = line[0].isdigit()
            tag = "ol" if ordered else "ul"
            items = []
            while i < len(lines) and re.match(
                r"^(\d+\. )" if ordered else r"^- ", lines[i]
            ):
                items.append(
                    "<li>" + inline(re.sub(r"^(- |\d+\. )", "", lines[i])) + "</li>"
                )
                i += 1
            parts.append("<" + tag + ">" + "".join(items) + "</" + tag + ">")
            continue
        parts.append("<p>" + inline(line) + "</p>")
        i += 1
    return "".join(parts)


style = """body{margin:0;background:#0a131b;color:#e7eef2;font-family:system-ui,"PingFang SC",sans-serif;font-size:17px;line-height:1.85}main{max-width:900px;margin:48px auto;padding:0 28px 60px}nav{display:flex;gap:24px;flex-wrap:wrap;font-size:15px}a{color:#dcff71}h1{font-size:36px;line-height:1.35;margin:32px 0 14px}h2{font-size:24px;line-height:1.5;margin-top:46px;color:#dcff71}p,li{color:#c5d4de}li{margin:8px 0}pre{overflow:auto;background:#111f29;border:1px solid #30404c;border-radius:10px;padding:22px;font-size:14px;line-height:1.8}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:15px}th,td{text-align:left;padding:12px;border-bottom:1px solid #30404c;vertical-align:top}th{color:#dcff71}td:first-child{white-space:nowrap}footer{margin-top:42px;padding-top:20px;border-top:1px solid #30404c;font-size:14px;color:#94a6b3}@media(max-width:600px){main{margin:24px auto;padding-inline:20px}h1{font-size:28px}h2{font-size:22px}td:first-child{white-space:normal}pre{padding:15px}}@media print{body{background:white;color:#111;font-size:11pt}main{margin:0;max-width:none;padding:0}nav{display:none}h1{font-size:22pt}h2{font-size:16pt;color:#111;break-after:avoid}p,li,th,td,footer{color:#222}pre{background:#f5f5f5;color:#111;border-color:#ccc;white-space:pre-wrap}table{font-size:10pt}a{color:#222}tr,pre{break-inside:avoid}}"""
for language, name, title, back, download, notes, other, footer in [
    (
        "zh-CN",
        "",
        "果蝇神经回路如何参与驾驶",
        "← 返回驾驶实验",
        "下载文档（Markdown）",
        "数据与模型细节",
        '<a href="driving-guide.en.html" lang="en">English</a>',
        "可使用浏览器打印功能保存为 PDF。",
    ),
    (
        "en",
        ".en",
        "How fly neural circuits participate in driving",
        "← Back to driving",
        "Download guide (Markdown)",
        "Data and model notes",
        '<a href="driving-guide.html" lang="zh-CN">中文</a>',
        "Use your browser’s Print command to save a PDF.",
    ),
]:
    source = (
        root / ("docs/driving-guide.en.md" if name else "docs/驾驶原理.md")
    ).read_text()
    home = "en.html" if name else "./"
    page = (
        f'<!doctype html><html lang="{language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title} · Flybrain Drive</title><style>'
        + style
        + f'</style></head><body><main><nav><a href="{home}">{back}</a><a href="driving-guide{name}.md" download>{download}</a><a href="model-notes{name}.html">{notes}</a>{other}</nav>'
        + render(source)
        + f"<footer>Flybrain Drive · {footer}</footer></main></body></html>"
    )
    (root / f"dist/driving-guide{name}.html").write_text(page)
    (root / f"dist/driving-guide{name}.md").write_text(source)
