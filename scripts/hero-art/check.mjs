// Working check: the truck's corner of the scene with the truck taken out, magnified, beside the original.
//   node scripts/hero-art/check.mjs OUT.png
import path from "node:path";
import { N, ROOT, sharp } from "./lib.mjs";
import { cutTruck } from "./truck.mjs";
const { data } = await sharp(path.join(ROOT, "public/brand/hero-art.webp")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const art = new Uint8ClampedArray(data), empty = new Uint8ClampedArray(art);
const { box: B, patch, hole } = await cutTruck(art);
for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) { const q = y * B.w + x, i = ((B.y + y) * N + B.x + x) * 3; for (let c = 0; c < 3; c++) empty[i + c] = art[i + c] * (1 - hole[q]) + patch[q * 3 + c] * hole[q]; }
const crop = { left: 790, top: 880, width: 464, height: 300 };
const a = await sharp(Buffer.from(art.buffer), { raw: { width: N, height: N, channels: 3 } }).extract(crop).resize(crop.width * 2, null, { kernel: "cubic" }).png().toBuffer();
const b = await sharp(Buffer.from(empty.buffer), { raw: { width: N, height: N, channels: 3 } }).extract(crop).resize(crop.width * 2, null, { kernel: "cubic" }).png().toBuffer();
await sharp({ create: { width: crop.width * 2, height: crop.height * 4 + 8, channels: 3, background: "#fff" } }).composite([{ input: a, left: 0, top: 0 }, { input: b, left: 0, top: crop.height * 2 + 8 }]).png().toFile(process.argv[2]);
console.log("ok");
