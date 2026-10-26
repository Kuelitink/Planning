/** Fiche tâche : création ou édition. Tous les détails d'une tâche vivent ici. */

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ID, Priority, Task, TaskRecurrence, Weekday } from '../core/types';
import { DAY, MINUTE, formatDuration, formatHM, isDateOnly, parseDateTime, parseISODate } from '../core/time';
import { describeRecurrence, occurrenceFrom } from '../core/recurrence';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { DurationSelect, Field, PriorityPicker, Sheet } from '../ui/kit';
import { WEEK_DAYS, formatRelativeDay, fromInputs, toInputDate, toInputTime } from '../ui/format';
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

/** Marges proposées avant / après une tâche, en minutes. */
const MARGINS = [0, 5, 10, 15, 20, 30, 45, 60, 90];

type Repeat = 'none' | TaskRecurrence['freq'];

const REPEAT_UNIT: Record<TaskRecurrence['freq'], [string, string]> = {
  daily: ['jour', 'jours'],
  weekly: ['semaine', 'semaines'],
  monthly: ['mois', 'mois'],
};

/** Début proposé pour une heure fixe : la prochaine heure ronde. */
function nextHour(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
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
  // Heure fixe (« de … à … ») : la tâche est posée sur ce créneau, l'auto-planification ne la déplace pas.
  const pinStart = base.pinned ? parseDateTime(base.pinned.start) : nextHour();
  const pinEnd = base.pinned ? parseDateTime(base.pinned.end) : new Date(pinStart.getTime() + (base.durationMin ?? NEW_DURATION_MIN) * MINUTE);
  const [fixed, setFixed] = useState(Boolean(base.pinned));
  const [fixDate, setFixDate] = useState(toInputDate(pinStart));
  const [fixFrom, setFixFrom] = useState(toInputTime(pinStart));
  const [fixTo, setFixTo] = useState(toInputTime(pinEnd));
  // Répétition (tâche récurrente) : rythme, jours, prochaine occurrence, fin.
  const rec = base.recurrence;
  const [repeat, setRepeat] = useState<Repeat>(rec?.freq ?? 'none');
  const [every, setEvery] = useState(rec?.interval ?? 1);
  const [repeatDays, setRepeatDays] = useState<Weekday[]>(rec?.weekdays ?? []);
  const [nextDate, setNextDate] = useState(base.occurrence ?? toInputDate(new Date()));
  const [until, setUntil] = useState(rec?.until ?? '');
  // Marges libres avant / après la tâche.
  const [bufferBefore, setBufferBefore] = useState(base.bufferBeforeMin ?? 0);
  const [bufferAfter, setBufferAfter] = useState(base.bufferAfterMin ?? 0);

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
    fixed: useId(),
    fixDate: useId(),
    fixFrom: useId(),
    repeat: useId(),
    every: useId(),
    next: useId(),
    until: useId(),
    before: useId(),
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
  if (task?.recurrence && task.occurrence && task.status === 'todo') {
    info.unshift(`↻ ${describeRecurrence(task.recurrence)} · prochaine : ${formatRelativeDay(parseISODate(task.occurrence)).toLowerCase()}`);
  }
  if (task) {
    const spentMin = Math.floor(store.timeSpent(task.id) / 60_000);
    if (spentMin >= 1) info.push(`${formatDuration(spentMin)} chronométrées`);
  }

  /** Créneau de l'heure fixe ; une fin avant le début passe au lendemain. */
  const fixedRange = () => {
    const start = fromInputs(fixDate, fixFrom);
    let end = fromInputs(fixDate, fixTo);
    if (end <= start) end = new Date(end.getTime() + DAY);
    return { start, end };
  };
  const fixedValid = !fixed || Boolean(fixDate && fixFrom && fixTo);

  /** Répétition choisie ; son occurrence en cours est le premier jour de la série à partir de la date choisie. */
  const recurrenceOf = (): { recurrence: TaskRecurrence; occurrence: string } | undefined => {
    if (repeat === 'none') return undefined;
    const from = (fixed ? fixDate : nextDate) || toInputDate(new Date());
    const weekdays = repeat === 'weekly' ? (repeatDays.length ? repeatDays : [parseISODate(from).getDay() as Weekday]) : undefined;
    // Le rythme (une semaine sur deux…) part de la série existante si elle ne change pas de nature.
    const start = rec && rec.freq === repeat && rec.interval === every && rec.start <= from ? rec.start : from;
    const recurrence: TaskRecurrence = { freq: repeat, interval: Math.max(1, every), weekdays, start, until: until || undefined };
    return { recurrence, occurrence: occurrenceFrom(recurrence, from) ?? from };
  };

  const save = () => {
    const clean = title.trim();
    if (!clean || !fixedValid) return;
    const repeating = recurrenceOf();
    let range = fixed ? fixedRange() : undefined;
    // Heure fixe d'une tâche récurrente : le créneau suit le jour de l'occurrence.
    if (range && repeating && repeating.occurrence !== fixDate) {
      const shift = parseISODate(repeating.occurrence).getTime() - parseISODate(fixDate).getTime();
      const days = Math.round(shift / DAY);
      range = { start: new Date(range.start.getTime() + days * DAY), end: new Date(range.end.getTime() + days * DAY) };
    }
    const fields = {
      recurrence: repeating?.recurrence,
      occurrence: repeating?.occurrence,
      prevOccurrence: repeating && task?.occurrence === repeating.occurrence ? task.prevOccurrence : undefined,
      bufferBeforeMin: bufferBefore || undefined,
      bufferAfterMin: bufferAfter || undefined,
      title: clean,
      projectId: projectId || undefined,
      durationMin: range ? Math.max(5, Math.round((range.end.getTime() - range.start.getTime()) / MINUTE)) : durationMin,
      pinned: range ? { start: range.start.toISOString(), end: range.end.toISOString() } : undefined,
      priority,
      // Une tâche récurrente est due le jour de son occurrence : pas d'échéance ni de « pas avant » à part.
      deadline: repeating || !deadlineDate ? undefined : deadlineTime ? fromInputs(deadlineDate, deadlineTime).toISOString() : deadlineDate,
      windowId: windowId || undefined,
      earliestStart: repeating ? undefined : earliest || undefined,
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

          <Field label="Heure fixe" htmlFor={ids.fixed}>
            <input
              id={ids.fixed}
              type="checkbox"
              role="switch"
              className="switch"
              checked={fixed}
              onChange={(e) => setFixed(e.target.checked)}
            />
          </Field>

          {fixed ? (
            <>
              <Field label="Le" htmlFor={ids.fixDate}>
                <input id={ids.fixDate} type="date" value={fixDate} onChange={(e) => setFixDate(e.target.value)} />
              </Field>
              <Field label="De" htmlFor={ids.fixFrom}>
                <span className="time-range">
                  <input id={ids.fixFrom} type="time" value={fixFrom} onChange={(e) => setFixFrom(e.target.value)} />
                  <span>à</span>
                  <input type="time" aria-label="Heure de fin" value={fixTo} onChange={(e) => setFixTo(e.target.value)} />
                </span>
              </Field>
            </>
          ) : (
            <Field label="Durée" htmlFor={ids.duration}>
              <DurationSelect id={ids.duration} value={durationMin} onChange={setDurationMin} />
            </Field>
          )}

          <Field label="Priorité">
            <PriorityPicker value={priority} onChange={setPriority} />
          </Field>

          <Field label="Répéter" htmlFor={ids.repeat}>
            <select id={ids.repeat} value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
              <option value="none">Jamais</option>
              <option value="daily">Tous les jours</option>
              <option value="weekly">Toutes les semaines</option>
              <option value="monthly">Tous les mois</option>
            </select>
          </Field>

          {repeat !== 'none' && (
            <>
              <Field label="Tous les" htmlFor={ids.every}>
                <span className="time-range">
                  <input
                    id={ids.every}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={99}
                    value={every}
                    onChange={(e) => setEvery(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                    style={{ width: 64 }}
                  />
                  <span>{REPEAT_UNIT[repeat][every > 1 ? 1 : 0]}</span>
                </span>
              </Field>
              {repeat === 'weekly' && (
                <Field label="Le">
                  <div className="day-chips" role="group" aria-label="Jours de répétition">
                    {WEEK_DAYS.map((d) => (
                      <button
                        key={d.weekday}
                        type="button"
                        className="chip"
                        aria-pressed={repeatDays.includes(d.weekday)}
                        aria-label={d.name}
                        onClick={() =>
                          setRepeatDays((cur) => (cur.includes(d.weekday) ? cur.filter((x) => x !== d.weekday) : [...cur, d.weekday]))
                        }
                      >
                        {d.short}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
              {!fixed && (
                <Field label="Prochaine fois" htmlFor={ids.next}>
                  <input id={ids.next} type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
                </Field>
              )}
              <Field label="Jusqu'au" htmlFor={ids.until}>
                <OptionalDate id={ids.until} label="Jusqu'au" value={until} onChange={setUntil} clearLabel="Répéter sans fin" />
              </Field>
            </>
          )}

          <Field label="Marges" htmlFor={ids.before}>
            <span className="time-range">
              <span>avant</span>
              <select id={ids.before} value={bufferBefore} onChange={(e) => setBufferBefore(Number(e.target.value))} aria-label="Marge avant">
                {MARGINS.map((m) => (
                  <option key={m} value={m}>
                    {m ? formatDuration(m) : '0'}
                  </option>
                ))}
              </select>
              <span>après</span>
              <select value={bufferAfter} onChange={(e) => setBufferAfter(Number(e.target.value))} aria-label="Marge après">
                {MARGINS.map((m) => (
                  <option key={m} value={m}>
                    {m ? formatDuration(m) : '0'}
                  </option>
                ))}
              </select>
            </span>
          </Field>

          {!fixed && (
            <>
              {/* Sans échéance (par défaut), le planificateur en déduit une de la priorité et
                  replace la tâche à chaque recalcul tant qu'elle n'est pas cochée. */}
              {repeat === 'none' && (
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
              )}

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

              {repeat === 'none' && (
                <Field label="Pas avant" htmlFor={ids.earliest}>
                  <OptionalDate id={ids.earliest} label="Pas avant" value={earliest} onChange={setEarliest} clearLabel="Effacer la date de début" />
                </Field>
              )}

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
            </>
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

        <div className="sheet__actions">
          <button type="submit" className="btn btn--primary btn--block" disabled={!title.trim() || !fixedValid} style={title.trim() && fixedValid ? undefined : { opacity: 0.5 }}>
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
