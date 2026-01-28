import fs from "fs";
import sharp from "sharp";

const input = "public/brand/rinday-isotipo.svg";
const outDir = "public/icons";

fs.mkdirSync(outDir, { recursive: true });

const sizes = [1024, 512, 256, 192, 128, 64, 32, 16];

for (const s of sizes) {
  await sharp(input, { density: 300 })
    .resize(s, s)
    .png()
    .toFile(`${outDir}/icon-${s}.png`);
}

// Maskable icons (Android)
for (const s of [512, 192]) {
  const pad = Math.round(s * 0.12);
  await sharp(input, { density: 300 })
    .resize(s - pad * 2, s - pad * 2)
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 91, g: 95, b: 255, alpha: 1 }, // #5B5FFF
    })
    .png()
    .toFile(`${outDir}/maskable-${s}.png`);
}

// Apple touch icon
await sharp(input, { density: 300 })
  .resize(180, 180)
  .png()
  .toFile(`${outDir}/apple-touch-icon.png`);

console.log("✅ Icons generados en public/icons");
