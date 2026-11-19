"""Tiny, dependency-free SVG helpers for the CareKosh documentation diagrams.

Design rules (see docs/diagrams/README.md):
* real <text> (searchable, translatable, readable by screen readers through <title>/<desc>);
* 15–18 px text at 1:1 scale, generous spacing, role colours that are also distinguishable
  by border style (dashed = conditional/optional), so colour is never the only signal;
* light background baked in, so the image stays legible on dark pages and in print.
"""

from __future__ import annotations

import html
from dataclasses import dataclass, field

FONT = "-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"

# role -> (fill, stroke, dashed)
ROLES = {
    "core": ("#E7F0FB", "#1F5FA8", False),        # required application components
    "infra": ("#E3F3EF", "#1B7563", False),       # supporting infrastructure
    "provider": ("#FFF3DB", "#8F5B00", False),     # current provider, swappable
    "conditional": ("#F1ECFA", "#5E4596", True),   # only when configured / opt-in
    "external": ("#F1F2F4", "#4A5260", False),     # people, devices, outside systems
    "danger": ("#FCEBEA", "#A8261D", False),       # errors, refusals, rollback
    "ok": ("#E6F4EA", "#1E6B34", False),           # success outcome
    "note": ("#FFF8D6", "#7A6A00", False),         # explanatory note
    "plain": ("#FFFFFF", "#4A5260", False),
}
TEXT = "#16191D"
MUTED = "#4A5260"

def esc(value: str) -> str:
    return html.escape(value, quote=True)


def wrap(text: str, width_px: float, size: float, mono: bool = False) -> list[str]:
    """Greedy word wrap using an average glyph width estimate."""
    char = size * (0.61 if mono else 0.51)
    limit = max(4, int(width_px / char))
    lines: list[str] = []
    for paragraph in text.split("\n"):
        words, line = paragraph.split(" "), ""
        for word in words:
            candidate = f"{line} {word}".strip()
            if len(candidate) <= limit or not line:
                line = candidate
            else:
                lines.append(line)
                line = word
        lines.append(line)
    return lines


