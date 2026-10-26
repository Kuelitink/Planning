/** Fiche tâche : création ou édition. Tous les détails d'une tâche vivent ici. */

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ID, Priority, Task } from '../core/types';
import { formatDuration, formatHM, isDateOnly, parseDateTime } from '../core/time';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { DurationSelect, Field, PriorityPicker, Sheet } from '../ui/kit';
import { formatRelativeDay, fromInputs, toInputDate, toInputTime } from '../ui/format';
import { IconX } from '../ui/icons';
import { REASON_LABEL } from '../modes/TaskRow';

const CHUNKS = [15, 30, 45, 60];

/** Valeurs d'une nouvelle tâche (mêmes que `createTask`). */
const NEW_DURATION_MIN = 60;
const NEW_SPLITTABLE = true;
const NEW_MIN_CHUNK_MIN = 15;

/** Bouton « Aucune » à l'allure des listes déroulantes des champs. */
const NONE_BUTTON: CSSProperties = {
  height: 40,
  padding: '0 12px',
  border: 'var(--stroke)',
  borderRadius: 12,
  background: 'var(--card)',
  fontSize: 15,
};

/** Champ date caché sous le bouton « Aucune » : on n'en garde que le sélecteur natif. */
const HIDDEN_DATE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  padding: 0,
  border: 'none',
  opacity: 0,
  pointerEvents: 'none',
};

/**
 * Date facultative : « Aucune » tant que rien n'est choisi (un champ date vide a l'air
 * obligatoire, surtout sur Android). Toucher « Aucune » ouvre directement le sélecteur de date
 * natif (annuler n'y change rien) ; sans `showPicker`, le champ apparaît, avec la croix pour
 * revenir à « Aucune ». `children` (l'heure, par exemple) ne s'affiche qu'une date choisie.
 */
function OptionalDate({
  id,
  label,
  value,
  onChange,
  clearLabel,
  children,
}: {
  id: string;
  /** Nom du champ, lu avec « aucune ». */
  label: string;
  value: string;
  onChange: (date: string) => void;
  clearLabel: string;
  children?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [revealed, setRevealed] = useState(false);
  const shown = Boolean(value) || revealed;

  useEffect(() => {
    if (revealed && !value) inputRef.current?.focus();
  }, [revealed, value]);

  const pick = () => {
    const input = inputRef.current;
    try {
      if (input && typeof input.showPicker === 'function') {
        input.showPicker();
        return;
      }
    } catch {
      // Sélecteur indisponible : on montre le champ.
    }
    setRevealed(true);
  };

  return (
    <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
      {!shown && (
        <button type="button" id={id} style={NONE_BUTTON} aria-label={`${label} : aucune`} onClick={pick}>
          Aucune
        </button>
      )}
      <input
        ref={inputRef}
        id={shown ? id : undefined}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={shown ? undefined : HIDDEN_DATE}
        tabIndex={shown ? undefined : -1}
        aria-hidden={shown ? undefined : true}
      />
      {value && children}
      {shown && (
        <button
          type="button"
          className="icon-btn"
          aria-label={clearLabel}
          onClick={() => {
            onChange('');
            setRevealed(false);
          }}
        >
          <IconX size={18} />
        </button>
      )}
    </span>
  );
}

/** Échéance stockée → champs date / heure du formulaire. */
function splitDeadline(value?: string): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  if (isDateOnly(value)) return { date: value, time: '' };
  const d = parseDateTime(value);
  return { date: toInputDate(d), time: toInputTime(d) };
}

