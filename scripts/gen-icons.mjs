// Génère les icônes PNG de la PWA (sans dépendance) : node scripts/gen-icons.mjs
// Motif provisoire : coche dans un cercle, blanc sur encre. Même dessin que public/icon.svg.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [0x14, 0x16, 0x1a];
const FG = [0xff, 0xff, 0xff];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const roundRectDist = (px, py, radius) => {
  const qx = Math.abs(px - 0.5) - (0.5 - radius);
  const qy = Math.abs(py - 0.5) - (0.5 - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
};

/** Coordonnées unitaires (0–1). `scale` < 1 rétrécit le motif (zone sûre des icônes « maskable »). */
function render(size, { radius, scale }) {
  const SS = 4;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const half = 0.035; // demi-épaisseur du trait
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          if (roundRectDist(u, v, radius) > 0) continue;
          bg++;
          const gu = 0.5 + (u - 0.5) / scale;
          const gv = 0.5 + (v - 0.5) / scale;
          const ring = Math.abs(Math.hypot(gu - 0.5, gv - 0.5) - 0.27) - half;
          const check = Math.min(segDist(gu, gv, 0.39, 0.51, 0.47, 0.59), segDist(gu, gv, 0.47, 0.59, 0.62, 0.43)) - half;
          if (Math.min(ring, check) <= 0) fg++;
        }
      }
      const n = SS * SS;
      const a = bg / n;
      const t = bg ? fg / bg : 0;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(BG[i] * (1 - t) + FG[i] * t);
      raw[o + 3] = Math.round(a * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../public/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), render(192, { radius: 0.22, scale: 1 }));
writeFileSync(new URL('icon-512.png', out), render(512, { radius: 0.22, scale: 1 }));
writeFileSync(new URL('icon-maskable-512.png', out), render(512, { radius: 0, scale: 0.8 }));
writeFileSync(new URL('apple-touch-icon.png', out), render(180, { radius: 0, scale: 0.9 }));
console.log('Icônes écrites dans public/');
