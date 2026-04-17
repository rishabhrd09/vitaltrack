const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgSource = fs.readFileSync(path.join(__dirname, '../assets/icon-source.svg'));

const sizes = [
  { name: 'icon.png', size: 1024 },
  { name: 'adaptive-icon.png', size: 1024 },
  { name: 'splash-icon.png', size: 512 },
  { name: 'favicon.png', size: 48 },
];

async function generate() {
  for (const { name, size } of sizes) {
    await sharp(svgSource)
      .resize(size, size)
      .png()
      .toFile(path.join(__dirname, '../assets', name));
    console.log(`Generated ${name} at ${size}x${size}`);
  }
}

generate().catch(console.error);
