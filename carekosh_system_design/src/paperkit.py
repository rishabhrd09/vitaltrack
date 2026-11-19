"""paperkit — a small SVG toolkit for the CareKosh system-design diagrams (paper edition).

Design rules
* Drawn for ~1:1 display in a 62rem figure: canvases are 1000 px wide, body text 18 px,
  card titles 21 px, so the type stays large on screen. Phones scroll sideways; every
  figure can also be enlarged.
* Fixed colour meanings (the same on every page and in the CSS):
    client   olive  #557629  the phone app
    server   slate  #2E5677  the FastAPI backend
    data     ochre  #A9680F  PostgreSQL, caches, storage
    service  plum   #6B3A6E  outside services
    fail     brick  #B2423B  failures, refusals, risks
    platform taupe  #6E5D4E  hosting, CI, tooling
    key      maroon #7B2C34  the main path, step numbers, emphasis
  A dashed outline always means "only when configured" or "optional".
* Newsreader for text, STIX Two Text for numerals, JetBrains Mono for code. When a page
  inlines the SVG it uses the page's web fonts; opened on its own, the SVG falls back to
  Georgia / Times / Menlo.
* Every id is prefixed with the diagram name, so several diagrams can be inlined in one page.
"""

from __future__ import annotations

import html
from dataclasses import dataclass, field

from fontmetrics import BOLD as BOLD_EM, ITALIC as ITALIC_EM, MONO_EM, SERIF as SERIF_EM  # noqa: E402

SERIF = "Newsreader, 'Iowan Old Style', Georgia, serif"
MATH = "'STIX Two Text', 'Cambria Math', 'Times New Roman', serif"
MONO = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace"

SHEET = "#FBF6EC"
PAPER = "#F3E9D8"
PAPER2 = "#EBDDC6"
RULE = "#D3BF9E"
INK = "#1A1512"
INK2 = "#4B3E35"
INK3 = "#7C6B5C"
MAROON = "#7B2C34"
GRID = "#CDBB9C"
GRID2 = "#A8946F"

COLOR = {
    "client": "#557629",
    "server": "#2E5677",
    "data": "#A9680F",
    "service": "#6B3A6E",
    "fail": "#B2423B",
    "platform": "#6E5D4E",
    "key": "#7B2C34",
    "note": "#A8946F",
    "plain": "#B9A27E",
}
FONT_CSS = ("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600"
            "&amp;family=Newsreader:ital,opsz,wght@0,6..72,300..700;1,6..72,300..700"
            "&amp;family=STIX+Two+Text:ital,wght@0,400..700;1,400..700&amp;display=swap")
LEGEND_ALL = [("client", "Phone app"), ("server", "Backend"), ("data", "Data"),
              ("service", "Outside service"), ("platform", "Platform"), ("fail", "Failure")]


