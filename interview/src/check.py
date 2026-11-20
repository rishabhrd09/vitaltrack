#!/usr/bin/env python3
"""Acceptance checks for the three interview books and Deployment Atlas links (run after build.py).

    python3 interview/src/check.py

Checks: duplicate ids, internal and cross-book anchors, balanced tags, forbidden strings
(private-finding details, private folders, secret-looking values), stale numbers, and
source links, and the share of long sentences in the prose. Standard library only.
"""

from __future__ import annotations

import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

OUT = Path(__file__).resolve().parent.parent
BOOKS = ["interviewpreparation.html", "backendfastapi.html", "authsecurity.html"]
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
        "path", "circle", "rect", "line", "polyline", "polygon", "ellipse", "stop", "use"}
FORBIDDEN = [
    "cf-connecting-ip", "x-forwarded-for", "forwarded-for", "get_real_client_ip", "core-documentation-audit",
    "backend-audit", "api-voice-audit", "f-4", "xkeysib-", "xsmtpsib-", "gsk_", "begin private key",
    "-----begin", "sk_live", "neondb_owner", "npg_",
]
STALE = [r"\b242 (backend )?tests", r"\b121 mobile", r"\b11 (application )?tables", r"47 routes in total",
         r"head <code>0010", r"python-jose 3\.3", r"44 under",
         r"\b(?:47|50) (?:HTTP operations|versioned routes|routes under)",
         r"\b640 backend tests", r"\b390 (?:mobile|Android) tests", r"FastAPI 0\.115\.6"]
ALLOWED_EMAIL = {"alex@example.com", "noreply@carekosh.com", "support@carekosh.com"}


class Scan(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.hrefs: list[str] = []
        self.stack: list[tuple[str, int]] = []
        self.errors: list[str] = []
        self.prose: list[str] = []
        self.skip = 0
        self.buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids.append(a["id"])
        if tag == "a" and a.get("href"):
            self.hrefs.append(a["href"])
        if tag in ("svg", "pre", "script", "style", "code", "summary"):
            self.skip += 1
        if tag in ("p", "li", "td", "dd") and not self.skip:
            self.buf = []
        if tag not in VOID:
            self.stack.append((tag, self.getpos()[0]))

    def handle_startendtag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids.append(a["id"])

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if tag in ("svg", "pre", "script", "style", "code", "summary"):
            self.skip = max(0, self.skip - 1)
        if tag in ("p", "li", "td", "dd") and not self.skip and self.buf:
            self.prose.append(" ".join(self.buf))
            self.buf = []
        if not self.stack:
            self.errors.append(f"stray </{tag}> at line {self.getpos()[0]}")
            return
        if self.stack[-1][0] == tag:
            self.stack.pop()
            return
        names = [t for t, _ in self.stack]
        if tag in names:
            while self.stack and self.stack[-1][0] != tag:
                t, line = self.stack.pop()
                if t not in ("p", "li", "td", "th", "tr", "dt", "dd"):
                    self.errors.append(f"unclosed <{t}> from line {line}")
            self.stack.pop()
        else:
            self.errors.append(f"unexpected </{tag}> at line {self.getpos()[0]}")

    def handle_data(self, data):
        if not self.skip:
            self.buf.append(data)


def sentences(texts: list[str]) -> list[str]:
    out = []
    for t in texts:
        t = re.sub(r"\s+", " ", t).strip()
        for s in re.split(r"(?<=[.!?])\s+(?=[A-Z\"“(])", t):
            if len(s.split()) >= 3:
                out.append(s)
    return out


def main() -> int:
    problems: list[str] = []
    scans = {}
    for name in BOOKS:
        text = (OUT / name).read_text(encoding="utf-8")
        scan = Scan()
        scan.feed(text)
        scans[name] = (scan, text)
        dup = {i for i in scan.ids if scan.ids.count(i) > 1}
        if dup:
            problems.append(f"{name}: duplicate ids {sorted(dup)[:8]}")
        for err in scan.errors[:10]:
            problems.append(f"{name}: {err}")
        for match in re.finditer(r'<div class="sub" id="([^"]+)"[^>]*>(.*?)(?=<div class="sub"|</section>)', text, re.S):
            if not re.search(r'Repository evidence · <a class="path" href="\.\./', match[2]):
                problems.append(f"{name}: chapter {match[1]} lacks its repository evidence links")
        lower = text.lower()
        for f in FORBIDDEN:
            if f in lower:
                problems.append(f"{name}: forbidden string '{f}'")
        for pat in STALE:
            if re.search(pat, text):
                problems.append(f"{name}: stale number pattern {pat}")
        for email in set(re.findall(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", re.sub(r"<svg.*?</svg>", "", text, flags=re.S))):
            if email.lower() not in ALLOWED_EMAIL and not email.lower().endswith("@2x.png"):
                problems.append(f"{name}: email-like text {email}")
    root = OUT.parent
    atlas = root / "docs/deployment/CAREKOSH_DEPLOYMENT_ATLAS.html"
    pages = {OUT / name: scan for name, (scan, _) in scans.items()}
    pages[atlas] = Scan()
    pages[atlas].feed(atlas.read_text(encoding="utf-8"))
    anchors = {path: set(scan.ids) for path, scan in pages.items()}
    for page, scan in pages.items():
        for href in sorted(set(scan.hrefs)):
            url = urlsplit(href)
            if url.scheme in ("https", "http", "mailto"):
                continue
            if url.scheme or url.netloc or url.path.startswith("/"):
                problems.append(f"{page.name}: link requires a specific host or filesystem: {href}")
                continue
            target = (page.parent / unquote(url.path)).resolve() if url.path else page
            if not target.is_relative_to(root) or not target.exists():
                problems.append(f"{page.name}: missing repository target {href}")
                continue
            if url.fragment and target.suffix.lower() in (".html", ".svg"):
                if target not in anchors:
                    linked = Scan()
                    linked.feed(target.read_text(encoding="utf-8"))
                    anchors[target] = set(linked.ids)
                if unquote(url.fragment) not in anchors[target]:
                    problems.append(f"{page.name}: missing section {href}")
    print("Book                         sentences  >30 words  share")
    for name, (scan, _) in scans.items():
        s = sentences(scan.prose)
        long_ = [x for x in s if len(x.split()) > 30]
        print(f"{name:28} {len(s):9}  {len(long_):9}  {100 * len(long_) / max(1, len(s)):5.1f}%")
    for p in problems:
        print("PROBLEM:", p)
    print(f"{len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
