"""
Generate a transparent-background CareKosh logo PNG.

One-time script; the output PNG is committed to the repo.
Run from the vitaltrack-mobile/ directory:

    python scripts/generate-transparent-logo.py

Why this exists: the launcher icon (assets/icon.png) has a baked-in white
background, which renders as a visible white rectangle on the dark login
screen. This script produces a glyph-only logo with a true alpha channel so
it composites cleanly on any background.
"""
from PIL import Image, ImageDraw

SIZE = 240
AMBER = (138, 104, 48, 255)  # #8a6830 brand color

img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# House body outline
house_left, house_right = 50, 190
house_top, house_bottom = 90, 200
draw.rectangle(
    [(house_left, house_top), (house_right, house_bottom)],
    outline=AMBER, width=6,
)

# Roof triangle
draw.polygon(
    [(house_left - 5, house_top), (SIZE // 2, 40), (house_right + 5, house_top)],
    outline=AMBER, width=6,
)

# Medical cross in gable
cross_x, cross_y = SIZE // 2, 70
draw.rectangle([(cross_x - 3, cross_y - 14), (cross_x + 3, cross_y + 14)], fill=AMBER)
draw.rectangle([(cross_x - 14, cross_y - 3), (cross_x + 14, cross_y + 3)], fill=AMBER)

# Door
draw.rectangle(
    [(SIZE // 2 - 15, 155), (SIZE // 2 + 15, 200)],
    outline=AMBER, width=4,
)

img.save('assets/carekosh-logo-transparent.png', 'PNG')
print('Generated assets/carekosh-logo-transparent.png (240x240 with alpha)')
