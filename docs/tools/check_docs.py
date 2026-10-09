#!/usr/bin/env python3
"""Check first-party documentation for broken local links, missing anchors,
duplicate HTML ids, unbalanced HTML tags and missing local assets.

Standard library only; makes no network requests (external http/https links are
counted, not fetched). Run from the repository root:

    python3 docs/tools/check_docs.py              # report on every doc
    python3 docs/tools/check_docs.py --strict     # exit 1 if any CURRENT guide has an error

"Current guides" are listed in CURRENT below; historical evidence (audit
folders, raw logs) is reported but does not fail --strict, because its original
links are preserved as recorded.
Private review guides are checked when available locally; a public clone does
not require those unpublished records.
"""

from __future__ import annotations

import argparse
import html
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
SKIP_DIRS = {"node_modules", ".git", ".claude", ".pytest_cache", ".ruff_cache", "__pycache__", "evidence",
             "evidence-after-fixes", "independent-verification", "android", "ios"}
CURRENT = {
    "docs/VOICE_INVENTORY_AND_ORDER_DRAFTS.md", "docs/VOICE_INVENTORY_AND_ORDER_DRAFTS.html",
    "README.md", "CAREKOSH_DEVELOPER_GUIDE.md", "CAREKOSH_ROADMAP.md",
    "carekosh_architecture_diagrams.html", "CAREKOSH_BACKEND_INTERVIEW_GUIDE.html",
    "CAREKOSH_E2E_VERIFICATION_GUIDE.html", "CAREKOSH_ENVIRONMENT_ARCHITECTURE.html",
    "CAREKOSH_BUILD_DEPLOY_FLOW.html", "CAREKOSH_DEPLOYMENT_STRATEGY.html",
    "docs/INDEX.html", "docs/NEW_DEVELOPER_QUICKSTART.md", "docs/CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md",
    "docs/CAREKOSH_COMPLETE_DEVELOPER_GUIDE.html", "docs/API_TRACEABILITY.md", "docs/API_TRACEABILITY.html",
    "docs/local_testing_field_manual.html", "docs/DEVOPS_AND_ARCHITECTURE.md", "docs/VOICE_AGENT_SETUP.md",
    "docs/VOICE_OPTION_1_IMPLEMENTATION.md", "docs/BACKEND_HARDENING.md",
    "docs/diagrams/README.md", "docs/tools/README.md",
    "vitaltrack-backend/README.md", "vitaltrack-mobile/README.md",
}
PRIVATE_REVIEW_GUIDES = {
    "docs/documentation-audit-2026-10-07/README.md", "docs/documentation-audit-2026-10-07/README.html",
    "docs/documentation-audit-2026-10-07/COVERAGE_LEDGER.md", "docs/documentation-audit-2026-10-07/CORRECTIONS.md",
    "docs/documentation-audit-2026-10-07/SOURCE_OF_TRUTH.md", "docs/documentation-audit-2026-10-07/VERIFICATION.md",
    "docs/documentation-audit-2026-10-07/SOURCES.md",
}
CURRENT.update(name for name in PRIVATE_REVIEW_GUIDES if (ROOT / name).is_file())
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
# Elements whose end tag HTML lets authors omit; never reported as unclosed.
OPTIONAL_END = {"p", "li", "td", "th", "tr", "thead", "tbody", "tfoot", "dt", "dd", "option", "colgroup", "caption",
                "rt", "rp", "optgroup", "html", "head", "body"}


def github_slug(value: str) -> str:
    value = unicodedata.normalize("NFKC", html.unescape(re.sub(r"<[^>]+>", "", value))).strip().lower()
    value = re.sub(r"[`*_~]", lambda m: "_" if m.group(0) == "_" else "", value)
    value = re.sub(r"[^\w\- ]", "", value)
    return value.replace(" ", "-")


