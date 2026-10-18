import type { CalendarEvent, ID } from './types';
import { addDays, atMinutes, DAY, parseDateTime, parseISODate, startOfDay } from './time';

export interface EventOccurrence {
  eventId: ID;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
}

/** Occurrences des événements (récurrences hebdomadaires dépliées) qui chevauchent [from, to). */
export function expandEvents(events: CalendarEvent[], from: Date, to: Date): EventOccurrence[] {
  const out: EventOccurrence[] = [];
  const fromMs = from.getTime();
  const toMs = to.getTime();
  for (const ev of events) {
    const start = parseDateTime(ev.start);
    const end = parseDateTime(ev.end);
    const durationMs = end.getTime() - start.getTime();
    if (!(durationMs > 0)) continue;
    const allDay = Boolean(ev.allDay);
    const push = (s: Date, e: Date) => {
      if (s.getTime() < toMs && e.getTime() > fromMs) out.push({ eventId: ev.id, title: ev.title, start: s, end: e, allDay });
    };

    if (!ev.recurrence) {
      push(start, end);
      continue;
    }

    const firstDay = startOfDay(start);
    const minutesOfDay = start.getHours() * 60 + start.getMinutes();
    const weekdays: number[] = ev.recurrence.weekdays.length ? ev.recurrence.weekdays : [start.getDay()];
    const until = ev.recurrence.until ? parseISODate(ev.recurrence.until).getTime() : Infinity;
    // Une occurrence commencée avant `from` peut encore le chevaucher.
    const back = Math.ceil(durationMs / DAY) + 1;
    let day = addDays(startOfDay(from), -back);
    if (day < firstDay) day = firstDay;
    for (; day.getTime() < toMs && day.getTime() <= until; day = addDays(day, 1)) {
      if (!weekdays.includes(day.getDay())) continue;
      const s = atMinutes(day, minutesOfDay);
      push(s, new Date(s.getTime() + durationMs));
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}
