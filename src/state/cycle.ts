/** Mode Cycle : prédictions du jour, rappels et notifications, calculés depuis le store. */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CycleDay, CycleSettings, ISODate } from '../core/types';
import { forecast, hasLog, type Forecast } from '../core/cycle';
import { cycleSettingsOf } from '../core/cycleCatalog';
import { cycleReminders, type Reminder } from '../core/reminders';
import { formatHM, parseISODate, toISODate } from '../core/time';
import { formatDayMonth } from '../ui/format';
import { useStore } from './store';

export interface CycleView {
  settings: CycleSettings;
  today: ISODate;
  forecast: Forecast;
  byDate: Map<ISODate, CycleDay>;
  reminders: Reminder[];
}

/** Heure courante, rafraîchie chaque minute. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export const formatISODay = (d: ISODate) => formatDayMonth(parseISODate(d));

export function useCycle(): CycleView {
  const { cycleDays, cycleMarks, settings: appSettings } = useStore();
  const now = useMinute();
  const today = toISODate(now);
  const time = formatHM(now);
  const settings = useMemo(() => cycleSettingsOf(appSettings), [appSettings]);
  // Un an de cycles prévus, pour le calendrier.
  const fc = useMemo(() => forecast(cycleDays, cycleMarks, settings, today, 13), [cycleDays, cycleMarks, settings, today]);
  const byDate = useMemo(() => new Map(cycleDays.map((d) => [d.date, d])), [cycleDays]);
  const todayLog = byDate.get(today);
  const loggedToday = Boolean(todayLog && hasLog(todayLog));
  const reminders = useMemo(
    () => cycleReminders(fc, settings, today, time, loggedToday, formatISODay),
    [fc, settings, today, time, loggedToday],
  );
  return { settings, today, forecast: fc, byDate, reminders };
}

const NOTIFIED_KEY = 'planning.cycleNotified';

/** Rappels déjà notifiés aujourd'hui. */
function readNotified(today: ISODate): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? 'null') as { date: string; keys: string[] } | null;
    return raw?.date === today ? raw.keys : [];
  } catch {
    return [];
  }
}

function writeNotified(today: ISODate, keys: string[]) {
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify({ date: today, keys }));
  } catch {
    /* stockage indisponible : on risque une notification en double */
  }
}

async function notify(text: string) {
  const options = { body: text, icon: './icon-192.png', badge: './icon-192.png', tag: 'planning-cycle' };
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (reg) await reg.showNotification('Cycle', options);
  else new Notification('Cycle', options);
}

/** Envoie les rappels du jour en notification (une fois chacun), si on l'a permis. */
export function useCycleNotifications() {
  const { reminders, settings, today } = useCycle();
  const { ready } = useStore();
  const sent = useRef<string>('');
  useEffect(() => {
    if (!ready || !settings.notify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const done = readNotified(today);
    const fresh = reminders.filter((r) => !done.includes(r.key));
    const signature = `${today}|${fresh.map((r) => r.key).join(',')}`;
    if (!fresh.length || sent.current === signature) return;
    sent.current = signature;
    writeNotified(today, [...done, ...fresh.map((r) => r.key)]);
    for (const r of fresh) notify(r.text).catch((err) => console.error('Notification impossible', err));
  }, [ready, reminders, settings.notify, today]);
}
