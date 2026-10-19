import { describe, expect, it } from 'vitest';
import { MemoryRepository } from '../src/storage/memory';
import { deriveKey, newKdf, open, parseEnvelope, seal, WrongPasswordError, fromBase64, toBase64 } from '../src/sync/crypto';
import { getFile, getRepo, parseRepo, type GitHubTarget } from '../src/sync/github';
import { pullBackup, pushBackup, type BackupDeps } from '../src/sync/backup';
import { task } from './helpers';

/** Faux GitHub : un dépôt privé en mémoire, API « contents ». */
function fakeGitHub() {
  const files = new Map<string, { sha: string; content: string }>();
  let n = 0;
  const calls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url.pathname}`);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.pathname === '/repos/moi/donnees') return json(200, { private: true, permissions: { push: true } });
    const path = url.pathname.replace('/repos/moi/donnees/contents/', '');
    const file = files.get(path);
    if (method === 'GET') return file ? json(200, { sha: file.sha, content: file.content, encoding: 'base64' }) : json(404, {});
    const body = JSON.parse(String(init!.body)) as { content: string; sha?: string };
    if (file && !body.sha) return json(422, { message: 'sha missing' });
    if (file && body.sha !== file.sha) return json(409, { message: 'conflict' });
    if (!file && body.sha) return json(409, { message: 'conflict' });
    const sha = `sha${++n}`;
    files.set(path, { sha, content: body.content });
    return json(file ? 200 : 201, { content: { sha } });
  }) as typeof fetch;
  return { files, fetchFn, calls };
}

const target: GitHubTarget = { owner: 'moi', repo: 'donnees', path: 'planning-sauvegarde.json', token: 'jeton' };

async function device(fetchFn: typeof fetch, password = 'mot de passe solide', kdf = newKdf(1000)) {
  const repo = new MemoryRepository();
  const key = await deriveKey(password, kdf);
  const deps: BackupDeps = {
    target,
    key,
    kdf,
    fetch: fetchFn,
    exportData: () => repo.exportAll(),
    importData: (d, mode) => repo.importAll(d, mode),
  };
  return { repo, deps };
}

describe('chiffrement', () => {
  it('chiffre et déchiffre, refuse un mauvais mot de passe', async () => {
    const kdf = newKdf(1000);
    const env = await seal('{"règles":"secrètes"}', await deriveKey('bon', kdf), kdf);
    expect(env.data).not.toContain('secr');
    expect(await open(parseEnvelope(JSON.stringify(env)), await deriveKey('bon', kdf))).toBe('{"règles":"secrètes"}');
    await expect(open(env, await deriveKey('mauvais', kdf))).rejects.toBeInstanceOf(WrongPasswordError);
    expect(() => parseEnvelope('{"app":"autre"}')).toThrow();
  });

  it('encode le base64 des gros contenus', () => {
    const big = new Uint8Array(200_000).map((_, i) => i % 251);
    expect(fromBase64(toBase64(big))).toEqual(big);
  });
});

describe('dépôt GitHub', () => {
  it('lit le dépôt et reconnaît un fichier absent', async () => {
    const gh = fakeGitHub();
    expect(await getRepo(target, gh.fetchFn)).toEqual({ private: true, canPush: true });
    expect(await getFile(target, gh.fetchFn)).toBeNull();
    expect(parseRepo('https://github.com/Kuelitink/planning-donnees.git')).toEqual({ owner: 'Kuelitink', repo: 'planning-donnees' });
    expect(parseRepo('Kuelitink/planning-donnees')).toEqual({ owner: 'Kuelitink', repo: 'planning-donnees' });
    expect(parseRepo('pas un dépôt')).toBeNull();
  });
});

describe('sauvegarde', () => {
  it('envoie, ne renvoie pas une sauvegarde identique, puis renvoie après une modification', async () => {
    const gh = fakeGitHub();
    const a = await device(gh.fetchFn);
    await a.repo.put('tasks', task('Rapport'));

    const first = await pushBackup(a.deps, {});
    expect(first).toMatchObject({ pushed: true, sha: 'sha1' });
    // Le fichier distant est chiffré : rien de lisible.
    expect(Buffer.from(gh.files.get(target.path)!.content, 'base64').toString()).not.toContain('Rapport');

    expect((await pushBackup(a.deps, first)).pushed).toBe(false);
    await a.repo.put('tasks', task('Courses'));
    expect(await pushBackup(a.deps, first)).toMatchObject({ pushed: true, sha: 'sha2' });
  });

  it('restaure sur un autre appareil avec le même mot de passe', async () => {
    const gh = fakeGitHub();
    const a = await device(gh.fetchFn);
    await a.repo.put('tasks', task('Rapport'));
    await pushBackup(a.deps, {});

    const env = parseEnvelope((await getFile(target, gh.fetchFn))!.text);
    const b = await device(gh.fetchFn, 'mot de passe solide', env.kdf);
    const remote = await pullBackup(b.deps);
    expect(remote!.data.tasks.map((t) => t.id)).toEqual(['Rapport']);

    const wrong = await device(gh.fetchFn, 'autre', env.kdf);
    await expect(pullBackup(wrong.deps)).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("fusionne la version d'un autre appareil avant d'envoyer", async () => {
    const gh = fakeGitHub();
    const a = await device(gh.fetchFn);
    await a.repo.put('tasks', task('De A'));
    const stateA = await pushBackup(a.deps, {});

    // B part de la sauvegarde de A, ajoute une tâche et envoie.
    const env = parseEnvelope((await getFile(target, gh.fetchFn))!.text);
    const b = await device(gh.fetchFn, 'mot de passe solide', env.kdf);
    const remote = (await pullBackup(b.deps))!;
    await b.repo.importAll(remote.data, 'merge');
    await b.repo.put('tasks', task('De B'));
    await pushBackup(b.deps, { sha: remote.sha });

    // A modifie de son côté : son envoi récupère d'abord la tâche de B.
    await a.repo.put('tasks', task('Encore A'));
    const after = await pushBackup(a.deps, stateA);
    expect(after.pushed).toBe(true);
    expect((await a.repo.list('tasks')).map((t) => t.id).sort()).toEqual(['De A', 'De B', 'Encore A']);
    const final = (await pullBackup(a.deps))!;
    expect(final.data.tasks.map((t) => t.id).sort()).toEqual(['De A', 'De B', 'Encore A']);
  });
});
