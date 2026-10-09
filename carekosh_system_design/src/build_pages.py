#!/usr/bin/env python3
"""Finish the four system-design pages: shared fonts, inline diagrams and figure tools.

Run after build_diagrams.py:

    python3 carekosh_system_design/src/build_pages.py

For every page it
  * points the head at the shared Google Fonts stylesheet (Newsreader, STIX Two Text, JetBrains Mono),
  * replaces each diagram <img> (or a previously inlined diagram) with the current SVG from diagrams/,
    so the page's web fonts apply and the diagram can be enlarged,
  * adds a tools row under each figure ("Enlarge" is added by assets/carekosh.js, "Open the SVG" is a link),
  * sets the one italic word in each page title.

It is safe to run again: diagrams are found by their data-diagram attribute after the first run.
Only the pages in this folder are touched; nothing else is read except diagrams/*.svg.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DIAGRAMS = ROOT / "diagrams"

FONTS = ("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600"
         "&family=Newsreader:ital,opsz,wght@0,6..72,300..700;1,6..72,300..700"
         "&family=STIX+Two+Text:ital,wght@0,400..700;1,400..700&display=swap")

# The one italic, maroon word in each page title.
TITLE_WORD = {
    "01_system_overview_and_api_flows.html": "flows",
    "02_backend_fastapi_interview_guide.html": "interview",
    "03_developer_onboarding_guide.html": "onboarding",
    "04_environments_and_deployment.html": "deployment",
}

FIGURE = re.compile(r'(?P<open><figure class="diagram"[^>]*>)(?P<body>.*?)(?P<close>\s*</figure>)', re.S)
STANDALONE_FONTS = re.compile(r'<style data-fonts="standalone">.*?</style>\s*', re.S)


def svg_markup(name: str, occurrence: int) -> str:
    """The diagram's SVG, ready to sit inside a page. Ids get a suffix when a page shows it twice."""
    svg = (DIAGRAMS / f"{name}.svg").read_text(encoding="utf-8")
    svg = STANDALONE_FONTS.sub("", svg).strip()
    if occurrence > 1:
        suffix = f"-{occurrence}"
        ids = re.findall(r'\sid="([^"]+)"', svg)
        for old in sorted(set(ids), key=len, reverse=True):
            new = old + suffix
            svg = svg.replace(f'id="{old}"', f'id="{new}"').replace(f"url(#{old})", f"url(#{new})")
            svg = svg.replace(f'href="#{old}"', f'href="#{new}"')
            svg = re.sub(r'aria-labelledby="([^"]*)"',
                         lambda m: 'aria-labelledby="' + " ".join(new if t == old else t for t in m.group(1).split()) + '"',
                         svg)
    return svg


def rebuild_figure(match: re.Match, seen: dict[str, int], problems: list[str], page: str) -> str:
    body = match.group("body")
    found = re.search(r'data-diagram="([^"]+)"', body) or re.search(r'src="diagrams/([^"/]+)\.svg"', body)
    if not found:
        return match.group(0)  # not a generated diagram; leave it alone
    name = found.group(1)
    if not (DIAGRAMS / f"{name}.svg").exists():
        problems.append(f"{page}: diagrams/{name}.svg is missing")
        return match.group(0)
    seen[name] = seen.get(name, 0) + 1
    frame_class = re.search(r'<div class="(frame[^"]*)"', body)
    frame_class = frame_class.group(1) if frame_class else "frame wide"
    caption = re.search(r"<figcaption>.*?</figcaption>", body, re.S)
    caption = caption.group(0) if caption else ""
    # The old caption links are replaced by the tools row.
    caption = re.sub(r'\s*<a class="open-full"[^>]*>.*?</a>', "", caption, flags=re.S)
    caption = re.sub(r'\s*<span class="swipe">.*?</span>', "", caption, flags=re.S)
    indent = re.match(r"\s*", body).group(0) or "\n        "
    tools = (f'<div class="fig-tools"><a class="pill" href="diagrams/{name}.svg" target="_blank" rel="noopener">'
             f'Open the SVG</a><span class="swipe">Swipe sideways, or tap Enlarge</span></div>')
    frame = f'<div class="{frame_class}" data-diagram="{name}">\n{svg_markup(name, seen[name])}\n{indent.lstrip(chr(10))}</div>'
    parts = [frame, tools] + ([caption] if caption else [])
    return match.group("open") + indent + indent.join(parts) + match.group("close")


def build_page(path: Path, problems: list[str]) -> None:
    html = path.read_text(encoding="utf-8")
    original = html
    html = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com/css2\?[^"]*">',
                  f'<link rel="stylesheet" href="{FONTS}">', html, count=1)
    seen: dict[str, int] = {}
    html = FIGURE.sub(lambda m: rebuild_figure(m, seen, problems, path.name), html)
    word = TITLE_WORD.get(path.name)
    h1 = re.search(r"<h1>(.*?)</h1>", html, re.S)
    if word and h1 and "<em>" not in h1.group(1):
        title = re.sub(rf"\b{re.escape(word)}\b", f"<em>{word}</em>", h1.group(1), count=1)
        html = html[:h1.start(1)] + title + html[h1.end(1):]
    left = re.findall(r'<img src="diagrams/[^"]+"', html)
    if left:
        problems.append(f"{path.name}: {len(left)} diagram image(s) not inlined")
    if html != original:
        path.write_text(html, encoding="utf-8")
    print(f"{path.name}: {sum(seen.values())} diagrams inlined ({', '.join(sorted(seen))})")


def main(names: list[str]) -> int:
    pages = [ROOT / n for n in names] if names else sorted(ROOT.glob("0[1-4]_*.html"))
    problems: list[str] = []
    for page in pages:
        build_page(page, problems)
    for p in problems:
        print("PROBLEM:", p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
