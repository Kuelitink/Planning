/**
 * Mode Cycle : le suivi du cycle menstruel façon Clue. Trois vues : l'anneau du cycle en
 * cours (avec rappels et prédictions), le calendrier, et l'analyse (moyennes, historique,
 * tendances). Les données restent sur l'appareil ; on peut importer un export Clue.
 */

import { useMemo, useState } from 'react';
import type { ISODate } from '../core/types';
import { addDaysISO, dayMarks, daysBetween, type Forecast } from '../core/cycle';
import type { CycleSettings } from '../core/types';
import { categoryLabel, optionLabel } from '../core/cycleCatalog';
import { phaseHighlights, timing } from '../core/insights';
import { parseISODate } from '../core/time';
import { useCycle } from '../state/cycle';
import { useNav } from '../state/nav';
import { Fab, Header, TimerPill } from '../ui/kit';
import { IconBell, IconSettings, IconUpload } from '../ui/icons';
import { CycleRing } from './cycle/CycleRing';
import { CycleCalendar } from './cycle/CycleCalendar';
import { CycleAnalysis } from './cycle/CycleAnalysis';
import { PHASE_INFO, historyPhase } from './cycle/phaseInfo';
import { DayChips, Legend, WEEKDAY_LETTER, dayMonth, formatRange, numClass, phaseLabel, plural, relativeDays } from './cycle/shared';
import './cycle.css';

type View = 'cycle' | 'calendar' | 'analysis';

const VIEW_KEY = 'planning.cycleView';
const VIEWS: { value: View; label: string }[] = [
  { value: 'cycle', label: 'Cycle' },
  { value: 'calendar', label: 'Calendrier' },
  { value: 'analysis', label: 'Analyse' },
];

function readView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'cycle' || v === 'calendar' || v === 'analysis') return v;
  } catch {
    /* stockage indisponible */
  }
  return 'cycle';
}

export function CycleMode() {
  const { openSheet } = useNav();
  const { today } = useCycle();
  const [view, setViewState] = useState<View>(readView);

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* préférence non retenue */
    }
  };

  return (
    <>
      <Header
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <TimerPill />
            <button type="button" className="icon-btn" aria-label="Réglages du cycle" onClick={() => openSheet({ kind: 'cycleSettings' })}>
              <IconSettings />
            </button>
          </div>
        }
      />
      <div className="cy-tabs" role="group" aria-label="Affichage">
        {VIEWS.map((v) => (
          <button key={v.value} type="button" aria-pressed={view === v.value} onClick={() => setView(v.value)}>
            {v.label}
          </button>
        ))}
      </div>

      {view === 'cycle' && <CycleToday />}
      {view === 'calendar' && <CycleCalendar />}
      {view === 'analysis' && <CycleAnalysis />}

      <Fab label="Noter aujourd'hui" onClick={() => openSheet({ kind: 'cycleDay', date: today })} />
    </>
  );
}

