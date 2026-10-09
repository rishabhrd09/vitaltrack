#!/usr/bin/env python3
"""Check the four system-design guides and their generated diagrams, offline.

Run from any directory. Uses only the standard library; never changes files or
opens a database. External links are counted, not fetched. Content accuracy
still requires comparing the explanations with code and official sources.
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree as ET

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REPO = ROOT.parent


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


docs = load_module("carekosh_documentation_scanner", REPO / "docs/tools/check_docs.py")
pages = load_module("carekosh_page_builder", HERE / "build_pages.py")


def main() -> int:
    problems: list[str] = []
    external_links = 0
    figures = 0
    files = sorted(ROOT.glob("*.html")) + sorted(ROOT.rglob("*.md"))
    diagrams = sorted((ROOT / "diagrams").glob("*.svg"))
    cache = {}

    def scan(path: Path):
        if path not in cache:
            value = path.read_text(encoding="utf-8")
            if path.suffix == ".html":
                parser = docs.HtmlScan()
                parser.feed(value)
                parser.close()
                cache[path] = (set(parser.ids), parser.links, parser)
            else:
                cache[path] = (docs.md_anchors(value), docs.md_links(value), None)
        return cache[path]

    for path in files:
        ids, links, parser = scan(path)
        label = str(path.relative_to(ROOT))
        if parser:
            for identity, count in Counter(parser.ids).items():
                if count > 1:
                    problems.append(f"{label}: duplicate id {identity}")
            problems.extend(f"{label}: {p}" for p in parser.problems)
            problems.extend(f"{label}: unclosed <{tag}> at {line}" for tag, line in parser.stack
                            if tag not in docs.OPTIONAL_END)
        for href, line in links:
            parts = urlsplit(href)
            if parts.scheme in {"http", "https"}:
                external_links += 1
                continue
            if parts.scheme or href.startswith("{"):
                continue
            target = (path.parent / unquote(parts.path)).resolve() if parts.path else path.resolve()
            if not target.exists():
                problems.append(f"{label}:{line}: missing target {href}")
            elif parts.fragment and target.suffix in {".md", ".html"}:
                target_ids, _, _ = scan(target)
                fragment = unquote(parts.fragment)
                if fragment not in target_ids and fragment.lower() not in target_ids:
                    problems.append(f"{label}:{line}: missing anchor {href}")
        if path.suffix == ".html":
            seen = Counter()
            for figure in pages.FIGURE.finditer(path.read_text(encoding="utf-8")):
                figures += 1
                body = figure.group("body")
                found = re.search(r'data-diagram="([^"]+)"', body)
                inline = re.search(r'<svg\b.*?</svg>', body, re.S)
                if not found or not inline:
                    problems.append(f"{label}: figure has no inline generated diagram")
                    continue
                name = found.group(1)
                seen[name] += 1
                if not (ROOT / "diagrams" / f"{name}.svg").is_file():
                    problems.append(f"{label}: missing SVG {name}")
                elif inline.group(0).strip() != pages.svg_markup(name, seen[name]).strip():
                    problems.append(f"{label}: stale inline SVG {name}")

    for path in diagrams:
        try:
            svg = ET.fromstring(path.read_text(encoding="utf-8"))
        except ET.ParseError as error:
            problems.append(f"{path.name}: invalid XML: {error}")
            continue
        counts = Counter(el.attrib["id"] for el in svg.iter() if "id" in el.attrib)
        for identity, count in counts.items():
            if count > 1:
                problems.append(f"{path.name}: duplicate id {identity}")
        for el in svg.iter():
            refs = el.attrib.get("aria-labelledby", "").split()
            for value in el.attrib.values():
                refs.extend(re.findall(r'url\(#([^)]*)\)', value))
            for identity in refs:
                if identity not in counts:
                    problems.append(f"{path.name}: missing SVG reference {identity}")

    print(json.dumps({"documents": len(files), "diagrams": len(diagrams), "inline_figures": figures,
                      "external_links_not_fetched": external_links, "problems": problems}, indent=2))
    return bool(problems)


if __name__ == "__main__":
    sys.exit(main())
