#!/usr/bin/env python3
"""Build browser-friendly HTML companions from the canonical Markdown guides.

The Markdown files are the single source of truth. The generated .html files are
never edited by hand; change the Markdown and re-run:

    uv run --no-project --with markdown==3.7 python docs/tools/build_docs.py

(Any Python 3.10+ with `markdown==3.7` installed works too. The tool is isolated
from the backend and mobile dependency manifests on purpose.)

Output features: table of contents, stable GitHub-style heading anchors, readable
line length, responsive tables and diagrams, dark mode, print styles, and
keyboard-accessible "Copy" buttons for code blocks. Everything is inline, so the
pages work offline when opened from disk.
"""

from __future__ import annotations

import html
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

import markdown
from markdown.extensions.toc import TocExtension

ROOT = Path(__file__).resolve().parents[2]

# canonical Markdown -> generated HTML (same folder, same stem)
GUIDES = [
    "docs/VOICE_INVENTORY_AND_ORDER_DRAFTS.md",
    "docs/CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md",
    "docs/API_TRACEABILITY.md",
]
# These records stay local; default builds also work from a public clone.
PRIVATE_REVIEW_GUIDES = ["docs/documentation-audit-2026-10-07/README.md"]
GUIDES.extend(name for name in PRIVATE_REVIEW_GUIDES if (ROOT / name).is_file())


def github_slug(value: str, separator: str = "-") -> str:
    """Match GitHub's heading anchors so links work on GitHub and in the HTML."""
    value = unicodedata.normalize("NFKC", html.unescape(re.sub(r"<[^>]+>", "", value))).strip().lower()
    value = re.sub(r"[^\w\- ]", "", value)
    return value.replace(" ", separator)


