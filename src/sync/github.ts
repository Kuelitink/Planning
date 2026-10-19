/**
 * Accès à un fichier d'un dépôt GitHub par l'API « contents », avec un jeton d'accès
 * (fine-grained, limité au dépôt, permission Contents en lecture et écriture).
 */

import { fromBase64, toBase64 } from './crypto';

export interface GitHubTarget {
  owner: string;
  repo: string;
  path: string;
  token: string;
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

type Fetch = typeof fetch;
const API = 'https://api.github.com';

async function call(t: GitHubTarget, url: string, init: RequestInit, fetchFn: Fetch, accept = 'application/vnd.github+json') {
  let res: Response;
  try {
    res = await fetchFn(url, {
      ...init,
      headers: {
        Accept: accept,
        Authorization: `Bearer ${t.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new GitHubError('Pas de connexion à GitHub.', 0);
  }
  if (res.ok) return res;
  const messages: Record<number, string> = {
    401: 'Clé d’accès GitHub refusée (expirée ou mal copiée).',
    403: 'La clé d’accès n’a pas le droit d’écrire dans ce dépôt (permission « Contents : Read and write »).',
    404: 'Dépôt introuvable, ou la clé d’accès ne le couvre pas.',
  };
  throw new GitHubError(messages[res.status] ?? `Erreur GitHub (${res.status}).`, res.status);
}

const fileUrl = (t: GitHubTarget) =>
  `${API}/repos/${encodeURIComponent(t.owner)}/${encodeURIComponent(t.repo)}/contents/${t.path.split('/').map(encodeURIComponent).join('/')}`;

/** Le dépôt, s'il est accessible : privé ? écriture permise ? */
export async function getRepo(t: GitHubTarget, fetchFn: Fetch = fetch): Promise<{ private: boolean; canPush: boolean }> {
  const res = await call(t, `${API}/repos/${encodeURIComponent(t.owner)}/${encodeURIComponent(t.repo)}`, {}, fetchFn);
  const repo = (await res.json()) as { private?: boolean; permissions?: { push?: boolean } };
  return { private: repo.private === true, canPush: repo.permissions?.push !== false };
}

/** Contenu et empreinte (sha) du fichier, ou `null` s'il n'existe pas. */
export async function getFile(t: GitHubTarget, fetchFn: Fetch = fetch): Promise<{ sha: string; text: string } | null> {
  let res: Response;
  try {
    res = await call(t, `${fileUrl(t)}?t=${Date.now()}`, { cache: 'no-store' }, fetchFn);
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return null;
    throw err;
  }
  const meta = (await res.json()) as { sha: string; content?: string; encoding?: string; size?: number };
  if (meta.encoding === 'base64' && meta.content) return { sha: meta.sha, text: new TextDecoder().decode(fromBase64(meta.content)) };
  // Au-delà de 1 Mo, l'API ne renvoie pas le contenu : on le relit en brut.
  const raw = await call(t, `${fileUrl(t)}?t=${Date.now()}`, { cache: 'no-store' }, fetchFn, 'application/vnd.github.raw+json');
  return { sha: meta.sha, text: await raw.text() };
}

/**
 * Écrit le fichier (un commit). `sha` = version qu'on remplace ; si le fichier a changé depuis
 * (autre appareil), GitHub répond 409 ou 422 : relire, fusionner, puis réessayer.
 */
export async function putFile(
  t: GitHubTarget,
  text: string,
  sha: string | undefined,
  message: string,
  fetchFn: Fetch = fetch,
): Promise<string> {
  const body = JSON.stringify({ message, content: toBase64(new TextEncoder().encode(text)), ...(sha && { sha }) });
  const res = await call(t, fileUrl(t), { method: 'PUT', body }, fetchFn);
  const out = (await res.json()) as { content: { sha: string } };
  return out.content.sha;
}

/** `Kuelitink/planning-donnees` ou une URL github.com → propriétaire et dépôt. */
export function parseRepo(input: string): { owner: string; repo: string } | null {
  const m = /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(input.trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}
