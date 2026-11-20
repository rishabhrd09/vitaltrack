#!/usr/bin/env python3
"""Build the three CareKosh interview books.

    python3 interview/src/build.py

Reads
  * interview/src/content/b{1,2,3}_*.html   chapter fragments (sorted by name) with the macros below
  * interview/src/content/*.qa              question banks
  * interview/src/diagrams.py               new diagrams, drawn with carekosh_system_design/src/paperkit.py
  * carekosh_system_design/diagrams/*.svg   reviewed diagrams that are reused (prefix "sd:")
  * docs/diagrams/*.svg                     current deployment, inventory and order figures
  * carekosh_system_design/assets/*         the shared design system, inlined
  * `git show BASELINE:<path>`              exact code excerpts and reference checks
Writes interview/interviewpreparation.html, interview/backendfastapi.html, interview/authsecurity.html.
Standard library only. Every book is self-contained: CSS, JavaScript and SVG are inline.

Macros inside fragments
  {{fig:NAME|caption}}         a numbered figure; NAME from diagrams.py, or sd:NAME for a reused diagram
  {{ev:code,test,docs,hist,plan,nv}}  evidence chips
  {{x:PATH:A-B|note}}          exact excerpt of lines A–B of PATH at the baseline commit
  {{p:PATH}}                   a checked file path;  {{s:PATH#NAME}} a checked symbol inside PATH
  {{qa:NAME}}                  the question bank interview/src/content/NAME.qa
  {{book:N#anchor|text}}       a link into another book
  <say>…</say> <follow>…</follow> <avoid>…</avoid> <limits>…</limits>  standard callouts
PATH may start with B/ (vitaltrack-backend/) or M/ (vitaltrack-mobile/); otherwise it is repository-relative.
"""

from __future__ import annotations

import html
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
ROOT = OUT.parent
SD = ROOT / "carekosh_system_design"
CONTENT = HERE / "content"
FACTS = json.loads((HERE / "facts.json").read_text(encoding="utf-8"))
BASELINE = FACTS["baseline"]
BASELINE_FULL = subprocess.check_output(["git", "rev-parse", BASELINE + "^{commit}"], cwd=ROOT, text=True).strip()
CHECKED = FACTS["checked"]

sys.path.insert(0, str(SD / "src"))
sys.path.insert(0, str(HERE))
sys.dont_write_bytecode = True  # keep __pycache__ out of this folder and the shared toolkit
import diagrams  # noqa: E402

PREFIX = {"B/": "vitaltrack-backend/", "M/": "vitaltrack-mobile/"}
FONTS = ("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600"
         "&family=Newsreader:ital,opsz,wght@0,6..72,300..700;1,6..72,300..700"
         "&family=STIX+Two+Text:ital,wght@0,400..700;1,400..700&display=swap")
STANDALONE_FONTS = re.compile(r'<style data-fonts="standalone">.*?</style>\s*', re.S)

# Reused diagrams: small, verified wording updates applied when inlining.
SD_PATCHES = {
    "dependency-graph": [
        ("Depends(get_db)]", "function-scoped DB"),
        ("get_db too", "the same DB alias"),
    ],
}

EVIDENCE = {
    "code": ("verified", "Verified in current code"),
    "test": ("verified", "Verified by reproduced test"),
    "docs": ("provider", "Official documentation"),
    "hist": ("hist", "Historical evidence"),
    "plan": ("conditional", "Planned / recommended"),
    "nv": ("nv", "Not verified"),
}

