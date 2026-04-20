"""
Generate a transparent-background CareKosh logo PNG for the login /
register screens.

One-time script; the output PNG is committed to the repo.
Run from the vitaltrack-mobile/ directory:

    python scripts/generate-transparent-logo.py

Why this exists: the launcher icon (assets/icon.png) uses very low-opacity
amber strokes on a white background, which looks great on the Android
launcher but disappears on the dark login screen and shows a visible white
rectangle if used directly. This script renders a bolder version of the
same "home ICU" motif with full-opacity amber strokes on a true alpha
channel, so the glyph composites cleanly on any background.
"""
from PIL import Image, ImageDraw

SIZE = 512
AMBER = (138, 104, 48, 255)       # #8a6830 brand color, full opacity
AMBER_SOFT = (138, 104, 48, 180)  # secondary details


def rounded_line(draw, p1, p2, width, color):
    """Line with rounded caps. Pillow's line caps aren't round by default."""
    draw.line([p1, p2], fill=color, width=width)
    r = max(1, width // 2)
    for (x, y) in (p1, p2):
        draw.ellipse([(x - r, y - r), (x + r, y + r)], fill=color)


img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# --- House outline (rounded-corner pentagon: roof peak + walls) ---------
# Peak at top, walls straight, bottom corners rounded.
peak_y = 110
wall_top_y = 205
bottom_y = 432
left_x = 108
right_x = 404
corner_r = 22

# Roof triangle — from peak down to wall_top corners
roof = [
    (256, peak_y),
    (right_x, wall_top_y),
    (left_x, wall_top_y),
]
draw.polygon(roof, outline=AMBER)
# Thicken roof edges manually (polygon outline is 1px in Pillow)
draw.line([(256, peak_y), (right_x, wall_top_y)], fill=AMBER, width=7)
draw.line([(right_x, wall_top_y), (left_x, wall_top_y)], fill=AMBER, width=7)
draw.line([(left_x, wall_top_y), (256, peak_y)], fill=AMBER, width=7)

# Walls — left, right, bottom with rounded bottom corners
draw.line([(left_x, wall_top_y), (left_x, bottom_y - corner_r)], fill=AMBER, width=7)
draw.line([(right_x, wall_top_y), (right_x, bottom_y - corner_r)], fill=AMBER, width=7)
draw.line([(left_x + corner_r, bottom_y), (right_x - corner_r, bottom_y)], fill=AMBER, width=7)
# Bottom-left rounded corner (arc)
draw.arc(
    [(left_x, bottom_y - 2 * corner_r), (left_x + 2 * corner_r, bottom_y)],
    start=90, end=180, fill=AMBER, width=7,
)
# Bottom-right rounded corner
draw.arc(
    [(right_x - 2 * corner_r, bottom_y - 2 * corner_r), (right_x, bottom_y)],
    start=0, end=90, fill=AMBER, width=7,
)

# --- Chimney ------------------------------------------------------------
chimney_x = 340
chimney_top = 145
chimney_bottom = 200
draw.rectangle(
    [(chimney_x, chimney_top), (chimney_x + 26, chimney_bottom)],
    outline=AMBER, width=5,
)

# --- Medical cross in roof gable ---------------------------------------
cross_cx, cross_cy = 256, 168
cross_long, cross_short = 46, 16
# Horizontal bar
draw.rounded_rectangle(
    [(cross_cx - cross_long // 2, cross_cy - cross_short // 2),
     (cross_cx + cross_long // 2, cross_cy + cross_short // 2)],
    radius=5, fill=AMBER,
)
# Vertical bar
draw.rounded_rectangle(
    [(cross_cx - cross_short // 2, cross_cy - cross_long // 2),
     (cross_cx + cross_short // 2, cross_cy + cross_long // 2)],
    radius=5, fill=AMBER,
)

# --- Shelf lines inside the house body ---------------------------------
shelf1_y = 282
shelf2_y = 352
draw.line([(left_x + 16, shelf1_y), (right_x - 16, shelf1_y)], fill=AMBER_SOFT, width=3)
draw.line([(left_x + 16, shelf2_y), (right_x - 16, shelf2_y)], fill=AMBER_SOFT, width=3)

# --- Row 1: medicine bottle, syringe, IV bag, O2 cylinder -------------
# Medicine bottle
draw.rounded_rectangle([(138, 230), (178, 278)], radius=6, outline=AMBER, width=4)
draw.rectangle([(146, 218), (170, 232)], outline=AMBER, width=3)  # cap

# Syringe barrel + plunger
draw.rounded_rectangle([(200, 234), (236, 272)], radius=4, outline=AMBER, width=4)
draw.line([(218, 222), (218, 236)], fill=AMBER, width=3)          # plunger
draw.line([(236, 253), (254, 253)], fill=AMBER, width=3)          # needle

# IV bag (trapezoidal)
iv_pts = [(272, 226), (318, 226), (312, 276), (278, 276)]
draw.polygon(iv_pts, outline=AMBER)
for i in range(len(iv_pts)):
    draw.line([iv_pts[i], iv_pts[(i + 1) % len(iv_pts)]], fill=AMBER, width=4)
# IV drip line
draw.line([(295, 276), (295, 282)], fill=AMBER, width=3)

# O2 cylinder
draw.rounded_rectangle([(340, 232), (376, 278)], radius=18, outline=AMBER, width=4)
draw.rectangle([(350, 222), (366, 234)], outline=AMBER, width=3)  # valve

# --- Row 2: heartbeat / ECG line --------------------------------------
hb_y = 320
ecg_points = [
    (left_x + 20, hb_y),
    (150, hb_y), (160, hb_y - 18), (172, hb_y + 22),
    (184, hb_y - 8), (196, hb_y), (right_x - 20, hb_y),
]
for i in range(len(ecg_points) - 1):
    draw.line([ecg_points[i], ecg_points[i + 1]], fill=AMBER, width=4)

# --- Row 3: door -------------------------------------------------------
door_left, door_right = 218, 294
door_top, door_bottom = 370, 430
draw.rounded_rectangle(
    [(door_left, door_top), (door_right, door_bottom)],
    radius=6, outline=AMBER, width=4,
)
# Door knob
draw.ellipse([(282, 397), (290, 405)], fill=AMBER)

# ---------------------------------------------------------------------
img.save('assets/carekosh-logo-transparent.png', 'PNG')
print(f'Generated assets/carekosh-logo-transparent.png ({SIZE}x{SIZE} with alpha)')
