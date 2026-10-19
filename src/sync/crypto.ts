/**
 * Chiffrement de la sauvegarde avant son envoi sur GitHub : AES-GCM 256 bits, clé dérivée du
 * mot de passe par PBKDF2-SHA-256 (600 000 itérations, sel aléatoire). Le fichier envoyé
 * (« enveloppe ») contient le sel, le vecteur d'initialisation et le texte chiffré : sans le
 * mot de passe, il est illisible, y compris pour GitHub.
 */

export const ITERATIONS = 600_000;
export const ENVELOPE_APP = 'planning-sauvegarde';

export interface Kdf {
  name: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  /** Sel, en base64. */
  salt: string;
}

export interface Envelope {
  app: typeof ENVELOPE_APP;
  version: 1;
  kdf: Kdf;
  cipher: { name: 'AES-GCM'; iv: string };
  /** Données chiffrées, en base64. */
  data: string;
  savedAt: string;
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Mot de passe incorrect pour cette sauvegarde.');
    this.name = 'WrongPasswordError';
  }
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function newKdf(iterations = ITERATIONS): Kdf {
  return { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(crypto.getRandomValues(new Uint8Array(16))) };
}

/** Clé AES dérivée du mot de passe ; non exportable (elle peut être gardée sur l'appareil sans être lisible). */
export async function deriveKey(password: string, kdf: Kdf): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: kdf.hash, iterations: kdf.iterations, salt: fromBase64(kdf.salt) as BufferSource },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(plain: string, key: CryptoKey, kdf: Kdf, now = new Date()): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  return {
    app: ENVELOPE_APP,
    version: 1,
    kdf,
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    data: toBase64(data),
    savedAt: now.toISOString(),
  };
}

export async function open(env: Envelope, key: CryptoKey): Promise<string> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(env.cipher.iv) as BufferSource },
      key,
      fromBase64(env.data) as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new WrongPasswordError();
  }
}

/** Lit une enveloppe (fichier de sauvegarde) et vérifie sa forme. */
export function parseEnvelope(text: string): Envelope {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Le fichier de sauvegarde sur GitHub n'est pas lisible.");
  }
  const e = raw as Partial<Envelope>;
  if (!e || e.app !== ENVELOPE_APP || e.version !== 1 || !e.kdf?.salt || !e.cipher?.iv || typeof e.data !== 'string') {
    throw new Error("Ce fichier n'est pas une sauvegarde chiffrée de Planning.");
  }
  return e as Envelope;
}

/** Empreinte SHA-256 (hex), pour ne pas renvoyer une sauvegarde identique. */
export async function digest(text: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}