BOOKS = [
    {
        "n": 1, "file": "interviewpreparation.html", "prefix": "b1_",
        "short": "1 · Full stack &amp; system design",
        "title": "The whole project, end to end", "title_word": "end to end",
        "head_title": "CareKosh interview book 1: the whole project",
        "eyebrow": "CareKosh interview pack · Book 1 of 3",
        "lede": "What CareKosh is, how every piece fits together, how one tap travels from the phone to PostgreSQL "
                "and back, and how to explain the design in an interview without overstating it.",
        "paths": [("First read", "Parts 1–3 in order, about 90 minutes."),
                  ("Deep study", "Then Book 2 (backend) and Book 3 (security)."),
                  ("Last hour", "Part 4: the whiteboard order, the cheat sheet and the questions.")],
    },
    {
        "n": 2, "file": "backendfastapi.html", "prefix": "b2_",
        "short": "2 · Python &amp; FastAPI backend",
        "title": "The FastAPI backend, in depth", "title_word": "in depth",
        "head_title": "CareKosh interview book 2: the FastAPI backend",
        "eyebrow": "CareKosh interview pack · Book 2 of 3",
        "lede": "Python, FastAPI, Pydantic, async SQLAlchemy, PostgreSQL, Alembic, testing, deployment and hosting, "
                "as this backend actually uses them, with the important code annotated and a backend question bank.",
        "paths": [("First read", "Parts 1, 3, 5 and 6: orientation, FastAPI, data and correctness."),
                  ("Deep study", "Every part in order, with the code excerpts open."),
                  ("Last hour", "Part 13 (annotated code), Part 15 (questions) and Part 16 (limits).")],
    },
    {
        "n": 3, "file": "authsecurity.html", "prefix": "b3_",
        "short": "3 · Auth, sessions &amp; security",
        "title": "Authentication, sessions and security", "title_word": "security",
        "head_title": "CareKosh interview book 3: authentication and security",
        "eyebrow": "CareKosh interview pack · Book 3 of 3",
        "lede": "Hashing, salt, encryption, signing, tokens and sessions, then every account flow from registration "
                "to account deletion, traced through the phone, the API and the database.",
        "paths": [("First read", "Part 1 (concepts), then Part 3 (every flow)."),
                  ("Deep study", "Parts 4–7: authorization, encryption, hardening and honest gaps."),
                  ("Last hour", "The flow diagrams in Part 3 and the question bank in Part 8.")],
    },
]

PROBLEMS: list[str] = []


# =========================================================================== helpers
def resolve(path: str) -> str:
    for short, full in PREFIX.items():
        if path.startswith(short):
            return full + path[len(short):]
    return path


def display(path: str) -> str:
    for short in PREFIX:
        if path.startswith(short):
            return path[len(short):]
    return path


_cache: dict[str, str | None] = {}


def baseline_text(path: str) -> str | None:
    full = resolve(path)
    if full not in _cache:
        try:
            _cache[full] = subprocess.run(["git", "-C", str(ROOT), "show", f"{BASELINE}:{full}"],
                                          capture_output=True, text=True, check=True).stdout
        except subprocess.CalledProcessError:
            _cache[full] = None
    return _cache[full]


def check_path(path: str, where: str) -> None:
    if baseline_text(path) is None:
        PROBLEMS.append(f"{where}: {resolve(path)} does not exist at {BASELINE}")


# =========================================================================== diagrams
class Figures:
    def __init__(self) -> None:
        self.count = 0
        self.names: list[str] = []

    def svg(self, name: str) -> str:
        current = {
            "stock-edit-current": "inventory-concurrency",
            "order-apply-current": "order-status",
        }
        if name in current:
            key = current[name]
            source = (ROOT / "docs" / "diagrams" / f"{key}.svg").read_text(encoding="utf-8")
            svg = source[source.index("<svg"):]
        elif name.startswith("sd:"):
            key = name[3:]
            svg = (SD / "diagrams" / f"{key}.svg").read_text(encoding="utf-8")
            for old, new in SD_PATCHES.get(key, []):
                if old not in svg:
                    PROBLEMS.append(f"patch text not found in {key}: {old}")
                svg = svg.replace(old, new)
        else:
            key = name
            svg = diagrams.render(name)
        svg = STANDALONE_FONTS.sub("", svg).strip()
        # Standalone figures can use the same generic marker and title IDs.
        # Namespace each occurrence when several SVGs share an HTML document.
        ids = set(re.findall(r'\sid="([^"]+)"', svg))
        prefix = f"diagram-{self.count}-"
        svg = re.sub(r'\bid="([^"]+)"', lambda m: f'id="{prefix}{m[1]}"', svg)
        svg = re.sub(r'url\(#([^)]*)\)', lambda m: f"url(#{prefix}{m[1]})" if m[1] in ids else m[0], svg)
        svg = re.sub(r'href="#([^"]+)"', lambda m: f'href="#{prefix}{m[1]}"' if m[1] in ids else m[0], svg)
        svg = re.sub(r'aria-labelledby="([^"]*)"', lambda m: 'aria-labelledby="' + " ".join(
            prefix + token if token in ids else token for token in m[1].split()) + '"', svg)
        return svg

    def figure(self, name: str, caption: str) -> str:
        self.count += 1
        self.names.append(name)
        key = name.split(":")[-1]
        return (f'<figure class="diagram" id="fig-{key}-{self.count}">\n'
                f'<div class="frame wide" data-diagram="{key}">\n{self.svg(name)}\n</div>\n'
                f'<div class="fig-tools"><span class="swipe">Swipe sideways, or tap Enlarge</span></div>\n'
                f'<figcaption><b>Figure {self.count}.</b> {caption}</figcaption>\n</figure>')


