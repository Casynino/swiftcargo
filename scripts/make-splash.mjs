/*
  The iPhone launch pictures: the app's dark ground with the app tile in the
  middle, one per iPhone screen size, so the home-screen app opens on its own
  colour instead of a white flash. Run once after the icon changes:
    node scripts/make-splash.mjs
*/
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SIZES = [
  [440, 956, 3], [430, 932, 3], [428, 926, 3], [420, 912, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3],
  [402, 874, 3], [393, 852, 3], [390, 844, 3], [375, 812, 3], [375, 667, 2], [320, 568, 2],
];
const GROUND = { r: 10, g: 14, b: 26, alpha: 1 };

mkdirSync("public/brand/splash", { recursive: true });
for (const [w, h, r] of SIZES) {
  const W = w * r, H = h * r;
  const tile = Math.round(Math.min(W, H) * 0.3);
  const radius = Math.round(tile * 0.225);
  const mask = Buffer.from(`<svg width="${tile}" height="${tile}"><rect width="${tile}" height="${tile}" rx="${radius}" fill="#fff"/></svg>`);
  const icon = await sharp("public/brand/app-512.png").resize(tile, tile).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  await sharp({ create: { width: W, height: H, channels: 4, background: GROUND } })
    .composite([{ input: icon, left: Math.round((W - tile) / 2), top: Math.round((H - tile) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(`public/brand/splash/${w}x${h}@${r}.png`);
}
await sharp("public/brand/app-maskable-512.png").resize(192, 192).png().toFile("public/brand/app-maskable-192.png");
console.log("done");
