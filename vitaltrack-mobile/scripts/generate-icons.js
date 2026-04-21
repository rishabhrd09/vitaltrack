/**
 * Regenerate all icon PNGs from the SVG sources.
 *
 * Two SVG sources exist because the launcher icon and the login/register
 * logo live on different backgrounds:
 *
 *   assets/icon-source.svg       — light-variant, white background, dark
 *                                  amber strokes (#604820). Used for every
 *                                  launcher / splash / favicon asset.
 *   assets/logo-source-dark.svg  — dark-variant, transparent background,
 *                                  warm amber strokes (#c4a060). Used for
 *                                  the login and register screens so the
 *                                  glyph reads cleanly on the dark UI.
 *
 * Outputs:
 *   - icon.png (1024)                — generic app icon
 *   - adaptive-icon.png (1024)       — Android adaptive foreground
 *   - splash-icon.png (512)          — splash screen
 *   - favicon.png (48)               — web favicon
 *   - carekosh-logo-transparent.png  — login/register (dark-variant, 512)
 *
 * Run from vitaltrack-mobile/:
 *     node scripts/generate-icons.js
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const lightSvg = fs.readFileSync(path.join(__dirname, '../assets/icon-source.svg'));
const darkSvg = fs.readFileSync(path.join(__dirname, '../assets/logo-source-dark.svg'));
const markSvg = fs.readFileSync(path.join(__dirname, '../assets/icon-mark.svg'));
const markDarkSvg = fs.readFileSync(path.join(__dirname, '../assets/icon-mark-dark.svg'));

const renders = [
  { input: lightSvg,    name: 'icon.png',                       size: 1024 },
  { input: lightSvg,    name: 'adaptive-icon.png',              size: 1024 },
  { input: lightSvg,    name: 'splash-icon.png',                size: 512 },
  { input: lightSvg,    name: 'favicon.png',                    size: 48 },
  { input: darkSvg,     name: 'carekosh-logo-transparent.png',  size: 512 },
  // Dashboard top bar mark — two theme-specific variants.
  // Light-mode mark: dark amber strokes (#8a6830), used when !isDarkMode.
  { input: markSvg,     name: 'carekosh-mark.png',              size: 256 },
  // Dark-mode mark: warm gold strokes (#d4b670), used when isDarkMode.
  { input: markDarkSvg, name: 'carekosh-mark-dark.png',         size: 256 },
];

async function generate() {
  for (const { input, name, size } of renders) {
    await sharp(input)
      .resize(size, size)
      .png()
      .toFile(path.join(__dirname, '../assets', name));
    console.log(`Generated ${name} at ${size}x${size}`);
  }
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
