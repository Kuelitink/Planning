/**
 * Lecture d'archives zip, chiffrées ou non. Les exports Clue sont des zip protégés par
 * mot de passe en chiffrement « ZipCrypto » (PKWARE traditionnel) : on le déchiffre ici,
 * puis on décompresse avec fflate. Le chiffrement AES (WinZip) n'est pas pris en charge.
 */

import { inflateSync } from 'fflate';

export class ZipError extends Error {
  constructor(
    message: string,
    /** `password` : mot de passe requis ; `wrong-password` : mot de passe refusé. */
    readonly code: 'invalid' | 'password' | 'wrong-password' | 'unsupported' = 'invalid',
  ) {
    super(message);
    this.name = 'ZipError';
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Clés du chiffrement ZipCrypto (APPNOTE 6.1). */
class ZipCrypto {
  private k0 = 0x12345678;
  private k1 = 0x23456789;
  private k2 = 0x34567890;

  constructor(password: Uint8Array) {
    for (const b of password) this.update(b);
  }

  private update(b: number) {
    this.k0 = (CRC_TABLE[(this.k0 ^ b) & 0xff] ^ (this.k0 >>> 8)) >>> 0;
    this.k1 = (Math.imul((this.k1 + (this.k0 & 0xff)) >>> 0, 134775813) + 1) >>> 0;
    this.k2 = (CRC_TABLE[(this.k2 ^ (this.k1 >>> 24)) & 0xff] ^ (this.k2 >>> 8)) >>> 0;
  }

  decrypt(data: Uint8Array): Uint8Array {
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const t = (this.k2 | 2) & 0xffff;
      const c = data[i] ^ ((Math.imul(t, t ^ 1) >>> 8) & 0xff);
      this.update(c);
      out[i] = c;
    }
    return out;
  }
}

interface Entry {
  name: string;
  flags: number;
  method: number;
  crc: number;
  modTime: number;
  compressedSize: number;
  localOffset: number;
}

function centralDirectory(bytes: Uint8Array): Entry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Fin du répertoire central : signature 0x06054b50, cherchée depuis la fin (commentaire ≤ 64 Ko).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError("Ce fichier n'est pas une archive zip.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new ZipError('Archive zip abîmée.');
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    entries.push({
      flags: view.getUint16(p + 8, true),
      method: view.getUint16(p + 10, true),
      modTime: view.getUint16(p + 12, true),
      crc: view.getUint32(p + 16, true),
      compressedSize: view.getUint32(p + 20, true),
      localOffset: view.getUint32(p + 42, true),
      name: decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen)),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(bytes: Uint8Array, e: Entry, password?: string): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const h = e.localOffset;
  if (view.getUint32(h, true) !== 0x04034b50) throw new ZipError('Archive zip abîmée.');
  const start = h + 30 + view.getUint16(h + 26, true) + view.getUint16(h + 28, true);
  let data = bytes.subarray(start, start + e.compressedSize);

  if (e.method === 99)
    throw new ZipError('Chiffrement AES non pris en charge : décompresse le zip puis importe les fichiers .json.', 'unsupported');
  if (e.flags & 1) {
    if (!password) throw new ZipError('Cette archive est protégée par un mot de passe.', 'password');
    const crypto = new ZipCrypto(new TextEncoder().encode(password));
    const head = crypto.decrypt(data.subarray(0, 12));
    // Dernier octet de l'en-tête : octet de poids fort du CRC (ou de l'heure si bit 3).
    const check = e.flags & 8 ? (e.modTime >>> 8) & 0xff : (e.crc >>> 24) & 0xff;
    if (head[11] !== check) throw new ZipError('Mot de passe incorrect.', 'wrong-password');
    data = crypto.decrypt(data.subarray(12));
  }

  let out: Uint8Array;
  if (e.method === 0) out = data;
  else if (e.method === 8) {
    try {
      out = inflateSync(data);
    } catch {
      throw new ZipError(e.flags & 1 ? 'Mot de passe incorrect.' : 'Archive zip abîmée.', e.flags & 1 ? 'wrong-password' : 'invalid');
    }
  } else throw new ZipError(`Compression non prise en charge (méthode ${e.method}).`, 'unsupported');

  if (crc32(out) !== e.crc)
    throw new ZipError(e.flags & 1 ? 'Mot de passe incorrect.' : 'Archive zip abîmée.', e.flags & 1 ? 'wrong-password' : 'invalid');
  return out;
}

/** L'archive contient-elle des fichiers chiffrés ? */
export function zipIsEncrypted(bytes: Uint8Array): boolean {
  return centralDirectory(bytes).some((e) => e.flags & 1);
}

/** Contenu des fichiers de l'archive (dossiers ignorés), par chemin. `accept` filtre par nom. */
export function readZip(bytes: Uint8Array, password?: string, accept: (name: string) => boolean = () => true): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  for (const e of centralDirectory(bytes)) {
    if (e.name.endsWith('/') || !accept(e.name)) continue;
    files.set(e.name, readEntry(bytes, e, password));
  }
  return files;
}