/** Vue « Cycle » : anneau, rappels, semaine, aujourd'hui, prédictions. */
function CycleToday() {
  const { openSheet } = useNav();
  const { settings, today, forecast: fc, byDate, days, reminders } = useCycle();
  const hasData = Boolean(fc.cycleStart);
  const length = fc.cycleLength ?? settings.cycleLength;
  const start = fc.cycleStart;

  const marks = useMemo(() => {
    const from = addDaysISO(today, -7);
    const to = addDaysISO(start ? addDaysISO(start, length) : today, 7);
    return dayMarks([...byDate.values()], fc, settings, start && start < from ? start : from, to, today);
  }, [byDate, fc, settings, today, start, length]);

  const openDay = (date: ISODate) => openSheet({ kind: 'cycleDay', date });

  let next: { text: string; late?: boolean } | null = null;
  if (fc.phase === 'period') next = { text: 'Règles en cours' };
  else if (fc.lateDays > 0) next = { text: `Retard de ${plural(fc.lateDays, 'jour')}`, late: true };
  else if (fc.daysUntil !== undefined)
    next = { text: fc.daysUntil === 0 ? "Règles prévues aujourd'hui" : `Règles ${relativeDays(fc.daysUntil)}` };

  // Fenêtre fertile et SPM : ceux du cycle en cours, ou du suivant s'ils sont passés.
  const nextFertile = fc.upcoming.find((u) => u.fertile[1] >= today)?.fertile;
  const nextOvulation = fc.upcoming.find((u) => u.ovulation >= today)?.ovulation;
  const nextPms = fc.upcoming.find((u) => u.pms[1] >= today)?.pms;
  // Crampes probables : leur moment habituel appliqué aux prochaines règles (3 cycles concernés au moins).
  const cramps = useMemo(() => timing(days, fc, 'pain', 'period_cramps').next, [days, fc]);

  return (
    <>
      <CycleRing start={start} length={length} today={today} marks={marks} onPick={openDay}>
        {hasData ? (
          <>
            <span className="cy-ring__day">J{fc.cycleDay}</span>
            <span className="cy-ring__phase">{phaseLabel(fc.phase!, settings)}</span>
            {next && <span className={next.late ? 'cy-ring__next cy-ring__next--late' : 'cy-ring__next'}>{next.text}</span>}
          </>
        ) : (
          <>
            <span className="cy-ring__phase" style={{ color: 'var(--ink)', fontSize: 17 }}>
              {fc.lastPeriod
                ? `Pas de règles notées depuis le ${dayMonth(fc.lastPeriod)} ${fc.lastPeriod.slice(0, 4)}`
                : 'Note tes premières règles'}
            </span>
            <span className="cy-ring__phase" style={{ fontWeight: 500 }}>
              {fc.lastPeriod ? 'Note tes prochaines règles pour relancer les prédictions' : 'ou importe tes données Clue'}
            </span>
          </>
        )}
      </CycleRing>
      {hasData && <Legend settings={settings} />}

      {!hasData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
          <button type="button" className="btn btn--primary btn--block" onClick={() => openDay(today)}>
            Noter aujourd'hui
          </button>
          <button type="button" className="btn btn--secondary btn--block" onClick={() => openSheet({ kind: 'cycleImport' })}>
            <IconUpload size={18} />
            Importer depuis Clue
          </button>
        </div>
      )}

      {reminders.length > 0 && (
        <div className="stack section" role="status">
          {reminders.map((r) => (
            <div key={r.key} className={`cy-banner cy-banner--${r.kind}`}>
              <IconBell size={18} />
              <span>{r.text}</span>
              {r.kind === 'checkin' && (
                <button type="button" onClick={() => openDay(today)}>
                  Noter
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <section className="section" aria-label="Cette semaine">
        <div className="cy-strip">
          {Array.from({ length: 7 }, (_, i) => addDaysISO(today, i - 3)).map((date) => {
            const d = parseISODate(date);
            const mark = marks.get(date);
            const future = date > today;
            return (
              <button
                key={date}
                type="button"
                disabled={future}
                aria-current={date === today ? 'date' : undefined}
                aria-label={`${dayMonth(date)}${mark?.cycleDay ? `, jour ${mark.cycleDay}` : ''}${future ? '' : ' — noter'}`}
                onClick={() => openDay(date)}
              >
                <span>{WEEKDAY_LETTER[d.getDay()]}</span>
                <span className={numClass(mark, false)}>{d.getDate()}</span>
                <span className={mark?.logged ? 'cy-logdot' : 'cy-logdot cy-logdot--none'} />
              </button>
            );
          })}
        </div>
      </section>

      {hasData && (
        <section className="section cy-card" aria-label="Aujourd'hui">
          <div className="cy-card__head">
            <div>
              <h2 className="cy-card__title">Aujourd'hui</h2>
              {fc.cycleDay && <p className="cy-card__sub">Jour {fc.cycleDay} du cycle</p>}
            </div>
            <button
              type="button"
              className="btn btn--primary"
              style={{ height: 40, padding: '0 16px', fontSize: 15 }}
              onClick={() => openDay(today)}
            >
              Noter
            </button>
          </div>
          <DayChips day={byDate.get(today)} empty="Rien de noté aujourd'hui." />
        </section>
      )}

      {hasData && fc.phase && <PhaseCard fc={fc} settings={settings} today={today} />}

      {hasData && fc.nextPeriod && (
        <section className="section">
          <h2 className="section-label">Prédictions</h2>
          <div className="cy-card" style={{ padding: '4px 16px' }}>
            <div className="cy-pred">
              <span className="cy-swatch" style={{ background: 'var(--cy-period)' }} aria-hidden="true" />
              <span className="cy-pred__label">Prochaines règles</span>
              <span className="cy-pred__value">
                {fc.lateDays > 0 ? `Attendues le ${dayMonth(addDaysISO(fc.nextPeriod, -fc.lateDays))}` : dayMonth(fc.nextPeriod)}
                {fc.lateDays > 0 ? (
                  <small>{plural(fc.lateDays, 'jour')} de retard</small>
                ) : (
                  <>
                    <small>{relativeDays(fc.daysUntil!)}</small>
                    <small>entre le {formatRange(fc.nextRange![0], fc.nextRange![1])}</small>
                  </>
                )}
              </span>
            </div>
            {settings.showFertile && nextFertile && (
              <div className="cy-pred">
                <span className="cy-swatch" style={{ background: 'var(--cy-fertile-soft)' }} aria-hidden="true" />
                <span className="cy-pred__label">Fenêtre fertile</span>
                <span className="cy-pred__value">
                  {formatRange(nextFertile[0], nextFertile[1])}
                  <small>{nextFertile[0] <= today ? 'en cours' : relativeDays(daysBetween(today, nextFertile[0]))}</small>
                </span>
              </div>
            )}
            {settings.showOvulation && nextOvulation && (
              <div className="cy-pred">
                <span className="cy-swatch" style={{ background: 'var(--cy-fertile)' }} aria-hidden="true" />
                <span className="cy-pred__label">Ovulation</span>
                <span className="cy-pred__value">
                  {dayMonth(nextOvulation)}
                  <small>{relativeDays(daysBetween(today, nextOvulation))}</small>
                </span>
              </div>
            )}
            {cramps && cramps[1] >= today && (
              <div className="cy-pred">
                <span className="cy-swatch" style={{ background: '#D6457A' }} aria-hidden="true" />
                <span className="cy-pred__label">Crampes probables</span>
                <span className="cy-pred__value">
                  {formatRange(cramps[0], cramps[1])}
                  <small>{cramps[0] <= today ? 'en cours' : relativeDays(daysBetween(today, cramps[0]))}</small>
                </span>
              </div>
            )}
            {settings.showPms && nextPms && (
              <div className="cy-pred">
                <span className="cy-swatch" style={{ background: 'var(--cy-pms-soft)' }} aria-hidden="true" />
                <span className="cy-pred__label">SPM</span>
                <span className="cy-pred__value">
                  {formatRange(nextPms[0], nextPms[1])}
                  <small>{nextPms[0] <= today ? 'en cours' : relativeDays(daysBetween(today, nextPms[0]))}</small>
                </span>
              </div>
            )}
          </div>
          <p className="cy-foot">
            {fc.stats.sample > 0
              ? `Estimations d'après ${fc.stats.sample > 1 ? `tes ${fc.stats.sample} derniers cycles` : 'ton dernier cycle'} (cycle de ${fc.stats.cycleLength} j, règles de ${fc.stats.periodLength} j).`
              : `Estimations d'après les durées des réglages (cycle de ${fc.stats.cycleLength} j) : elles s'affinent à chaque cycle noté.`}{' '}
            Ce n'est pas une méthode de contraception.
          </p>
        </section>
      )}
    </>
  );
}

/** Fin de la phase en cours (veille de la phase suivante). */
function phaseEnd(fc: Forecast): string | undefined {
  switch (fc.phase) {
    case 'period':
      return fc.periodUntil;
    case 'follicular':
      return fc.fertile && addDaysISO(fc.fertile[0], -1);
    case 'fertile':
    case 'ovulation':
      return fc.fertile?.[1];
    case 'luteal':
      return fc.pms && addDaysISO(fc.pms[0], -1);
    case 'pms':
      return fc.nextPeriod && addDaysISO(fc.nextPeriod, -1);
    default:
      return undefined;
  }
}

/** La phase en cours : ce qui se passe dans le corps, et ce qui revient chez toi à ce moment-là. */
function PhaseCard({ fc, settings, today }: { fc: Forecast; settings: CycleSettings; today: ISODate }) {
  const { days, contexts } = useCycle();
  const phase = fc.phase!;
  // Phase masquée dans les réglages : on montre le texte de la phase affichée à la place.
  const shown =
    (phase === 'fertile' || phase === 'ovulation') && !settings.showFertile
      ? 'follicular'
      : phase === 'pms' && !settings.showPms
        ? 'luteal'
        : phase;
  const info = PHASE_INFO[shown === 'ovulation' ? 'fertile' : shown];
  const highlights = useMemo(() => phaseHighlights(days, contexts, historyPhase(phase)), [days, contexts, phase]);
  const end = phaseEnd(fc);

  return (
    <section className="section cy-card" aria-label="Ta phase">
      <h2 className="cy-card__title">{phaseLabel(phase, settings)}</h2>
      <p className="cy-card__sub">
        Jour {fc.cycleDay} du cycle{end && end >= today ? ` · jusqu'au ${dayMonth(end)}` : ''}
      </p>
      <p className="cy-phase__text">{info.body}</p>
      <p className="cy-phase__text">{info.feel}</p>
      {highlights.length > 0 && (
        <>
          <h3 className="cy-phase__label">Chez toi à ce moment du cycle</h3>
          <div className="cy-chips">
            {highlights.map((h) => (
              <span key={`${h.category}.${h.option}`} className="cy-tag">
                {h.category === 'pms' ? 'SPM' : optionLabel(h.category, h.option)}
                <span style={{ color: 'var(--muted)', fontWeight: 600 }}>
                  {h.category !== 'pms' ? `${categoryLabel(h.category)} · ` : ''}
                  {h.cycles}/{h.of} cycles
                </span>
              </span>
            ))}
          </div>
        </>
      )}
      <p className="cy-foot">{info.tip} Infos générales, pas un avis médical.</p>
    </section>
  );
}
