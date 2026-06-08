// Generates BulgaPop PWA icons as PNGs with no external dependencies.
// A glossy bubble on a violet→pink gradient (full-bleed → maskable-safe).
import zlib from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public");
mkdirSync(OUT, { recursive: true });

function crc32(buf) {
  let c = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(n, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = n * 4;
  const raw = Buffer.alloc((stride + 1) * n);
  for (let y = 0; y < n; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const lerp = (a, b, t) => a + (b - a) * t;

function drawIcon(n) {
  const buf = Buffer.alloc(n * n * 4);
  const set = (x, y, r, g, b) => {
    const i = (y * n + x) * 4;
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = 255;
  };
  const blend = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= n || y >= n || a <= 0) return;
    const i = (y * n + x) * 4;
    const k = Math.min(a, 1);
    buf[i] = buf[i] * (1 - k) + r * k;
    buf[i + 1] = buf[i + 1] * (1 - k) + g * k;
    buf[i + 2] = buf[i + 2] * (1 - k) + b * k;
    buf[i + 3] = 255;
  };
  // background: diagonal violet -> pink
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const t = (x + y) / (2 * n);
      set(x, y, Math.round(lerp(138, 255, t)), Math.round(lerp(92, 93, t)), Math.round(lerp(255, 143, t)));
    }

  const circle = (cx, cy, rad, r, g, b, maxA) => {
    const x0 = Math.max(0, Math.floor(cx - rad - 2));
    const x1 = Math.min(n - 1, Math.ceil(cx + rad + 2));
    const y0 = Math.max(0, Math.floor(cy - rad - 2));
    const y1 = Math.min(n - 1, Math.ceil(cy + rad + 2));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy) - rad;
        const cov = Math.max(0, Math.min(1, 0.5 - d)); // 1px feather
        if (cov > 0) blend(x, y, r, g, b, cov * maxA);
      }
  };

  // little accent bubbles
  circle(n * 0.78, n * 0.26, n * 0.07, 255, 255, 255, 0.5);
  circle(n * 0.24, n * 0.74, n * 0.05, 255, 255, 255, 0.45);
  // main bubble
  const cx = n * 0.5,
    cy = n * 0.53,
    R = n * 0.3;
  circle(cx, cy, R, 255, 255, 255, 0.92);
  // soft tinted rim for depth
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dd = Math.hypot(x - cx, y - cy);
      if (dd < R && dd > R - n * 0.045) blend(x, y, 138, 92, 255, 0.12);
    }
  // gloss highlight
  circle(cx - R * 0.32, cy - R * 0.36, R * 0.22, 255, 255, 255, 0.95);
  circle(cx + R * 0.28, cy + R * 0.34, R * 0.08, 255, 255, 255, 0.5);

  return png(n, buf);
}

for (const n of [192, 512, 180]) {
  const name = n === 180 ? "apple-touch-icon.png" : `icon-${n}.png`;
  writeFileSync(join(OUT, name), drawIcon(n));
  console.log("wrote", name);
}