def _mix(hex_a: str, hex_b: str, amount: float) -> str:
    a = [int(hex_a[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(hex_b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x * amount + y * (1 - amount)):02X}" for x, y in zip(a, b))


def fill_of(role: str) -> str:
    if role == "note":
        return PAPER2
    if role == "plain":
        return SHEET
    return _mix(COLOR[role], SHEET, 0.10)


def lane_fill(role: str) -> str:
    return _mix(COLOR[role], SHEET, 0.045)


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def text_width(text: str, size: float, kind: str = "serif") -> float:
    """Rendered width in px, from advance widths measured in Chrome (see fontmetrics.py)."""
    if kind == "mono":
        return len(text) * size * MONO_EM
    if kind == "caps":  # kickers: JetBrains Mono capitals with 1.6px letter-spacing
        return len(text) * (size * MONO_EM + 1.6)
    table = {"serif": SERIF_EM, "italic": ITALIC_EM, "bold": BOLD_EM}.get(kind, SERIF_EM)
    # Summed advances run about 2% short of the shaped string, so allow 3%.
    return sum(table.get(ch, 0.6) for ch in text) * size * 1.03


def wrap(text: str, width_px: float, size: float, kind: str = "serif") -> list[str]:
    out: list[str] = []
    for paragraph in text.split("\n"):
        line = ""
        # (word, glue before it). A single word wider than the line, such as "Compare-and-swap",
        # may break after a hyphen; its pieces join with no space when they share a line.
        words: list[tuple[str, str]] = []
        for word in paragraph.split(" "):
            if "-" in word.strip("-") and text_width(word, size, kind) > width_px:
                pieces = word.split("-")
                for i, piece in enumerate(pieces):
                    words.append((piece + ("-" if i < len(pieces) - 1 else ""), "" if i else " "))
            else:
                words.append((word, " "))
        for word, glue in words:
            candidate = f"{line}{glue}{word}" if line else word
            if not line or text_width(candidate, size, kind) <= width_px:
                line = candidate
            else:
                out.append(line)
                line = word
        out.append(line)
    return out


ARROWS = {
    # kind: (colour, width, dash)
    "flow": (INK2, 2.6, None),
    "main": (MAROON, 3.2, None),
    "reply": (INK3, 2.4, "8 7"),
    "optional": (COLOR["service"], 2.4, "8 7"),
    "fail": (COLOR["fail"], 2.6, None),
    "data": (COLOR["data"], 2.6, None),
    "copy": (COLOR["data"], 2.2, "3 6"),
}


@dataclass
class Card:
    x: float
    y: float
    w: float
    h: float

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2

    @property
    def bottom(self) -> float:
        return self.y + self.h

    @property
    def right(self) -> float:
        return self.x + self.w


@dataclass
class Canvas:
    name: str
    width: int
    title: str
    desc: str
    height: float = 0
    parts: list[str] = field(default_factory=list)
    used_markers: set = field(default_factory=set)

    # ------------------------------------------------------------------ ids
    def uid(self, suffix: str) -> str:
        return f"{self.name}-{suffix}"

    # ------------------------------------------------------------------ text
    def text(self, x: float, y: float, value: str, size: float = 18, weight: int = 400, color: str = INK,
             family: str = SERIF, anchor: str = "start", italic: bool = False, spacing: float | None = None,
             halo: bool = False) -> None:
        extra = ' font-style="italic"' if italic else ""
        if spacing:
            extra += f' letter-spacing="{spacing}"'
        if halo:
            extra += f' stroke="{SHEET}" stroke-width="6" stroke-linejoin="round" paint-order="stroke"'
        self.parts.append(
            f'<text x="{x:.1f}" y="{y:.1f}" font-family="{family}" font-size="{size}" font-weight="{weight}" '
            f'fill="{color}" text-anchor="{anchor}"{extra}>{esc(value)}</text>')

    def kicker(self, x: float, y: float, value: str, color: str = INK3, size: float = 12.5, anchor: str = "start") -> None:
        self.text(x, y, value.upper(), size, 600, color, MONO, anchor, spacing=1.6)

    def lines(self, x: float, y: float, values: list[str], size: float = 18, color: str = INK2, family: str = SERIF,
              weight: int = 400, gap: float = 1.42, italic: bool = False, anchor: str = "start") -> float:
        for i, value in enumerate(values):
            self.text(x, y + i * size * gap, value, size, weight, color, family, anchor, italic)
        return y + len(values) * size * gap

    # ------------------------------------------------------------------ shapes
    def rect(self, x: float, y: float, w: float, h: float, fill: str = SHEET, stroke: str = RULE, sw: float = 1.6,
             r: float = 12, dash: str | None = None, extra: str = "") -> None:
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{r}" fill="{fill}" '
                          f'stroke="{stroke}" stroke-width="{sw}"{d}{extra}/>')

    def badge(self, cx: float, cy: float, label: str, r: float = 16, color: str = MAROON) -> None:
        self.parts.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{color}"/>')
        self.text(cx, cy + r * 0.38, label, r * 1.12, 500, SHEET, MATH, "middle")

    # ------------------------------------------------------------------ cards
    @staticmethod
    def measure(w: float, title: str = "", body=None, kv=None, kicker: str | None = None, num: str | None = None,
                ts: float = 21, bs: float = 18, mono: bool = False, pad: float = 18, kv_label: float = 96) -> float:
        h = pad
        if kicker:
            h += 22
        if title:
            tw = w - 2 * pad - (42 if num else 0)
            h += len(wrap(title, tw, ts, "bold")) * ts * 1.25 + 4
        inner = w - 2 * pad
        if body:
            chunks = [body] if isinstance(body, str) else body
            for chunk in chunks:
                h += len(wrap(chunk, inner, bs, "mono" if mono else "serif")) * bs * 1.42
            h += 2
        if kv:
            for label, value in kv:
                n = len(wrap(value, inner - kv_label, bs, "serif"))
                h += max(n, 1) * bs * 1.42 + 6
        return h + pad - 2

    def card(self, x: float, y: float, w: float, title: str = "", body=None, role: str = "server", kv=None,
             kicker: str | None = None, num: str | None = None, dashed: bool = False, min_h: float = 0,
             ts: float = 21, bs: float = 18, mono: bool = False, pad: float = 18, kv_label: float = 96,
             double: bool = False, align: str = "start") -> Card:
        h = max(min_h, self.measure(w, title, body, kv, kicker, num, ts, bs, mono, pad, kv_label))
        color = COLOR[role]
        self.rect(x, y, w, h, fill_of(role), color if role not in ("note", "plain") else RULE, 1.8 if role not in ("note", "plain") else 1.4,
                  12, "7 6" if dashed else None)
        if double:
            self.rect(x + 5, y + 5, w - 10, h - 10, "none", color, 1.2, 9)
        cy = y + pad
        tx = x + pad if align == "start" else x + w / 2
        anchor = "start" if align == "start" else "middle"
        if kicker:
            self.kicker(tx, cy + 11, kicker, color if role not in ("note", "plain") else INK3, anchor=anchor)
            cy += 22
        if title:
            title_x = tx
            if num:
                self.badge(x + pad + 15, cy + ts * 0.42, num)
                title_x = x + pad + 42
            tl = wrap(title, w - 2 * pad - (42 if num else 0), ts, "bold")
            title_color = INK if role in ("note", "plain") else color
            for i, line in enumerate(tl):
                self.text(title_x, cy + ts * 0.92 + i * ts * 1.25, line, ts, 600, title_color, SERIF,
                          "start" if num else anchor)
            cy += len(tl) * ts * 1.25 + 4
        inner = w - 2 * pad
        if body:
            chunks = [body] if isinstance(body, str) else body
            for chunk in chunks:
                bl = wrap(chunk, inner, bs, "mono" if mono else "serif")
                for line in bl:
                    self.text(tx, cy + bs * 1.05, line, bs * (0.9 if mono else 1), 400, INK2, MONO if mono else SERIF, anchor)
                    cy += bs * 1.42
            cy += 2
        if kv:
            for label, value in kv:
                self.kicker(x + pad, cy + bs * 0.98, label, INK3, 11.5)
                vl = wrap(value, inner - kv_label, bs, "serif")
                for j, line in enumerate(vl):
                    self.text(x + pad + kv_label, cy + bs * 1.05 + j * bs * 1.42, line, bs, 400, INK2)
                cy += max(len(vl), 1) * bs * 1.42 + 6
        return Card(x, y, w, h)

    def note(self, x: float, y: float, w: float, text: str, kind: str = "key", title: str | None = None,
             size: float = 18) -> Card:
        """key: maroon rule + italic maroon text; lens: paper box with asymmetric corners; risk: brick box."""
        pad = 18
        tl = wrap(title, w - 2 * pad - 10, 15, "caps") if title else []
        lines = wrap(text, w - 2 * pad - 22, size, "italic" if kind == "key" else "serif")
        h = pad + (22 if tl else 0) + len(lines) * size * 1.42 + pad - 4
        if kind == "key":
            self.parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="2.5" height="{h:.1f}" fill="{MAROON}"/>')
            tx, color, italic = x + 18, MAROON, True
        else:
            fill = PAPER2 if kind == "lens" else fill_of("fail")
            stroke = "none" if kind == "lens" else COLOR["fail"]
            self.parts.append(
                f'<path d="M{x + 3:.1f},{y:.1f} H{x + w - 16:.1f} Q{x + w:.1f},{y:.1f} {x + w:.1f},{y + 16:.1f} '
                f'V{y + h - 16:.1f} Q{x + w:.1f},{y + h:.1f} {x + w - 16:.1f},{y + h:.1f} H{x + 3:.1f} '
                f'Q{x:.1f},{y + h:.1f} {x:.1f},{y + h - 3:.1f} V{y + 3:.1f} Q{x:.1f},{y:.1f} {x + 3:.1f},{y:.1f} Z" '
                f'fill="{fill}" stroke="{stroke}" stroke-width="1.4"/>')
            tx, color, italic = x + pad, INK2 if kind == "lens" else INK2, False
        cy = y + pad
        if tl:
            self.kicker(tx, cy + 10, title, MAROON if kind != "risk" else COLOR["fail"])
            cy += 22
        for line in lines:
            self.text(tx, cy + size, line, size, 400, color, SERIF, "start", italic)
            cy += size * 1.42
        return Card(x, y, w, h)

    # ------------------------------------------------------------------ arrows
    def _marker(self, kind: str) -> str:
        self.used_markers.add(kind)
        return self.uid(f"ah-{kind}")

    def arrow(self, points: list[tuple[float, float]], kind: str = "flow", label: str | None = None,
              label_at: float = 0.5, label_dx: float = 0, label_dy: float = -10, both: bool = False,
              label_anchor: str = "middle", radius: float = 10, label_size: float = 16.5) -> None:
        color, width, dash = ARROWS[kind]
        d = self._rounded(points, radius)
        dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
        marker = self._marker(kind)
        start = f' marker-start="url(#{marker})"' if both else ""
        self.parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" '
                          f'stroke-linejoin="round"{dash_attr} marker-end="url(#{marker})"{start}/>')
        if label:
            segs = list(zip(points, points[1:]))
            (x1, y1), (x2, y2) = max(segs, key=lambda s: abs(s[1][0] - s[0][0]) + abs(s[1][1] - s[0][1]))
            lx, ly = x1 + (x2 - x1) * label_at + label_dx, y1 + (y2 - y1) * label_at + label_dy
            for i, line in enumerate(label.split("\n")):
                self.text(lx, ly + i * label_size * 1.25, line, label_size, 400, INK2, SERIF, label_anchor, True, halo=True)

    @staticmethod
    def _rounded(points: list[tuple[float, float]], radius: float) -> str:
        if len(points) < 3:
            (x1, y1), (x2, y2) = points[0], points[-1]
            return f"M{x1:.1f},{y1:.1f} L{x2:.1f},{y2:.1f}"
        out = [f"M{points[0][0]:.1f},{points[0][1]:.1f}"]
        for i in range(1, len(points) - 1):
            (px, py), (cx, cy), (nx, ny) = points[i - 1], points[i], points[i + 1]
            d1 = max(1e-6, abs(cx - px) + abs(cy - py))
            d2 = max(1e-6, abs(nx - cx) + abs(ny - cy))
            r = min(radius, d1 / 2, d2 / 2)
            ax, ay = cx - (cx - px) / d1 * r, cy - (cy - py) / d1 * r
            bx, by = cx + (nx - cx) / d2 * r, cy + (ny - cy) / d2 * r
            out.append(f"L{ax:.1f},{ay:.1f} Q{cx:.1f},{cy:.1f} {bx:.1f},{by:.1f}")
        out.append(f"L{points[-1][0]:.1f},{points[-1][1]:.1f}")
        return " ".join(out)

    # ------------------------------------------------------------------ page furniture
    def header(self, title: str, subtitle: str = "", x: float = 40, y: float = 58) -> float:
        self.text(x, y, title, 30, 500, INK, SERIF)
        y2 = y + 14
        if subtitle:
            for line in wrap(subtitle, self.width - 2 * x, 18.5, "italic"):
                y2 += 18.5 * 1.42
                self.text(x, y2, line, 18.5, 400, INK3, SERIF, "start", True)
        return y2 + 20

    def legend(self, y: float, items=None, x: float = 40, dashed_note: bool = True) -> float:
        items = list(items or LEGEND_ALL)
        cx = x
        entries = [(role, label, False) for role, label in items]
        if dashed_note:
            entries.append(("plain", "Dashed outline: only when configured", True))
        for role, label, dashed in entries:
            width = 32 + len(label) * 15.5 * 0.47 + 24
            if cx + width > self.width - 30:
                cx = x
                y += 28
            if dashed:
                self.rect(cx, y - 13, 24, 16, SHEET, GRID2, 1.6, 4, "4 3")
            else:
                self.rect(cx, y - 13, 24, 16, fill_of(role), COLOR[role], 1.6, 4)
            self.text(cx + 32, y, label, 15.5, 400, INK2)
            cx += width
        return y + 26

    # ------------------------------------------------------------------ output
    def render(self) -> str:
        h = int(self.height)
        defs = [
            f'<pattern id="{self.uid("dots")}" width="24" height="24" patternUnits="userSpaceOnUse">'
            f'<circle cx="2" cy="2" r="1.15" fill="{GRID}" opacity="0.6"/></pattern>'
        ]
        for kind in sorted(self.used_markers):
            color = ARROWS[kind][0]
            defs.append(
                f'<marker id="{self.uid("ah-" + kind)}" viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="4.6" '
                f'markerHeight="4.6" markerUnits="strokeWidth" orient="auto-start-reverse">'
                f'<path d="M0,0.6 L10,5 L0,9.4 L2.4,5 Z" fill="{color}"/></marker>')
        body = "\n".join(self.parts)
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.width} {h}" width="{self.width}" height="{h}" '
            f'role="img" aria-labelledby="{self.uid("title")} {self.uid("desc")}">\n'
            f'<title id="{self.uid("title")}">{esc(self.title)}</title>\n'
            f'<desc id="{self.uid("desc")}">{esc(self.desc)}</desc>\n'
            f'<style data-fonts="standalone">@import url("{FONT_CSS}");</style>\n'
            f'<defs>{"".join(defs)}</defs>\n'
            f'<rect width="100%" height="100%" fill="{SHEET}"/>\n'
            f'<rect width="100%" height="100%" fill="url(#{self.uid("dots")})"/>\n'
            f'{body}\n</svg>\n')