# =========================================================================== question banks
QA_KEYS = {"Q": "q", "L": "level", "T": "tags", "S": "short", "D": "deep", "F": "follow", "X": "avoid"}


def parse_qa(name: str) -> list[tuple[str, list[dict]]]:
    groups: list[tuple[str, list[dict]]] = []
    current: dict | None = None
    key = None
    for raw in (CONTENT / f"{name}.qa").read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        if line.startswith("## "):
            groups.append((line[3:].strip(), []))
            current, key = None, None
            continue
        m = re.match(r"^([QLTSDFX]): ?(.*)$", line)
        if m and m.group(1) in QA_KEYS:
            k = QA_KEYS[m.group(1)]
            if k == "q":
                current = {"q": m.group(2)}
                groups[-1][1].append(current)
            else:
                current[k] = m.group(2)
            key = k
        elif line.strip() and current is not None and key:
            current[key] += " " + line.strip()
    return groups


def render_qa(name: str, book: int, counter: list[int]) -> str:
    out = ['<div class="qa-tools" data-book="%d">' % book,
           '<label class="qa-filter"><span>Filter questions</span>'
           '<input type="search" placeholder="Type a word or tag, e.g. jwt, async, deploy" aria-label="Filter questions"></label>',
           '<div class="qa-buttons"><button type="button" class="pill" data-qa="open">Show all answers</button>'
           '<button type="button" class="pill" data-qa="close">Hide all answers</button>'
           '<span class="qa-count" aria-live="polite"></span></div></div>']
    for title, items in parse_qa(name):
        out.append(f'<h4 class="qa-head">{title}</h4>\n<div class="qa-group">')
        for item in items:
            counter[0] += 1
            n = counter[0]
            for need in ("level", "tags", "short", "deep"):
                if not item.get(need):
                    PROBLEMS.append(f"{name}.qa question {n} lacks {need}: {item['q'][:60]}")
            tags = [t.strip() for t in item.get("tags", "").split(",") if t.strip()]
            level = item.get("level", "intermediate")
            chips = "".join(f'<span class="chip">{t}</span>' for t in tags)
            body = [f'<p class="short"><b>Short answer.</b> {item.get("short", "")}</p>',
                    f'<p><b>Deeper.</b> {item.get("deep", "")}</p>']
            if item.get("follow"):
                body.append(f'<p class="fu"><b>Likely follow-ups.</b> {item["follow"]}</p>')
            if item.get("avoid"):
                body.append(f'<p class="avoid"><b>Avoid saying.</b> {item["avoid"]}</p>')
            body.append(f'<p class="chips">{chips}</p>')
            out.append(
                f'<details class="qa" id="q{book}-{n}" data-tags="{html.escape(" ".join(tags) + " " + level)}">'
                f'<summary><span class="qn">{n}</span><span class="qt">{item["q"]}</span>'
                f'<span class="lvl {level}">{level}</span></summary>\n<div class="a">{"".join(body)}</div></details>')
        out.append("</div>")
    return "\n".join(out)


