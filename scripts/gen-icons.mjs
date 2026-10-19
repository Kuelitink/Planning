// Génère les icônes PNG de la PWA et de l'appli Android (sans dépendance) : node scripts/gen-icons.mjs
// Motif « Grille » : mini-calendrier 3×3 de pastilles aux couleurs des listes, aujourd'hui
// en noir, sur fond blanc. Même dessin que public/icon.svg (repère 200×200).
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BG = hex('#FFFFFF');
const EMPTY = hex('#EEF1F5');
/** Pastilles, ligne par ligne. */
const TILES = [
  ['#BBD3FF', null, '#D9C6FF'],
  [null, '#1C1F26', '#B8EBD3'],
  ['#FFD0AE', null, null],
].map((row) => row.map((c) => (c ? hex(c) : EMPTY)));
const TILE_POS = [36, 82, 128].map((v) => v / 200);
const TILE_SIZE = 36 / 200;
const TILE_RADIUS = 11 / 200;

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

/** Distance signée à un rectangle arrondi (négatif = dedans), coordonnées unitaires. */
const roundRectDist = (px, py, x, y, w, h, r) => {
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r);
  const qy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

/** Couleur du motif au point (u, v) du repère unitaire. */
function colorAt(u, v) {
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (roundRectDist(u, v, TILE_POS[col], TILE_POS[row], TILE_SIZE, TILE_SIZE, TILE_RADIUS) <= 0) return TILES[row][col];
    }
  }
  return BG;
}

/**
 * `radius` : arrondi du fond (0 = carré plein, pour les icônes « maskable » et Apple).
 * `scale` < 1 rétrécit le motif vers le centre (zone sûre des icônes « maskable »).
 */
function render(size, { radius, scale }) {
  const SS = 4;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let a = 0;
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          if (radius > 0 && roundRectDist(u, v, 0, 0, 1, 1, radius) > 0) continue;
          const c = colorAt(0.5 + (u - 0.5) / scale, 0.5 + (v - 0.5) / scale);
          a++;
          for (let i = 0; i < 3; i++) sum[i] += c[i];
        }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let i = 0; i < 3; i++) raw[o + i] = a ? Math.round(sum[i] / a) : 0;
      raw[o + 3] = Math.round((a / (SS * SS)) * 255);
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

// Appli Android : icône classique, ronde, et premier plan de l'icône adaptative (108 dp, motif
// dans la zone sûre de 66 dp ; fond blanc = @color/ic_launcher_background).
const res = new URL('../android/app/src/main/res/', import.meta.url);
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, k] of Object.entries(DENSITIES)) {
  const dir = new URL(`mipmap-${name}/`, res);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('ic_launcher.png', dir), render(48 * k, { radius: 0.22, scale: 1 }));
  writeFileSync(new URL('ic_launcher_round.png', dir), render(48 * k, { radius: 0.5, scale: 0.85 }));
  writeFileSync(new URL('ic_launcher_foreground.png', dir), render(108 * k, { radius: 0, scale: 0.7 }));
}
console.log('Icônes Android écrites dans android/app/src/main/res/');