class Flow:
    """Cards placed in labelled lanes in the order of events.

    A step in another lane starts beside the previous step (a staircase), so a sequence reads like a
    sequence diagram without wasting height. Connectors leave a card's side, run down the gutter
    between lanes and enter the next card's side; a step in the same lane is joined straight down.
    """

    def __init__(self, c: Canvas, lanes: list[tuple[str, str, str]], top: float, x0: float = 40,
                 x1: float | None = None, gutter: float = 26, widths: list[float] | None = None, gap: float = 30,
                 stagger: float = 58):
        self.c = c
        self.top = top
        self.gap = gap
        self.stagger = stagger
        x1 = x1 if x1 is not None else c.width - 40
        total = x1 - x0 - gutter * (len(lanes) - 1)
        widths = widths or [1] * len(lanes)
        scale = total / sum(widths)
        widths = [w * scale for w in widths]
        self.order = [k for k, _, _ in lanes]
        self.lane = {}
        x = x0
        for (key, label, role), w in zip(lanes, widths):
            self.lane[key] = (x, w, label, role)
            x += w + gutter
        self.gutter = gutter
        self.mark = len(c.parts)
        for key, (lx, lw, label, role) in self.lane.items():
            c.kicker(lx + 16, top + 30, label, COLOR[role], 13)
        start = top + 54 - gap
        self.bottom = {k: start for k in self.order}
        self.prev: Card | None = None
        self.prev_lanes: list[str] = []
        self.entry: tuple[Card, str] | None = None
        self.after_notes: list[tuple[str, str, str | None]] = []

    @property
    def y(self) -> float:
        return max(self.bottom.values()) + self.gap

    @y.setter
    def y(self, value: float) -> None:
        for k in self.order:
            self.bottom[k] = max(self.bottom[k], value - self.gap)

    def span(self, lanes: list[str]) -> tuple[float, float]:
        xs = [self.lane[k][0] for k in lanes]
        ends = [self.lane[k][0] + self.lane[k][1] for k in lanes]
        return min(xs), max(ends) - min(xs)

    def _between(self, a: list[str], b: list[str]) -> list[str]:
        ia = [self.order.index(k) for k in a]
        ib = [self.order.index(k) for k in b]
        lo, hi = min(ia + ib), max(ia + ib)
        return [k for k in self.order[lo:hi + 1] if k not in a]

    def step(self, lane, title: str, body=None, role: str | None = None, num: str | None = None, kv=None,
             link: str = "auto", kind: str = "flow", label: str | None = None, dashed: bool = False,
             inset: float = 12, same_row: bool = False, **kw) -> Card:
        lanes = lane if isinstance(lane, list) else [lane]
        x, w = self.span(lanes)
        x, w = x + inset, w - 2 * inset
        role = role or self.lane[lanes[0]][3]
        linked = self.prev is not None and link != "none"
        apart = linked and not set(lanes) & set(self.prev_lanes)
        if same_row and self.prev is not None:
            y = self.prev.y
        elif apart:
            y = max(self.bottom[k] for k in self._between(self.prev_lanes, lanes)) + self.gap
            y = max(y, self.prev.y + min(self.prev.h * 0.5, self.stagger))
        else:
            y = max(self.bottom[k] for k in lanes) + self.gap
        card = self.c.card(x, y, w, title, body, role, kv, num=num, dashed=dashed, **kw)
        if linked:
            self.connect(self.prev, card, kind, label, lanes)
        for k in lanes:
            self.bottom[k] = max(self.bottom[k], card.bottom)
        self.prev = card
        self.prev_lanes = lanes
        return card

    def connect(self, a: Card, b: Card, kind: str = "flow", label: str | None = None, b_lanes=None) -> None:
        c = self.c
        if min(a.right, b.right) - max(a.x, b.x) > 40 and b.y >= a.bottom:
            x = (max(a.x, b.x) + min(a.right, b.right)) / 2
            c.arrow([(x, a.bottom + 2), (x, b.y - 4)], kind, label, label_dx=12, label_anchor="start", label_dy=5)
            return
        to_right = b.x > a.x
        y_end = b.y + min(30, b.h / 2)
        y_start = a.y + min(30, a.h / 2)
        out_side = "right" if to_right else "left"
        if self.entry and self.entry[0] is a and self.entry[1] == out_side:
            # The previous arrow came in on this side: leave lower so the two never share the gutter line.
            y_start = min(a.y + 62, a.bottom - 18)
        self.entry = (b, "left" if to_right else "right")
        sx = a.right + 2 if to_right else a.x - 2
        ex = b.x - 4 if to_right else b.right + 4
        if abs(y_start - y_end) < 2:
            c.arrow([(sx, y_start), (ex, y_end)], kind, label if abs(ex - sx) > 120 else None, label_dy=-11)
        else:
            gx = a.right + self.gutter / 2 if to_right else a.x - self.gutter / 2
            c.arrow([(sx, y_start), (gx, y_start), (gx, y_end), (ex, y_end)], kind)
        if b_lanes:
            prev_lanes = self.prev_lanes or []
            for k in self._between(prev_lanes, b_lanes):
                if k not in b_lanes:
                    self.bottom[k] = max(self.bottom[k], y_end + 6)

    def divider(self, text: str) -> None:
        c = self.c
        x0 = min(v[0] for v in self.lane.values())
        x1 = max(v[0] + v[1] for v in self.lane.values())
        y = self.y + 4
        c.parts.append(f'<line x1="{x0 + 10:.1f}" y1="{y:.1f}" x2="{x1 - 10:.1f}" y2="{y:.1f}" stroke="{RULE}" stroke-width="1.4"/>')
        c.text(x0 + 16, y + 30, text, 19, 500, MAROON, SERIF, "start", True)
        self.y = y + 46
        self.prev = None
        self.prev_lanes = []

    def note(self, text: str, kind: str = "key", lanes: list[str] | None = None, title: str | None = None,
             after: bool = False) -> Card | None:
        """A note across the lanes. after=True draws it below the lanes, once they have been closed."""
        if after:
            self.after_notes.append((text, kind, title))
            return None
        lanes = lanes or list(self.order)
        x, w = self.span(lanes)
        card = self.c.note(x + 12, self.y + 6, w - 24, text, kind, title)
        self.y = card.bottom + self.gap
        self.prev = None
        self.prev_lanes = []
        return card

    def finish(self, extra: float = 0) -> float:
        c = self.c
        bottom = max(self.bottom.values()) + 26 + extra
        backs = []
        for key, (lx, lw, label, role) in self.lane.items():
            backs.append(f'<rect x="{lx:.1f}" y="{self.top:.1f}" width="{lw:.1f}" height="{bottom - self.top:.1f}" rx="14" '
                         f'fill="{lane_fill(role)}" stroke="{_mix(COLOR[role], SHEET, 0.28)}" stroke-width="1.2"/>')
        c.parts[self.mark:self.mark] = backs
        x0 = min(v[0] for v in self.lane.values())
        x1 = max(v[0] + v[1] for v in self.lane.values())
        for text, kind, title in self.after_notes:
            card = c.note(x0 + (14 if kind == "key" else 0), bottom + 28, x1 - x0 - (14 if kind == "key" else 0),
                          text, kind, title)
            bottom = card.bottom
        return bottom