# =========================================================================== macros
def expand(text: str, book: int, figs: Figures, qa_counter: list[int], where: str) -> str:
    excerpts: list[str] = []

    def excerpt(m: re.Match) -> str:
        path, a, b, note = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
        src = baseline_text(path)
        if src is None:
            PROBLEMS.append(f"{where}: excerpt file missing {resolve(path)}")
            return ""
        lines = src.splitlines()
        if b > len(lines) or a < 1 or a > b:
            PROBLEMS.append(f"{where}: excerpt range {a}-{b} outside {resolve(path)} ({len(lines)} lines)")
        body = "\n".join(lines[a - 1:b])
        width = len(str(b))
        numbered = "\n".join(f'<span class="ln">{a + i:>{width}}</span><span>  {html.escape(line)}</span>'
                             for i, line in enumerate(body.split("\n")))
        head = (f'<div class="excerpt-head"><span class="path">{html.escape(display(path))}</span>'
                f'<span class="small muted">lines {a}–{b} · exact copy at {BASELINE}</span></div>')
        extra = f'<p class="small muted excerpt-note">{note}</p>' if note else ""
        excerpts.append(f'<div class="excerpt">{head}<div class="codeblock"><pre><code>{numbered}</code></pre></div>{extra}</div>')
        return f"\x00X{len(excerpts) - 1}\x00"

    text = re.sub(r"\{\{x:([^:{}]+):(\d+)-(\d+)(?:\|(.*?))?\}\}", excerpt, text, flags=re.S)

    def path_macro(m: re.Match) -> str:
        path = m.group(1)
        check_path(path, where)
        return f'<a class="path" href="../{html.escape(resolve(path))}">{html.escape(display(path))}</a>'

    def sym_macro(m: re.Match) -> str:
        path, name = m.group(1), m.group(2)
        src = baseline_text(path)
        if src is None:
            PROBLEMS.append(f"{where}: symbol file missing {resolve(path)}")
        elif not re.search(r"\b" + re.escape(name) + r"\b", src):
            PROBLEMS.append(f"{where}: symbol {name} not found in {resolve(path)}")
        return f'<code title="{html.escape(resolve(path))}">{html.escape(name)}</code>'

    def ev_macro(m: re.Match) -> str:
        chips = []
        for k in m.group(1).split(","):
            cls, label = EVIDENCE[k.strip()]
            chips.append(f'<span class="chip ev {cls}">{label}</span>')
        return '<span class="evidence">' + "".join(chips) + "</span>"

    def book_macro(m: re.Match) -> str:
        n, anchor, label = int(m.group(1)), m.group(2), m.group(3)
        return f'<a href="{BOOKS[n - 1]["file"]}#{anchor}">{label}</a>'

    text = re.sub(r"\{\{p:([^}]+)\}\}", path_macro, text)
    text = re.sub(r"\{\{s:([^#}]+)#([^}]+)\}\}", sym_macro, text)
    text = re.sub(r"\{\{ev:([a-z, ]+)\}\}", ev_macro, text)
    text = re.sub(r"\{\{book:(\d)#([^|}]+)\|([^}]+)\}\}", book_macro, text)
    text = re.sub(r"\{\{fig:([^|}]+)\|(.*?)\}\}", lambda m: figs.figure(m.group(1), m.group(2)), text, flags=re.S)
    text = re.sub(r"\{\{qa:([a-z0-9_]+)\}\}", lambda m: render_qa(m.group(1), book, qa_counter), text)
    callouts = {"say": ("callout say", "Say it in the interview"),
                "follow": ("callout note", "Likely follow-ups"),
                "avoid": ("callout risk", "Don't say"),
                "limits": ("callout warn", "Trade-offs and limits")}
    for tag, (cls, title) in callouts.items():
        text = re.sub(rf"<{tag}>(.*?)</{tag}>",
                      lambda m, c=cls, t=title: f'<div class="{c}"><span class="callout-title">{t}</span>{m.group(1)}</div>',
                      text, flags=re.S)
    if "{{" in text:
        for left in re.findall(r"\{\{[^}]{0,60}", text):
            PROBLEMS.append(f"{where}: unexpanded macro {left}")
    return re.sub(r"\x00X(\d+)\x00", lambda m: excerpts[int(m.group(1))], text)