class HtmlScan(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.links: list[tuple[str, int]] = []
        self.stack: list[tuple[str, int]] = []
        self.problems: list[str] = []
        self.in_svg = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "svg":
            self.in_svg += 1
        for key in ("id", "name") if tag in {"a"} else ("id",):
            if a.get(key):
                self.ids.append(a[key])
        for key in ("href", "src"):
            if a.get(key) and tag not in {"use"}:
                self.links.append((a[key], self.getpos()[0]))
        if tag not in VOID and not self.in_svg:
            self.stack.append((tag, self.getpos()[0]))

    def handle_startendtag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids.append(a["id"])
        for key in ("href", "src"):
            if a.get(key):
                self.links.append((a[key], self.getpos()[0]))

    def handle_endtag(self, tag):
        if tag == "svg":
            self.in_svg = max(0, self.in_svg - 1)
            return
        if self.in_svg or tag in VOID:
            return
        if not any(t == tag for t, _ in self.stack):
            self.problems.append(f"line {self.getpos()[0]}: stray </{tag}>")
            return
        while self.stack:
            t, line = self.stack.pop()
            if t == tag:
                break
            if t not in OPTIONAL_END:
                self.problems.append(f"line {line}: <{t}> not closed before </{tag}> (line {self.getpos()[0]})")


def md_anchors(text: str) -> set[str]:
    anchors: set[str] = set()
    counts: Counter = Counter()
    in_fence = False
    for line in text.splitlines():
        if line.strip().startswith(("```", "~~~")):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        m = re.match(r"^(#{1,6})\s+(.*?)\s*(\{#([\w\-]+)\})?\s*#*\s*$", line)
        if m:
            if m.group(4):
                anchors.add(m.group(4))
            slug = github_slug(m.group(2))
            anchors.add(slug if counts[slug] == 0 else f"{slug}-{counts[slug]}")
            counts[slug] += 1
    anchors.update(re.findall(r'<a\s+(?:id|name)="([^"]+)"', text))
    anchors.update(re.findall(r'\bid="([^"]+)"', text))
    return anchors


def md_links(text: str) -> list[tuple[str, int]]:
    links = []
    in_fence = False
    for n, line in enumerate(text.splitlines(), 1):
        if line.strip().startswith(("```", "~~~")):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        stripped = re.sub(r"`[^`]*`", "", line)
        for m in re.finditer(r"!?\[[^\]]*\]\(\s*<?((?:[^()\s>]|\([^()\s]*\))+)>?(?:\s+\"[^\"]*\")?\s*\)", stripped):
            links.append((m.group(1), n))
        for m in re.finditer(r'(?:href|src)="([^"]+)"', stripped):
            links.append((m.group(1), n))
    return links


def collect() -> list[Path]:
    files = []
    for path in ROOT.rglob("*"):
        if any(part in SKIP_DIRS for part in path.relative_to(ROOT).parts):
            continue
        if path.suffix in {".md", ".html"} and path.is_file():
            files.append(path)
    return sorted(files)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--only-current", action="store_true", help="report only the current guides")
    args = parser.parse_args()

    files = collect()
    anchors: dict[Path, set[str]] = {}
    scans: dict[Path, HtmlScan] = {}
    for f in files:
        text = f.read_text(encoding="utf-8", errors="replace")
        if f.suffix == ".html":
            scan = HtmlScan()
            scan.feed(text)
            scans[f] = scan
            anchors[f] = set(scan.ids)
        else:
            anchors[f] = md_anchors(text)

    errors: dict[Path, list[str]] = defaultdict(list)
    external = Counter()
    for f in files:
        rel = f.relative_to(ROOT).as_posix()
        if args.only_current and rel not in CURRENT:
            continue
        text = f.read_text(encoding="utf-8", errors="replace")
        links = scans[f].links if f.suffix == ".html" else md_links(text)
        if f.suffix == ".html":
            dupes = [i for i, c in Counter(scans[f].ids).items() if c > 1]
            if dupes:
                errors[f].append(f"duplicate id(s): {', '.join(sorted(dupes)[:8])}")
            for problem in scans[f].problems[:10]:
                errors[f].append(f"html structure: {problem}")
        for href, line in links:
            href = html.unescape(href)
            parts = urlsplit(href)
            if parts.scheme in {"http", "https"}:
                external[rel] += 1
                continue
            if parts.scheme in {"mailto", "tel", "data", "javascript"} or href.startswith("{"):
                continue
            target = f if not parts.path else (f.parent / unquote(parts.path)).resolve()
            if parts.path and not target.exists():
                errors[f].append(f"line {line}: missing file {href}")
                continue
            frag = unquote(parts.fragment)
            if frag and target.suffix in {".md", ".html"} and target in anchors:
                if frag not in anchors[target] and frag.lower() not in anchors[target]:
                    errors[f].append(f"line {line}: missing anchor #{frag} in {target.relative_to(ROOT).as_posix()}")

    current_errors = 0
    for f in files:
        rel = f.relative_to(ROOT).as_posix()
        if args.only_current and rel not in CURRENT:
            continue
        tag = "CURRENT" if rel in CURRENT else "other"
        if errors.get(f):
            if tag == "CURRENT":
                current_errors += len(errors[f])
            print(f"[{tag}] {rel}: {len(errors[f])} problem(s)")
            for e in errors[f][:25]:
                print(f"    - {e}")
    checked = [f for f in files if not args.only_current or f.relative_to(ROOT).as_posix() in CURRENT]
    print(f"\nChecked {len(checked)} files; {sum(len(v) for v in errors.values())} problem(s) "
          f"({current_errors} in current guides); {sum(external.values())} external links not fetched.")
    missing_current = sorted(c for c in CURRENT if not (ROOT / c).exists())
    if missing_current:
        print("Current guides not found:", ", ".join(missing_current))
    return 1 if args.strict and (current_errors or missing_current) else 0


if __name__ == "__main__":
    raise SystemExit(main())