@dataclass
class Svg:
    width: int
    height: int
    title: str
    desc: str
    parts: list[str] = field(default_factory=list)

    # ----------------------------------------------------------------- primitives
    def text(self, x: float, y: float, value: str, size: float = 16, weight: int = 400,
             anchor: str = "start", color: str = TEXT, mono: bool = False, italic: bool = False) -> None:
        family = MONO if mono else FONT
        style = ' font-style="italic"' if italic else ""
        self.parts.append(
            f'<text x="{x:.1f}" y="{y:.1f}" font-family="{family}" font-size="{size}" font-weight="{weight}"'
            f' fill="{color}" text-anchor="{anchor}"{style}>{esc(value)}</text>')

    def lines(self, x: float, y: float, values: list[str], size: float = 16, weight: int = 400,
              anchor: str = "start", color: str = TEXT, gap: float = 1.32, mono: bool = False) -> float:
        for i, value in enumerate(values):
            self.text(x, y + i * size * gap, value, size, weight, anchor, color, mono)
        return y + len(values) * size * gap

    def rect(self, x: float, y: float, w: float, h: float, role: str = "plain", radius: float = 12,
             stroke_width: float = 2) -> None:
        fill, stroke, dashed = ROLES[role]
        dash = ' stroke-dasharray="8 6"' if dashed else ""
        self.parts.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{radius}" fill="{fill}"'
            f' stroke="{stroke}" stroke-width="{stroke_width}"{dash}/>')

    def box(self, x: float, y: float, w: float, h: float, title: str, body: str | list[str] = "",
            role: str = "core", title_size: float = 17, body_size: float = 15, mono_body: bool = False,
            align: str = "start", tag: str | None = None) -> None:
        self.rect(x, y, w, h, role)
        pad = 14
        tx = x + pad if align == "start" else x + w / 2
        ty = y + pad + title_size
        title_lines = wrap(title, w - 2 * pad, title_size)
        ty = self.lines(tx, ty, title_lines, title_size, 700, align, ROLES[role][1] if role not in {"plain", "note"} else TEXT)
        if body:
            text_lines: list[str] = []
            for chunk in ([body] if isinstance(body, str) else body):
                text_lines.extend(wrap(chunk, w - 2 * pad, body_size, mono_body))
            self.lines(tx, ty + 4, text_lines, body_size, 400, align, TEXT, mono=mono_body)
        if tag:
            self.pill(x + w - 12, y - 11, tag, role, anchor="end")

    @staticmethod
    def measure(w: float, title: str, body: str | list[str] = "", title_size: float = 17, body_size: float = 15,
                mono_body: bool = False) -> float:
        """Height that box() needs for this content."""
        h = 14 + len(wrap(title, w - 28, title_size)) * title_size * 1.32
        if body:
            for chunk in ([body] if isinstance(body, str) else body):
                h += len(wrap(chunk, w - 28, body_size, mono_body)) * body_size * 1.32
            h += 4
        return h + 16

    def auto_box(self, x: float, y: float, w: float, title: str, body: str | list[str] = "", role: str = "core",
                 min_h: float = 0, **kw) -> float:
        h = max(min_h, self.measure(w, title, body))
        self.box(x, y, w, h, title, body, role, **kw)
        return h

    def pill(self, x: float, y: float, label: str, role: str = "plain", anchor: str = "start", size: float = 13) -> None:
        width = len(label) * size * 0.58 + 18
        left = x - width if anchor == "end" else x
        fill, stroke, dashed = ROLES[role]
        dash = ' stroke-dasharray="5 4"' if dashed else ""
        self.parts.append(f'<rect x="{left:.1f}" y="{y:.1f}" width="{width:.1f}" height="{size + 9}" rx="{(size + 9) / 2}"'
                          f' fill="#FFFFFF" stroke="{stroke}" stroke-width="1.5"{dash}/>')
        self.text(left + width / 2, y + size + 2.5, label, size, 600, "middle", stroke)

    def arrow(self, points: list[tuple[float, float]], label: str = "", dashed: bool = False, color: str = "#2B3138",
              label_at: float = 0.5, label_dy: float = -8, size: float = 15, both: bool = False,
              label_anchor: str = "middle", width: float = 2.2) -> None:
        d = "M " + " L ".join(f"{px:.1f} {py:.1f}" for px, py in points)
        dash = ' stroke-dasharray="7 6"' if dashed else ""
        start = ' marker-start="url(#arrow-start)"' if both else ""
        self.parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}"{dash}'
                          f' marker-end="url(#arrow)"{start}/>')
        if label:
            # place label on the longest segment
            segs = list(zip(points, points[1:]))
            (x1, y1), (x2, y2) = max(segs, key=lambda s: abs(s[1][0] - s[0][0]) + abs(s[1][1] - s[0][1]))
            lx, ly = x1 + (x2 - x1) * label_at, y1 + (y2 - y1) * label_at
            for i, line in enumerate(label.split("\n")):
                self.text_halo(lx, ly + label_dy + i * size * 1.25, line, size, label_anchor)

    def text_halo(self, x: float, y: float, value: str, size: float = 15, anchor: str = "middle",
                  weight: int = 500, color: str = TEXT, mono: bool = False) -> None:
        family = MONO if mono else FONT
        self.parts.append(
            f'<text x="{x:.1f}" y="{y:.1f}" font-family="{family}" font-size="{size}" font-weight="{weight}"'
            f' fill="{color}" text-anchor="{anchor}" stroke="#FFFFFF" stroke-width="5" paint-order="stroke"'
            f' stroke-linejoin="round">{esc(value)}</text>')

    def line(self, x1: float, y1: float, x2: float, y2: float, dashed: bool = True, color: str = "#8A929E",
             width: float = 1.6) -> None:
        dash = ' stroke-dasharray="6 6"' if dashed else ""
        self.parts.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}"'
                          f' stroke-width="{width}"{dash}/>')

    def heading(self, value: str, sub: str = "") -> None:
        self.text(40, 52, value, 26, 700)
        if sub:
            self.lines(40, 84, wrap(sub, self.width - 80, 16), 16, 400, color=MUTED)

    def legend(self, x: float, y: float, roles: list[tuple[str, str]]) -> None:
        cx = x
        for role, label in roles:
            fill, stroke, dashed = ROLES[role]
            dash = ' stroke-dasharray="5 4"' if dashed else ""
            self.parts.append(f'<rect x="{cx:.1f}" y="{y:.1f}" width="26" height="18" rx="4" fill="{fill}"'
                              f' stroke="{stroke}" stroke-width="2"{dash}/>')
            self.text(cx + 34, y + 14, label, 14, 500, color=MUTED)
            cx += 34 + len(label) * 14 * 0.55 + 28

    # ----------------------------------------------------------------- output
    def render(self) -> str:
        defs = (
            '<defs>'
            '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">'
            '<path d="M 0 0 L 10 5 L 0 10 z" fill="#2B3138"/></marker>'
            '<marker id="arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto">'
            '<path d="M 10 0 L 0 5 L 10 10 z" fill="#2B3138"/></marker>'
            '</defs>'
        )
        body = "\n".join(self.parts)
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.width} {self.height}" width="{self.width}"'
            f' height="{self.height}" role="img" aria-labelledby="t d">\n'
            f'<title id="t">{esc(self.title)}</title>\n<desc id="d">{esc(self.desc)}</desc>\n{defs}\n'
            f'<rect width="100%" height="100%" fill="#FFFFFF"/>\n{body}\n</svg>\n'
        )