# =========================================================================== page
def number_chapters(body: str) -> tuple[str, list[dict]]:
    parts: list[dict] = []
    out = []
    pos = 0
    for pm in re.finditer(r'<section class="part" id="([^"]+)" data-toc="([^"]+)"(?: data-desc="([^"]*)")?>', body):
        parts.append({"id": pm.group(1), "title": pm.group(2), "desc": pm.group(3) or "", "start": pm.start(), "subs": []})
    for i, part in enumerate(parts):
        end = parts[i + 1]["start"] if i + 1 < len(parts) else len(body)
        segment = body[part["start"]:end]
        k = 0

        def sub(m: re.Match) -> str:
            nonlocal k
            k += 1
            part["subs"].append({"id": m.group(1), "title": m.group(2)})
            return m.group(0)

        segment = re.sub(r'<div class="sub" id="([^"]+)" data-toc="([^"]+)">', sub, segment)
        counter = iter(range(1, 999))
        segment = re.sub(r'(<div class="sub" id="[^"]+" data-toc="[^"]+">\s*<h3>)',
                         lambda m: m.group(1) + f'<span class="cnum">{i + 1}.{next(counter)}</span> ', segment)
        out.append((part["start"], end, segment))
    if parts:
        body = body[:parts[0]["start"]] + "".join(s for _, _, s in out)
    return body, parts


def toc_html(parts: list[dict]) -> str:
    rows = []
    for i, p in enumerate(parts, 1):
        subs = "".join(f'<li><a href="#{s["id"]}">{i}.{j} {s["title"]}</a></li>' for j, s in enumerate(p["subs"], 1))
        rows.append(f'<li><a href="#{p["id"]}">{i}. {p["title"]}</a>' + (f"<ol>{subs}</ol>" if subs else "") + "</li>")
    return ('<aside class="toc" aria-label="Chapters"><details><summary>Chapters in this book</summary><ol>'
            + "".join(rows) + "</ol></details></aside>")


def words(text: str) -> int:
    plain = re.sub(r"<svg.*?</svg>|<pre.*?</pre>|<[^>]+>", " ", text, flags=re.S)
    return len(re.findall(r"[A-Za-z0-9’']+", plain))


def page(book: dict, body: str, parts: list[dict], figs: Figures, qa_total: int, facts: dict) -> str:
    css = (SD / "assets" / "carekosh.css").read_text(encoding="utf-8") + "\n" + (HERE / "extra.css").read_text(encoding="utf-8")
    js = (SD / "assets" / "carekosh.js").read_text(encoding="utf-8") + "\n" + (HERE / "extra.js").read_text(encoding="utf-8")
    current = ' aria-current="page"'
    nav = "".join(
        f'<li><a href="{b["file"]}"{current if b is book else ""}>{b["short"]}</a></li>' for b in BOOKS)
    title = book["title"].replace(book["title_word"], f'<em>{book["title_word"]}</em>')
    minutes = round(words(body) / 200 / 5) * 5
    part_map = "".join(f'<a href="#{p["id"]}"><span class="num">Part {i}</span><span class="t">{p["title"]}</span>'
                       f'<span class="d">{p["desc"]}</span></a>' for i, p in enumerate(parts, 1))
    paths = "".join(f'<div class="card"><h4>{t}</h4><p>{d}</p></div>' for t, d in book["paths"])
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{book["head_title"]}</title>
<meta name="description" content="{html.escape(re.sub('<[^>]+>', '', book['lede']))}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS.replace('&', '&amp;')}">
<style>
{css}
</style>
</head>
<body>
<a class="skip" href="#main">Skip to the chapters</a>
<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="interviewpreparation.html">Care<span>Kosh</span> interview pack</a>
    <nav aria-label="Interview books"><ul class="pages">{nav}</ul></nav>
  </div>
