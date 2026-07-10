// Генерация PNG-иконок (48/96/128) без внешних зависимостей:
// градиентный скруглённый квадрат с белой галочкой.
// Chrome не поддерживает SVG-иконки в манифесте, поэтому PNG для всех.

import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "extension", "icons");

// ---------- PNG-кодер ----------

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- Рисование ----------

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// Расстояние от точки до отрезка.
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy), 0, 1);
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// «Расстояние наружу» от скруглённого квадрата.
function roundedRectDist(px, py, size, radius) {
  const half = size / 2 - 1;
  const qx = Math.abs(px - size / 2) - (half - radius);
  const qy = Math.abs(py - size / 2) - (half - radius);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - radius;
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const s = size / 96;
  const radius = 20 * s;
  const checkWidth = 10 * s;
  // Точки галочки в координатах 96x96.
  const p1 = [26 * s, 50 * s];
  const p2 = [42 * s, 66 * s];
  const p3 = [72 * s, 32 * s];

  const c1 = [37, 99, 235]; // #2563eb
  const c2 = [124, 58, 237]; // #7c3aed

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const d = roundedRectDist(px, py, size, radius);
      const bgAlpha = clamp(0.5 - d, 0, 1); // мягкий край 1px
      if (bgAlpha <= 0) continue;

      const t = clamp((px + py) / (2 * size), 0, 1);
      let r = c1[0] + (c2[0] - c1[0]) * t;
      let g = c1[1] + (c2[1] - c1[1]) * t;
      let bcol = c1[2] + (c2[2] - c1[2]) * t;

      // Белая галочка поверх градиента.
      const dCheck = Math.min(
        segDist(px, py, p1[0], p1[1], p2[0], p2[1]),
        segDist(px, py, p2[0], p2[1], p3[0], p3[1])
      );
      const checkAlpha = clamp(checkWidth / 2 - dCheck + 0.5, 0, 1);
      r = r + (255 - r) * checkAlpha;
      g = g + (255 - g) * checkAlpha;
      bcol = bcol + (255 - bcol) * checkAlpha;

      const idx = (y * size + x) * 4;
      rgba[idx] = Math.round(r);
      rgba[idx + 1] = Math.round(g);
      rgba[idx + 2] = Math.round(bcol);
      rgba[idx + 3] = Math.round(255 * bgAlpha);
    }
  }
  return encodePng(size, rgba);
}

fs.mkdirSync(outDir, { recursive: true });
for (const size of [48, 96, 128]) {
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, drawIcon(size));
  console.log("written", file);
}
