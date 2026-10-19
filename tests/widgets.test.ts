import { describe, expect, it } from 'vitest';
import { createEntity } from '../src/core/entity';
import type { Project } from '../src/core/types';
import { schedule } from '../src/core/scheduler';
import { formatHM } from '../src/core/time';
import { buildSnapshot, SNAPSHOT_DAYS } from '../src/native/widgets';
import { latestApk } from '../src/native/update';
import { at, event, settings, task } from './helpers';

const travail = createEntity<Project>({ name: 'Travail', color: '#3D6FE0', archived: false, order: 0 }, new Date('2026-10-01T00:00:00'), 'travail');

describe('instantané des widgets', () => {
  const tasks = [
    task('Rapport', { durationMin: 60, priority: 1, projectId: 'travail' }),
    task('Maquette', { durationMin: 120, splittable: true, minChunkMin: 30 }),
    task('Contrat', { status: 'done', doneAt: at('2026-10-19 08:50').toISOString() }),
  ];
  const events = [
    event('Réunion', '2026-10-19 10:00', '2026-10-19 10:30'),
    event('Anniversaire', '2026-10-20 00:00', '2026-10-21 00:00', { allDay: true }),
  ];
  const now = at('2026-10-19 09:00');
  const plan = schedule({ tasks, events, windows: [], projects: [travail], settings: settings({ dayEnd: '12:00' }), now });
  const snapshot = buildSnapshot({ plan, tasks, events, projects: [travail], windows: [], settings: settings({ dayEnd: '12:00' }) }, now);

  it('couvre les 7 prochains jours', () => {
    expect(snapshot.days.map((d) => d.date)).toHaveLength(SNAPSHOT_DAYS);
    expect(snapshot.days[0].date).toBe('2026-10-19');
    expect(snapshot.days[6].date).toBe('2026-10-25');
  });

  it("donne la journée dans l'ordre, avec couleurs, priorité et morceaux", () => {
    const today = snapshot.days[0];
    expect(today.items.map((i) => `${formatHM(new Date(i.start))} ${i.title}${i.part ? ` ${i.part}` : ''}`)).toEqual([
      '09:00 Rapport',
      '10:00 Réunion',
      '10:30 Maquette 1/2',
    ]);
    expect(today.items[0]).toMatchObject({ kind: 'task', id: 'Rapport', color: '#3D6FE0', ring: '#D7263D' });
    expect(today.items[1]).toMatchObject({ kind: 'event', id: 'Réunion', allDay: false });
    expect(today.items[1].color).toBeUndefined();
    expect(today.done).toBe(1);
  });

  it('prépare les jours suivants (journée entière en tête, suite de la tâche découpée)', () => {
    expect(snapshot.days[1].items).toMatchObject([
      { kind: 'event', title: 'Anniversaire', allDay: true },
      { kind: 'task', title: 'Maquette', part: '2/2' },
    ]);
  });
});

describe('mise à jour de l’APK', () => {
  const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('lit le numéro et le lien de la dernière APK', async () => {
    const release = { tag_name: 'apk-42', assets: [{ name: 'planning.apk', browser_download_url: 'https://example.org/planning.apk' }] };
    expect(await latestApk(reply(200, release))).toEqual({ build: 42, url: 'https://example.org/planning.apk' });
  });

  it('ignore une release sans APK ou absente', async () => {
    expect(await latestApk(reply(200, { tag_name: 'v1.0', assets: [] }))).toBeNull();
    expect(await latestApk(reply(404, {}))).toBeNull();
  });
});