</header>
<section class="hero">
  <div class="hero-inner">
    <p class="eyebrow">{book["eyebrow"]}</p>
    <h1>{title}</h1>
    <p class="lede">{book["lede"]}</p>
    <div class="hero-meta chips">
      <span class="chip verified">Checked against code · {BASELINE} · {CHECKED}</span>
      <span class="chip verified">Local tests passed · {facts["backend_tests"]} backend (migrated schema, 2 skipped) · {facts["mobile_tests"]} Android Node · {facts["web_tests"]} web</span>
      <span class="chip nv">Live services and phones not verified</span>
      <span class="chip">{len(parts)} parts · {figs.count} figures · {qa_total} questions</span>
      <span class="chip">~{minutes} min read</span>
    </div>
    <div class="cards reading-paths">{paths}</div>
    <div class="callout note"><span class="callout-title">How to read the labels</span>
      <p><span class="chip ev verified">Verified in current code</span> read in the source at {BASELINE}.
      <span class="chip ev verified">Verified by reproduced test</span> run on {CHECKED}.
      <span class="chip ev provider">Official documentation</span> general behaviour of a framework or standard.
      <span class="chip ev hist">Historical evidence</span> a dated record, not re-checked.
      <span class="chip ev conditional">Planned / recommended</span> not built.
      <span class="chip ev nv">Not verified</span> live, dashboard or device state.</p></div>
    <div class="part-map">{part_map}</div>
  </div>
</section>
<div class="layout">
  {toc_html(parts)}
  <main class="content" id="main">
{body}
  </main>
</div>
<footer class="footer">
  <div class="footer-inner">
    <p>Reviewed against GitHub <code>main</code> at <code>{BASELINE}</code>
    (<code>{BASELINE_FULL}</code>) on {CHECKED}. Code excerpts are exact copies from that commit. Deployed versions, dashboard settings and phones are not verified here.</p>
    <p>The other books: {" · ".join(f'<a href="{b["file"]}">{b["short"]}</a>' for b in BOOKS if b is not book)}.
    Built by <span class="path">interview/src/build.py</span> from the fragments in <span class="path">interview/src/content/</span>.</p>
  </div>
</footer>
<script>
{js}
</script>
</body>
</html>
"""


def build() -> int:
    facts = FACTS
    requirements = baseline_text("B/requirements.txt") or ""
    pins = {name.lower(): version for name, version in re.findall(
        r"^([\w-]+)(?:\[[^\]]+\])?==([\w.]+)", requirements, re.M)}
    for key, package in {"fastapi": "fastapi", "starlette": "starlette", "pyjwt": "pyjwt",
                         "sqlalchemy": "sqlalchemy", "cryptography": "cryptography",
                         "sentry": "sentry-sdk"}.items():
        if facts[key] != pins.get(package):
            PROBLEMS.append(f"{key}: book version differs from the requirements at {BASELINE}")
    report = {}
    for book in BOOKS:
        figs = Figures()
        qa_counter = [0]
        chunks = []
        for frag in sorted(CONTENT.glob(f'{book["prefix"]}*.html')):
            raw = frag.read_text(encoding="utf-8")
            for key, value in facts.items():
                raw = raw.replace("{{f:" + key + "}}", str(value))
            chunks.append(expand(raw, book["n"], figs, qa_counter, frag.name))
        body, parts = number_chapters("\n".join(chunks))
        (OUT / book["file"]).write_text(page(book, body, parts, figs, qa_counter[0], facts), encoding="utf-8")
        report[book["file"]] = {"parts": len(parts), "chapters": sum(len(p["subs"]) for p in parts),
                                "figures": figs.count, "questions": qa_counter[0], "words": words(body)}
    for name, r in report.items():
        print(f"{name}: {r}")
    for p in PROBLEMS:
        print("PROBLEM:", p)
    return 1 if PROBLEMS else 0


if __name__ == "__main__":
    sys.exit(build())
