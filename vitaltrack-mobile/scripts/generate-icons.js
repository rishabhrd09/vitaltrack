/**
 * Regenerate all icon PNGs from assets/icon-source.svg.
 *
 * Outputs:
 *   - icon.png (1024)              — generic app icon
 *   - adaptive-icon.png (1024)     — Android adaptive foreground
 *   - splash-icon.png (512)        — splash screen
 *   - favicon.png (48)             — web favicon
 *   - carekosh-logo-transparent.png (512) — login/register screen. Same
 *     artwork as the app icon but rendered with a TRANSPARENT background
 *     (white <rect> stripped) so it composites cleanly on the dark
 *     auth-screen background instead of showing a white rectangle.
 *
 * Run from vitaltrack-mobile/:
 *     node scripts/generate-icons.js
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '../assets/icon-source.svg');
const svgSource = fs.readFileSync(svgPath);

// A parallel SVG used for the login logo: the master artwork with its
// white background <rect> removed so the PNG has a true alpha channel.
// The regex targets the specific opening rect we put in the source SVG.
const transparentSvg = Buffer.from(
  svgSource
    .toString('utf8')
    .replace(/\s*<rect\s+width="512"\s+height="512"\s+fill="#ffffff"\/>\s*/u, '\n  '),
);

const renders = [
  { input: svgSource,     name: 'icon.png',                        size: 1024 },
  { input: svgSource,     name: 'adaptive-icon.png',               size: 1024 },
  { input: svgSource,     name: 'splash-icon.png',                 size: 512 },
  { input: svgSource,     name: 'favicon.png',                     size: 48 },
  { input: transparentSvg, name: 'carekosh-logo-transparent.png',   size: 512 },
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