CSS = """
:root{--bg:#fbfaf7;--fg:#1d2328;--muted:#56606b;--card:#ffffff;--border:#d6dbe0;--accent:#0b5a73;
--accent-bg:#e5f1f5;--code-bg:#f1f3f5;--code-fg:#1d2328;--warn-bg:#fff4d6;--warn-border:#9a6a00;--mark:#fff1a8}
@media (prefers-color-scheme:dark){:root{--bg:#14181c;--fg:#e8ecef;--muted:#a9b3bc;--card:#1c2228;--border:#36404a;
--accent:#7cc7df;--accent-bg:#17303a;--code-bg:#0f1316;--code-fg:#e8ecef;--warn-bg:#3a2f12;--warn-border:#d9a93a;--mark:#5b4e10}}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.65 -apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
a{color:var(--accent);text-underline-offset:3px}a:focus-visible,button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.skip{position:absolute;left:-999px;top:0}.skip:focus{left:12px;top:12px;background:var(--card);padding:8px 12px;z-index:9}
header.site{border-bottom:1px solid var(--border);background:var(--card)}
header.site .inner{max-width:1180px;margin:auto;padding:14px 20px;display:flex;gap:18px;flex-wrap:wrap;align-items:center;min-width:0}
header.site .meta{min-width:0;overflow-wrap:anywhere}
header.site .brand{font-weight:700}
.layout{max-width:1180px;margin:auto;padding:0 20px;display:grid;grid-template-columns:270px minmax(0,1fr);gap:36px}
nav.toc{position:sticky;top:0;align-self:start;max-height:100vh;overflow:auto;padding:24px 0;font-size:14.5px;line-height:1.45}
nav.toc summary{font-weight:700;cursor:pointer;margin-bottom:8px}nav.toc ul{list-style:none;padding-left:0;margin:0}nav.toc ul ul{padding-left:14px}nav.toc li{margin:5px 0}
nav.toc a{color:var(--fg);text-decoration:none}nav.toc a:hover{text-decoration:underline}
main{min-width:0;padding:28px 0 80px;max-width:78ch;overflow-wrap:break-word}
:not(pre)>code{overflow-wrap:anywhere;word-break:break-word}
h1{font-size:clamp(1.9rem,4vw,2.6rem);line-height:1.15;margin:.2em 0 .4em}
h2{font-size:1.6rem;margin-top:2.6rem;padding-top:.6rem;border-top:1px solid var(--border)}
h3{font-size:1.25rem;margin-top:2rem}h4{font-size:1.05rem;margin-top:1.6rem}
h2,h3,h4{scroll-margin-top:12px}.anchor{margin-left:.35em;font-size:.8em;text-decoration:none;opacity:.45}
.anchor:hover,.anchor:focus{opacity:1}
blockquote{margin:1.2em 0;padding:.6em 1.1em;border-left:4px solid var(--warn-border);background:var(--warn-bg)}
blockquote p{margin:.4em 0}
code{font:0.9em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--code-bg);padding:.1em .3em;border-radius:4px}
.codewrap{position:relative;margin:1.1em 0}
pre{background:var(--code-bg);color:var(--code-fg);border:1px solid var(--border);border-radius:8px;padding:14px 16px;overflow:auto;line-height:1.5}
pre code{background:none;padding:0;font-size:.86em}
button.copy{position:absolute;top:8px;right:8px;font:600 12.5px system-ui,sans-serif;padding:4px 10px;border-radius:6px;
border:1px solid var(--border);background:var(--card);color:var(--fg);cursor:pointer}
.tablewrap{overflow-x:auto;margin:1.1em 0;border:1px solid var(--border);border-radius:8px}
table{border-collapse:collapse;width:100%;font-size:.94em;background:var(--card)}
th,td{border-bottom:1px solid var(--border);padding:9px 11px;text-align:left;vertical-align:top}
th{background:var(--accent-bg);position:sticky;top:0}
figure.diagram{margin:1.6em 0}figure.diagram .scroll{overflow-x:auto;border:1px solid var(--border);border-radius:10px;background:#fff}
figure.diagram img{display:block;width:100%;min-width:680px;height:auto}
figcaption{font-size:.92em;color:var(--muted);margin-top:.5em}
.meta{color:var(--muted);font-size:.92em}
footer{color:var(--muted);font-size:.9em;border-top:1px solid var(--border);margin-top:3rem;padding-top:1rem}
@media (max-width:900px){.layout{grid-template-columns:1fr}nav.toc{position:static;max-height:none;border-bottom:1px solid var(--border)}
main{max-width:none}}
@media print{header.site,nav.toc,button.copy,.skip,.anchor{display:none!important}body{background:#fff;color:#000;font-size:11.5pt}
.layout{display:block;max-width:none;padding:0}main{max-width:none;padding:0}a{color:#000}
pre{white-space:pre-wrap;border:1px solid #999}.tablewrap{overflow:visible;border:none}th{position:static}
figure.diagram img{min-width:0}h2{break-before:auto;break-after:avoid}h3,h4{break-after:avoid}pre,figure,tr{break-inside:avoid}}
"""

SCRIPT = """
var tocDetails = document.getElementById('toc-details');
if (tocDetails && window.matchMedia('(min-width: 901px)').matches) { tocDetails.open = true; }
document.querySelectorAll('pre > code').forEach(function (code) {
  var pre = code.parentElement, wrap = document.createElement('div');
  wrap.className = 'codewrap'; pre.parentNode.insertBefore(wrap, pre); wrap.appendChild(pre);
  var b = document.createElement('button'); b.type = 'button'; b.className = 'copy'; b.textContent = 'Copy';
  b.setAttribute('aria-label', 'Copy this code block');
  b.addEventListener('click', function () {
    var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1600); };
    if (navigator.clipboard) { navigator.clipboard.writeText(code.innerText).then(done, function () { b.textContent = 'Select and copy'; }); }
    else { b.textContent = 'Select and copy'; }
  });
  wrap.appendChild(b);
});
"""