export function TaskSheet({ id, defaults, onClose }: { id?: ID; defaults?: Partial<Task>; onClose: () => void }) {
  const store = useStore();
  const { tasks, projects, windows, settings, plan } = store;
  const { setMode, showToast } = useNav();
  const task = id ? tasks.find((t) => t.id === id) : undefined;
  const missing = Boolean(id) && !task;

  // Tâche supprimée entre-temps : on ferme.
  useEffect(() => {
    if (missing) onClose();
  }, [missing, onClose]);

  const lists = useMemo(() => projects.filter((p) => !p.archived).sort((a, b) => a.order - b.order), [projects]);
  const base: Partial<Task> = task ?? defaults ?? {};
  const initialProject = task ? task.projectId : defaults && 'projectId' in defaults ? defaults.projectId : lists[0]?.id;
  const initialDeadline = splitDeadline(base.deadline);

  const [title, setTitle] = useState(base.title ?? '');
  const [projectId, setProjectId] = useState(initialProject ?? '');
  const [durationMin, setDurationMin] = useState(base.durationMin ?? NEW_DURATION_MIN);
  const [priority, setPriority] = useState<Priority>(base.priority ?? 3);
  const [deadlineDate, setDeadlineDate] = useState(initialDeadline.date);
  const [deadlineTime, setDeadlineTime] = useState(initialDeadline.time);
  const [windowId, setWindowId] = useState(base.windowId ?? '');
  const [earliest, setEarliest] = useState(base.earliestStart ? toInputDate(parseDateTime(base.earliestStart)) : '');
  const [dependsOn, setDependsOn] = useState<ID[]>(base.dependsOn ?? []);
  const [splittable, setSplittable] = useState(base.splittable ?? NEW_SPLITTABLE);
  const [minChunkMin, setMinChunkMin] = useState(base.minChunkMin ?? NEW_MIN_CHUNK_MIN);
  const [notes, setNotes] = useState(base.notes ?? '');

  const ids = {
    title: useId(),
    list: useId(),
    duration: useId(),
    deadline: useId(),
    window: useId(),
    earliest: useId(),
    deps: useId(),
    split: useId(),
    chunk: useId(),
    notes: useId(),
  };

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  /** Horaires appliqués si on ne choisit rien : ceux de la liste, sinon ceux des réglages. */
  const defaultWindowName = useMemo(() => {
    const list = projects.find((p) => p.id === projectId);
    const wid = list?.defaultWindowId ?? settings.defaultWindowId;
    const w = wid ? windows.find((x) => x.id === wid) : undefined;
    return w?.name ?? `${settings.dayStart}–${settings.dayEnd}`;
  }, [projects, projectId, settings, windows]);

  /** Tâches qu'on peut ajouter comme « à faire avant ». */
  const candidates = useMemo(
    () =>
      tasks.filter(
        (t) => t.status === 'todo' && t.id !== id && !dependsOn.includes(t.id) && !(id && t.dependsOn.includes(id)),
      ),
    [tasks, id, dependsOn],
  );

  if (missing) return null;

  /** Ligne d'info en édition : créneau prévu et temps chronométré. */
  const info: string[] = [];
  if (task && task.status === 'todo') {
    const blocks = plan.blocks.filter((b) => b.taskId === task.id).sort((a, b) => a.start.getTime() - b.start.getTime());
    const reason = plan.unscheduled.find((u) => u.taskId === task.id)?.reason;
    if (blocks.length) {
      const b = blocks[0];
      info.push(`Prévue ${formatRelativeDay(b.start).toLowerCase()} ${formatHM(b.start)}–${formatHM(b.end)}`);
    } else if (reason) {
      info.push(reason === 'no-slot' ? 'Pas de créneau trouvé' : REASON_LABEL[reason]);
    }
  }
  if (task) {
    const spentMin = Math.floor(store.timeSpent(task.id) / 60_000);
    if (spentMin >= 1) info.push(`${formatDuration(spentMin)} chronométrées`);
  }

  const save = () => {
    const clean = title.trim();
    if (!clean) return;
    const fields = {
      title: clean,
      projectId: projectId || undefined,
      durationMin,
      priority,
      deadline: deadlineDate ? (deadlineTime ? fromInputs(deadlineDate, deadlineTime).toISOString() : deadlineDate) : undefined,
      windowId: windowId || undefined,
      earliestStart: earliest || undefined,
      dependsOn: dependsOn.filter((d) => byId.has(d)),
      splittable,
      minChunkMin,
      notes: notes.trim() || undefined,
    };
    if (task) store.saveTask({ ...task, ...fields });
    else store.addTask(fields);
    onClose();
  };

  const remove = () => {
    if (!task) return;
    const copy = task;
    store.deleteTask(task.id);
    onClose();
    showToast({ message: 'Tâche supprimée', action: { label: 'Annuler', run: () => store.saveTask(copy) } });
  };

  const isDone = task?.status === 'done';

  return (
    <Sheet title={task ? undefined : 'Nouvelle tâche'} label="Fiche tâche" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label htmlFor={ids.title} className="sr-only">
          Titre
        </label>
        <input
          id={ids.title}
          className="text-input text-input--title"
          placeholder="Titre de la tâche"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus={!task}
          autoComplete="off"
          enterKeyHint="done"
        />

        <div style={{ marginTop: 8 }}>
          <Field label="Liste" htmlFor={ids.list}>
            <select id={ids.list} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Aucune</option>
              {lists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Durée" htmlFor={ids.duration}>
            <DurationSelect id={ids.duration} value={durationMin} onChange={setDurationMin} />
          </Field>

          <Field label="Priorité">
            <PriorityPicker value={priority} onChange={setPriority} />
          </Field>

          {/* Sans échéance (par défaut), le planificateur en déduit une de la priorité et
              replace la tâche à chaque recalcul tant qu'elle n'est pas cochée. */}
          <Field label="Échéance" htmlFor={ids.deadline}>
            <OptionalDate
              id={ids.deadline}
              label="Échéance"
              value={deadlineDate}
              onChange={(d) => {
                setDeadlineDate(d);
                if (!d) setDeadlineTime('');
              }}
              clearLabel="Effacer l'échéance"
            >
              <input
                type="time"
                aria-label="Heure de l'échéance (facultatif)"
                value={deadlineTime}
                onChange={(e) => setDeadlineTime(e.target.value)}
              />
            </OptionalDate>
          </Field>

          <Field label="Horaires" htmlFor={ids.window}>
            <select id={ids.window} value={windowId} onChange={(e) => setWindowId(e.target.value)}>
              <option value="">Par défaut ({defaultWindowName})</option>
              {windows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Pas avant" htmlFor={ids.earliest}>
            <OptionalDate id={ids.earliest} label="Pas avant" value={earliest} onChange={setEarliest} clearLabel="Effacer la date de début" />
          </Field>

          <Field label="Après" htmlFor={ids.deps}>
            {dependsOn
              .map((d) => byId.get(d))
              .filter((t): t is Task => Boolean(t))
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="chip"
                  aria-label={`Retirer « ${t.title} »`}
                  onClick={() => setDependsOn(dependsOn.filter((x) => x !== t.id))}
                  style={{ maxWidth: 200 }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                  <IconX size={14} />
                </button>
              ))}
            {candidates.length > 0 && (
              <select
                id={ids.deps}
                value=""
                onChange={(e) => e.target.value && setDependsOn([...dependsOn, e.target.value])}
                style={{ maxWidth: 180 }}
              >
                <option value="">{dependsOn.length ? 'Ajouter…' : 'Aucune'}</option>
                {candidates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="Découpable" htmlFor={ids.split}>
            <input
              id={ids.split}
              type="checkbox"
              role="switch"
              className="switch"
              checked={splittable}
              onChange={(e) => setSplittable(e.target.checked)}
            />
          </Field>

          {splittable && (
            <Field label="Morceaux d'au moins" htmlFor={ids.chunk}>
              <select id={ids.chunk} value={minChunkMin} onChange={(e) => setMinChunkMin(Number(e.target.value))}>
                {(CHUNKS.includes(minChunkMin) ? CHUNKS : [...CHUNKS, minChunkMin].sort((a, b) => a - b)).map((m) => (
                  <option key={m} value={m}>
                    {formatDuration(m)}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <label htmlFor={ids.notes} className="sr-only">
          Notes
        </label>
        <textarea
          id={ids.notes}
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          style={{
            width: '100%',
            marginTop: 12,
            padding: 12,
            border: 'var(--stroke)',
            borderRadius: 14,
            background: 'var(--card)',
            fontSize: 15,
            resize: 'vertical',
          }}
        />

        {info.length > 0 && (
          <p className="subtitle" style={{ marginTop: 12 }}>
            {info.join(' · ')}
          </p>
        )}

        {task?.pinned && task.status === 'todo' && (
          <div className="pinned-slot">
            <span>
              Créneau fixé : {formatRelativeDay(parseDateTime(task.pinned.start)).toLowerCase()}{' '}
              {formatHM(parseDateTime(task.pinned.start))}–{formatHM(parseDateTime(task.pinned.end))}
            </span>
            <button
              type="button"
              className="pill pill--sm"
              onClick={() => {
                const before = task.pinned;
                store.saveTask({ ...task, pinned: undefined });
                showToast({
                  message: 'Créneau libéré : la tâche est auto-planifiée',
                  action: { label: 'Annuler', run: () => store.saveTask({ ...task, pinned: before }) },
                });
              }}
            >
              Libérer
            </button>
          </div>
        )}

        <div className="sheet__actions">
          <button type="submit" className="btn btn--primary btn--block" disabled={!title.trim()} style={title.trim() ? undefined : { opacity: 0.5 }}>
            Enregistrer
          </button>
          {task && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                {!isDone && (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => {
                      store.startTimer(task.id);
                      setMode('chrono');
                      onClose();
                    }}
                  >
                    Chronométrer
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--secondary"
                  style={isDone ? { gridColumn: '1 / -1' } : undefined}
                  onClick={() => {
                    store.setTaskDone(task.id, !isDone);
                    onClose();
                  }}
                >
                  {isDone ? 'Remettre à faire' : 'Marquer comme faite'}
                </button>
              </div>
              <button type="button" className="btn btn--danger btn--block" onClick={remove}>
                Supprimer
              </button>
            </>
          )}
        </div>
      </form>
    </Sheet>
  );
}