class Sequence:
    """Left-to-right participants with lifelines; messages are added top to bottom."""

    def __init__(self, svg: Svg, participants: list[tuple[str, str, str]], top: float = 130,
                 left: float = 40, right_margin: float = 40, box_h: float = 64, head_size: float = 16):
        self.svg = svg
        self.top = top
        n = len(participants)
        usable = svg.width - left - right_margin
        self.col = usable / n
        self.x = {}
        for i, (key, label, role) in enumerate(participants):
            cx = left + self.col * (i + 0.5)
            self.x[key] = cx
            w = self.col - 24
            svg.box(cx - w / 2, top, w, box_h, label, role=role, title_size=head_size, align="middle")
        self.y = top + box_h + 34
        self.bottom_pad = 30
        self.box_h = box_h
        self.keys = [p[0] for p in participants]
        self.insert_at = len(svg.parts)

    def finish(self, end_y: float | None = None) -> None:
        """Insert lifelines just after the participant boxes so they sit beneath messages."""
        end = end_y or (self.y - 10)
        self.svg.height = int(max(end, self.y) + 30)
        lifelines = [
            f'<line x1="{self.x[k]:.1f}" y1="{self.top + self.box_h:.1f}" x2="{self.x[k]:.1f}" y2="{end:.1f}"'
            f' stroke="#9AA2AE" stroke-width="1.6" stroke-dasharray="6 6"/>'
            for k in self.keys
        ]
        self.svg.parts[self.insert_at:self.insert_at] = lifelines

    def msg(self, a: str, b: str, label: str, dashed: bool = False, step: int | None = None, gap: float = 58,
            color: str = "#2B3138", size: float = 15) -> None:
        x1, x2 = self.x[a], self.x[b]
        label_lines = label.split("\n")
        extra = (len(label_lines) - 1) * size * 1.25
        self.y += extra
        prefix = f"{step}. " if step is not None else ""
        if a == b:
            pts = [(x1, self.y - 10), (x1 + 60, self.y - 10), (x1 + 60, self.y + 14), (x1 + 6, self.y + 14)]
            self.svg.arrow(pts, dashed=dashed, color=color)
            for i, line in enumerate(label_lines):
                self.svg.text_halo(x1 + 70, self.y - 4 - extra + i * size * 1.25, (prefix if i == 0 else "") + line,
                                   size, "start")
            self.y += gap + 10
            return
        offset = 8 if x2 > x1 else -8
        self.svg.arrow([(x1, self.y), (x2 - offset, self.y)], dashed=dashed, color=color)
        mid = (x1 + x2) / 2
        for i, line in enumerate(label_lines):
            self.svg.text_halo(mid, self.y - 10 - extra + i * size * 1.25, (prefix if i == 0 else "") + line, size)
        self.y += gap

    def note(self, a: str, b: str, text: str, role: str = "note", size: float = 15, pad: float = 10) -> None:
        x1, x2 = sorted((self.x[a], self.x[b]))
        x1 -= self.col * 0.42
        x2 += self.col * 0.42
        lines = wrap(text, x2 - x1 - 2 * pad, size)
        h = len(lines) * size * 1.32 + 2 * pad
        self.svg.rect(x1, self.y - 18, x2 - x1, h, role, radius=8, stroke_width=1.6)
        self.svg.lines(x1 + pad, self.y - 18 + pad + size, lines, size)
        self.y += h + 26

    def divider(self, text: str) -> None:
        self.svg.line(30, self.y - 10, self.svg.width - 30, self.y - 10, dashed=False, color="#C9CED6", width=1.2)
        self.svg.text_halo(44, self.y + 12, text, 16, "start", 700, MUTED)
        self.y += 44
