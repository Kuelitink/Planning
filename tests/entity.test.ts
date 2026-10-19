import { describe, expect, it } from 'vitest';
import { createTask } from '../src/core/entity';

describe('createTask', () => {
  it('nouvelle tâche : priorité normale, 1 h, sans échéance, découpable par 15 min', () => {
    const t = createTask({ title: 'Ranger' }, new Date('2026-10-01T00:00:00'), 'x');
    expect(t).toMatchObject({ priority: 3, durationMin: 60, splittable: true, minChunkMin: 15, status: 'todo', dependsOn: [] });
    expect(t.deadline).toBeUndefined();
  });

  it('les champs donnés l’emportent', () => {
    const t = createTask({ title: 'Courir', durationMin: 45, splittable: false });
    expect(t).toMatchObject({ durationMin: 45, splittable: false });
  });
});
