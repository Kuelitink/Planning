import { describe, expect, it } from 'vitest';
import {
  canIndent,
  checklistChanges,
  checklistRows,
  indentRow,
  moveRow,
  outdentRow,
  type ChecklistRow,
} from '../src/core/checklist';
import { task } from './helpers';

const view = (rows: ChecklistRow[]) => rows.map((r) => (r.depth ? `  ${r.id}` : r.id));

describe('lignes de la checklist', () => {
  const tasks = [
    task('A'),
    task('A2', { parentId: 'A', order: 1 }),
    task('A1', { parentId: 'A', order: 0 }),
    task('B'),
    task('C', { parentId: 'X' }),
    task('X'),
  ];

  it('chaque tâche suivie de ses sous-tâches, dans leur ordre', () => {
    expect(view(checklistRows(['A', 'B'], tasks))).toEqual(['A', '  A1', '  A2', 'B']);
  });

  it("une sous-tâche choisie avec sa mère n'apparaît qu'une fois", () => {
    expect(view(checklistRows(['A1', 'A', 'B'], tasks))).toEqual(['A', '  A1', '  A2', 'B']);
  });

  it('une sous-tâche choisie sans sa mère est orpheline', () => {
    const rows = checklistRows(['B', 'C'], tasks);
    expect(view(rows)).toEqual(['B', 'C']);
    expect(rows[1].orphan).toBe(true);
  });
});

describe('déplacer et décaler', () => {
  const rows: ChecklistRow[] = [
    { id: 'A', depth: 0, orphan: false },
    { id: 'A1', depth: 1, orphan: false },
    { id: 'B', depth: 0, orphan: false },
    { id: 'C', depth: 0, orphan: false },
  ];

  it('une tâche emmène ses sous-tâches', () => {
    // Sans le bloc A : [B, C] ; on le pose après B.
    expect(view(moveRow(rows, 0, 1))).toEqual(['B', 'A', '  A1', 'C']);
  });

  it("une tâche ne se pose pas au milieu des sous-tâches d'une autre", () => {
    // Sans C : [A, A1, B] ; posée à l'indice 1 (entre A et A1), elle passe après A1.
    expect(view(moveRow(rows, 3, 1))).toEqual(['A', '  A1', 'C', 'B']);
  });

  it('une sous-tâche change de mère, ou redevient une tâche tout en haut', () => {
    expect(view(moveRow(rows, 1, 3))).toEqual(['A', 'B', 'C', '  A1']);
    expect(view(moveRow(rows, 1, 0))).toEqual(['A1', 'A', 'B', 'C']);
  });

  it('décaler à droite : sous-tâche de la tâche du dessus', () => {
    expect(canIndent(rows, 0)).toBe(false);
    expect(view(indentRow(rows, 2))).toEqual(['A', '  A1', '  B', 'C']);
  });

  it('décaler à gauche : les sous-tâches suivantes deviennent les siennes', () => {
    const three: ChecklistRow[] = [
      { id: 'A', depth: 0, orphan: false },
      { id: 'A1', depth: 1, orphan: false },
      { id: 'A2', depth: 1, orphan: false },
      { id: 'A3', depth: 1, orphan: false },
    ];
    const out = outdentRow(three, 2);
    expect(view(out)).toEqual(['A', '  A1', 'A2', '  A3']);
    const tasks = [task('A'), task('A1', { parentId: 'A', order: 0 }), task('A2', { parentId: 'A', order: 1 }), task('A3', { parentId: 'A', order: 2 })];
    expect(checklistChanges(out, tasks)).toEqual({
      order: ['A', 'A2'],
      tasks: [
        { id: 'A2', parentId: undefined, order: undefined },
        { id: 'A3', parentId: 'A2', order: 0 },
      ],
    });
  });

  it("pas de sous-tâche sous une orpheline", () => {
    const withOrphan: ChecklistRow[] = [
      { id: 'C', depth: 0, orphan: true },
      { id: 'B', depth: 0, orphan: false },
    ];
    expect(canIndent(withOrphan, 1)).toBe(false);
    const tasks = [task('C', { parentId: 'X' }), task('B')];
    // L'orpheline garde sa mère.
    expect(checklistChanges(withOrphan, tasks)).toEqual({ order: ['C', 'B'], tasks: [] });
  });
});
