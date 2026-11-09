const sharp = require('sharp');
const path = require('path');

const svgPath = path.join(__dirname, '..', 'public', 'logo', 'taskhub-icon.svg');
const outDir = path.join(__dirname, '..', 'public');

async function main() {
  // 1. icon-192.png (transparent bg)
  await sharp(svgPath).resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(outDir, 'icon-192.png'));
  console.log('icon-192.png done');

  // 2. icon-512.png (transparent bg)
  await sharp(svgPath).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(outDir, 'icon-512.png'));
  console.log('icon-512.png done');

  // 3. apple-touch-icon 180x180
  await sharp(svgPath).resize(180, 180, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toFile(path.join(outDir, 'apple-touch-icon.png'));
  console.log('apple-touch-icon.png done');

  // 4. maskable 512x512: solid bg + icon centered with ~20% safe padding (icon at 80% = 410px)
  const iconSize = Math.round(512 * 0.8);
  const iconBuf = await sharp(svgPath).resize(iconSize, iconSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toBuffer();
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
  }).composite([{ input: iconBuf, gravity: 'center' }]).png().toFile(path.join(outDir, 'icon-maskable-512.png'));
  console.log('icon-maskable-512.png done');
}

main().catch(e => { console.error(e); process.exit(1); });