def toc_html(tokens: list[dict], depth: int = 0) -> str:
    if not tokens:
        return ""
    items = []
    for token in tokens:
        if token["level"] > 3 or token["name"].strip().lower() == "contents":
            continue
        children = toc_html(token.get("children", []), depth + 1)
        items.append(f'<li><a href="#{token["id"]}">{token["name"]}</a>{children}</li>')
    return f"<ul>{''.join(items)}</ul>" if items else ""


def postprocess(body: str, source: Path, generated: set[Path]) -> str:
    # Diagrams: <p><img alt title></p> -> accessible, horizontally scrollable figure.
    def figure(match: re.Match) -> str:
        tag = match.group(1)
        caption = re.search(r'title="([^"]*)"', tag)
        tag = re.sub(r'\s*title="[^"]*"', "", tag)
        tag = tag.replace("<img ", '<img loading="lazy" ', 1)
        cap = f"<figcaption>{caption.group(1)}</figcaption>" if caption else ""
        return f'<figure class="diagram"><div class="scroll">{tag}</div>{cap}</figure>'

    body = re.sub(r"<p>(<img [^>]+>)</p>", figure, body)
    body = re.sub(r"<table>", '<div class="tablewrap"><table>', body)
    body = body.replace("</table>", "</table></div>")
    # Heading permalinks.
    body = re.sub(r'<(h[234]) id="([^"]+)">(.*?)</\1>',
                  lambda m: f'<{m.group(1)} id="{m.group(2)}">{m.group(3)}<a class="anchor" href="#{m.group(2)}" '
                            f'aria-label="Link to this section">#</a></{m.group(1)}>', body)

    # Links to other canonical Markdown guides point at their generated HTML.
    def relink(match: re.Match) -> str:
        href = match.group(1)
        if href.startswith(("http:", "https:", "#", "mailto:")):
            return match.group(0)
        path, _, frag = href.partition("#")
        if path.endswith(".md"):
            target = (source.parent / path).resolve()
            if target in generated:
                new = path[:-3] + ".html" + (f"#{frag}" if frag else "")
                return f'href="{new}"'
        return match.group(0)

    return re.sub(r'href="([^"]+)"', relink, body)


def build(rel: str, generated: set[Path]) -> Path:
    source = ROOT / rel
    text = source.read_text(encoding="utf-8")
    md = markdown.Markdown(extensions=[
        "extra", "sane_lists",
        TocExtension(slugify=github_slug, toc_depth="2-4", permalink=False),
    ])
    body = md.convert(text)
    title_match = re.search(r"^# (.+)$", text, re.M)
    title = re.sub(r"[`*_]", "", title_match.group(1)) if title_match else source.stem
    toc = toc_html(md.toc_tokens[0]["children"] if md.toc_tokens and md.toc_tokens[0]["level"] == 1 else md.toc_tokens)
    body = postprocess(body, source, generated)
    home = Path("../" * (len(Path(rel).parts) - 2) + "INDEX.html").as_posix() if rel.startswith("docs/") else "docs/INDEX.html"
    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="docs/tools/build_docs.py from {html.escape(rel)}">
<title>{html.escape(title)}</title>
<style>{CSS}</style>
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="site"><div class="inner"><span class="brand">CareKosh docs</span>
<a href="{home}">Documentation home</a>
<span class="meta">Generated from <code>{html.escape(rel)}</code> — edit the Markdown, not this file.</span></div></header>
<div class="layout">
<nav class="toc" aria-label="Table of contents"><details id="toc-details"><summary>Contents</summary>{toc}</details></nav>
<main id="content">
{body}
<footer>Generated {date.today().isoformat()} by <code>docs/tools/build_docs.py</code> from <code>{html.escape(rel)}</code>.</footer>
</main>
</div>
<script>{SCRIPT}</script>
</body>
</html>
"""
    out = source.with_suffix(".html")
    out.write_text(page, encoding="utf-8")
    return out


def main(argv: list[str]) -> int:
    targets = argv or GUIDES
    generated = {(ROOT / g).resolve() for g in GUIDES}
    for rel in targets:
        out = build(rel, generated)
        print("built", out.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
