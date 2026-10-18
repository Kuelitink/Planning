/** Feuille Événement : création ou édition d'un événement (ponctuel ou hebdomadaire). */

import { useId, useState } from 'react';
import type { CalendarEvent, ID, Recurrence, Weekday } from '../core/types';
import { addDays, parseDateTime, parseHM } from '../core/time';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { Field, Sheet } from '../ui/kit';
import { fromInputs, pad2, toInputDate, toInputTime } from '../ui/format';
import '../modes/calendar.css';

/** Jours dans l'ordre français (lundi d'abord). */
const DAYS: { weekday: Weekday; short: string; name: string }[] = [
  { weekday: 1, short: 'L', name: 'Lundi' },
  { weekday: 2, short: 'M', name: 'Mardi' },
  { weekday: 3, short: 'M', name: 'Mercredi' },
  { weekday: 4, short: 'J', name: 'Jeudi' },
  { weekday: 5, short: 'V', name: 'Vendredi' },
  { weekday: 6, short: 'S', name: 'Samedi' },
  { weekday: 0, short: 'D', name: 'Dimanche' },
];

/** `HH:MM` décalé de `delta` minutes (modulo 24 h). */
function shiftTime(hm: string, delta: number): string {
  const m = (((parseHM(hm) + delta) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/** Prochaine heure ronde. */
function nextHour(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(now.getHours() + 1, 0, 0, 0);
  return d;
}

export function EventSheet({ id, date, onClose }: { id?: ID; date?: Date; onClose: () => void }) {
  const { events, addEvent, saveEvent, deleteEvent } = useStore();
  const { showToast } = useNav();
  const existing = id ? events.find((e) => e.id === id) : undefined;
  const ids = { date: useId(), start: useId(), end: useId(), allDay: useId(), until: useId() };

  const initialStart = existing ? parseDateTime(existing.start) : (date ?? nextHour());
  const initialEnd = existing ? parseDateTime(existing.end) : new Date(initialStart.getTime() + 60 * 60_000);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [day, setDay] = useState(toInputDate(initialStart));
  const [start, setStart] = useState(toInputTime(initialStart));
  const [end, setEnd] = useState(toInputTime(initialEnd));
  const [allDay, setAllDay] = useState(Boolean(existing?.allDay));
  const [weekdays, setWeekdays] = useState<Weekday[]>(existing?.recurrence?.weekdays ?? []);
  const [until, setUntil] = useState(existing?.recurrence?.until ?? '');

  /** Changer le début décale la fin d'autant (la durée est gardée). */
  const onStart = (value: string) => {
    if (!value) return;
    const duration = (((parseHM(end) - parseHM(start)) % 1440) + 1440) % 1440 || 60;
    setStart(value);
    setEnd(shiftTime(value, duration));
  };

  const toggleDay = (w: Weekday) => setWeekdays((cur) => (cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w]));

  const canSave = title.trim().length > 0 && Boolean(day);

  const save = () => {
    if (!canSave) return;
    let s: Date;
    let e: Date;
    if (allDay) {
      s = fromInputs(day, '00:00');
      e = addDays(s, 1);
    } else {
      s = fromInputs(day, start);
      e = fromInputs(day, end);
      // Une fin avant le début : l'événement finit le lendemain.
      if (e.getTime() <= s.getTime()) e = addDays(e, 1);
    }
    const recurrence: Recurrence | undefined = weekdays.length
      ? { freq: 'weekly', weekdays: DAYS.map((d) => d.weekday).filter((w) => weekdays.includes(w)), until: until || undefined }
      : undefined;
    const fields: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'> = {
      title: title.trim(),
      start: s.toISOString(),
      end: e.toISOString(),
      allDay: allDay || undefined,
      recurrence,
    };
    if (existing) saveEvent({ ...existing, ...fields });
    else addEvent(fields);
    onClose();
  };

  const remove = () => {
    if (!existing) return;
    deleteEvent(existing.id);
    onClose();
    showToast({ message: 'Événement supprimé', action: { label: 'Annuler', run: () => saveEvent(existing) } });
  };

  return (
    <Sheet title={existing ? 'Événement' : 'Nouvel événement'} onClose={onClose}>
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          save();
        }}
      >
        <input
          className="text-input text-input--title"
          aria-label="Titre"
          placeholder="Titre"
          value={title}
          autoFocus={!existing}
          onChange={(ev) => setTitle(ev.target.value)}
        />
        <div>
          <Field label="Date" htmlFor={ids.date}>
            <input id={ids.date} type="date" value={day} required onChange={(ev) => setDay(ev.target.value)} />
          </Field>
          <Field label="Journée entière" htmlFor={ids.allDay}>
            <input
              id={ids.allDay}
              type="checkbox"
              role="switch"
              className="switch"
              checked={allDay}
              onChange={(ev) => setAllDay(ev.target.checked)}
            />
          </Field>
          {!allDay && (
            <>
              <Field label="Début" htmlFor={ids.start}>
                <input id={ids.start} type="time" value={start} required onChange={(ev) => onStart(ev.target.value)} />
              </Field>
              <Field label="Fin" htmlFor={ids.end}>
                <input id={ids.end} type="time" value={end} required onChange={(ev) => ev.target.value && setEnd(ev.target.value)} />
              </Field>
            </>
          )}
          <Field label="Répéter">
            <div className="day-chips" role="group" aria-label="Jours de répétition">
              {DAYS.map((d) => (
                <button
                  key={d.weekday}
                  type="button"
                  className="chip"
                  aria-pressed={weekdays.includes(d.weekday)}
                  aria-label={d.name}
                  onClick={() => toggleDay(d.weekday)}
                >
                  {d.short}
                </button>
              ))}
            </div>
          </Field>
          {weekdays.length > 0 && (
            <Field label="Jusqu'au" htmlFor={ids.until}>
              <input id={ids.until} type="date" value={until} min={day} onChange={(ev) => setUntil(ev.target.value)} />
            </Field>
          )}
        </div>
        <div className="sheet__actions">
          <button type="submit" className="btn btn--primary btn--block" disabled={!canSave}>
            Enregistrer
          </button>
          {existing && (
            <button type="button" className="btn btn--danger btn--block" onClick={remove}>
              Supprimer
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}
