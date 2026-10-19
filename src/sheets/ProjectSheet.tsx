/** Fiche liste : nom, couleur, horaires par défaut. */

import { useEffect, useId, useState } from 'react';
import type { ID } from '../core/types';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { Field, Sheet } from '../ui/kit';
import { TONES } from '../ui/palette';

export function ProjectSheet({ id, onClose }: { id?: ID; onClose: () => void }) {
  const { projects, tasks, windows, addProject, saveProject, deleteProject } = useStore();
  const { openListId, setOpenListId, showToast } = useNav();
  const project = id ? projects.find((p) => p.id === id) : undefined;
  const missing = Boolean(id) && !project;

  useEffect(() => {
    if (missing) onClose();
  }, [missing, onClose]);

  const [name, setName] = useState(project?.name ?? '');
  const [color, setColor] = useState(project?.color ?? TONES[projects.length % TONES.length].dot);
  const [windowId, setWindowId] = useState(project?.defaultWindowId ?? '');
  const nameId = useId();
  const windowFieldId = useId();
  const colorLabelId = useId();

  if (missing) return null;

  const save = () => {
    const clean = name.trim();
    if (!clean) return;
    const defaultWindowId = windowId || undefined;
    if (project) {
      saveProject({ ...project, name: clean, color, defaultWindowId });
    } else {
      const order = projects.reduce((max, p) => Math.max(max, p.order), -1) + 1;
      addProject({ name: clean, color, defaultWindowId, archived: false, order });
    }
    onClose();
  };

  const remove = () => {
    if (!project) return;
    const count = tasks.filter((t) => t.projectId === project.id).length;
    if (count > 0 && !window.confirm(`Supprimer la liste « ${project.name} » ? Ses ${count} tâches resteront, sans liste.`)) return;
    deleteProject(project.id);
    if (openListId === project.id) setOpenListId(null);
    onClose();
    showToast({ message: 'Liste supprimée' });
  };

  return (
    <Sheet title={project ? 'Liste' : 'Nouvelle liste'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label htmlFor={nameId} className="sr-only">
          Nom de la liste
        </label>
        <input
          id={nameId}
          className="text-input text-input--title"
          placeholder="Nom de la liste"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus={!project}
          autoComplete="off"
          enterKeyHint="done"
        />

        <div style={{ marginTop: 8 }}>
          <div className="field" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10, padding: '12px 0' }}>
            <span id={colorLabelId} className="field__label">
              Couleur
            </span>
            <div role="group" aria-labelledby={colorLabelId} style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {TONES.map((t) => {
                const selected = t.dot.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={t.dot}
                    type="button"
                    aria-label={t.name}
                    aria-pressed={selected}
                    onClick={() => setColor(t.dot)}
                    style={{
                      width: 44,
                      height: 44,
                      padding: 0,
                      border: 'none',
                      borderRadius: '50%',
                      background: 'transparent',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        border: 'var(--stroke)',
                        background: t.dot,
                        boxShadow: selected ? '0 0 0 3px var(--card), 0 0 0 5px var(--ink)' : 'none',
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Horaires par défaut" htmlFor={windowFieldId}>
            <select id={windowFieldId} value={windowId} onChange={(e) => setWindowId(e.target.value)}>
              <option value="">Par défaut</option>
              {windows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="sheet__actions">
          <button type="submit" className="btn btn--primary btn--block" disabled={!name.trim()} style={name.trim() ? undefined : { opacity: 0.5 }}>
            Enregistrer
          </button>
          {project && (
            <button type="button" className="btn btn--danger btn--block" onClick={remove}>
              Supprimer la liste
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}
