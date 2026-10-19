/** Composants partagés par tous les modes. */

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import type { ID, Priority } from '../core/types';
import { formatClock } from '../core/timer';
import { formatDuration } from '../core/time';
import { useStore } from '../state/store';
import { MODE_LABEL, MODES, useNav, type Mode } from '../state/nav';
import { PRIORITY_COLOR, PRIORITY_LABEL } from './palette';
import {
  IconCalendar,
  IconChecklist,
  IconChevronDown,
  IconLists,
  IconPause,
  IconPlay,
  IconPlus,
  IconSettings,
  IconTarget,
  IconTimer,
  IconX,
} from './icons';

/** Heure courante, rafraîchie toutes les `intervalMs`. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export const MODE_ICON: Record<Mode, (p: { size?: number }) => JSX.Element> = {
  calendar: IconCalendar,
  checklist: IconChecklist,
  lists: IconLists,
  goals: IconTarget,
  chrono: IconTimer,
  settings: IconSettings,
};

/** Durée du chrono en cours, « 00:42 » (h:min) ou « 00:42:17 ». */
export function useTimerClock(withSeconds = false): string | null {
  const { active } = useStore();
  const now = useNow(1000);
  if (!active) return null;
  const clock = formatClock(now.getTime() - new Date(active.start).getTime());
  return withSeconds ? clock : clock.slice(0, 5);
}

/** Pastille « ● 00:42 » quand un chrono tourne ; ouvre le mode Chrono. */
export function TimerPill() {
  const clock = useTimerClock();
  const { setMode, mode } = useNav();
  if (!clock || mode === 'chrono') return null;
  return (
    <button type="button" className="pill pill--sm timer-pill" onClick={() => setMode('chrono')} aria-label={`Chrono en cours : ${clock}`}>
      <span className="dot" aria-hidden="true" />
      <span>{clock}</span>
    </button>
  );
}

/** En-tête : sélecteur de mode à gauche, une seule chose à droite. */
export function Header({ right }: { right?: ReactNode }) {
  const { mode, menuOpen, setMenuOpen } = useNav();
  const Icon = MODE_ICON[mode];
  return (
    <header className="header">
      <button
        type="button"
        className="pill"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <Icon />
        <span>{MODE_LABEL[mode]}</span>
        <IconChevronDown size={18} />
      </button>
      {right ?? <TimerPill />}
    </header>
  );
}

/** Menu des modes, ancré sous le bouton du coin haut-gauche. */
export function ModeMenu() {
  const { mode, setMode, visibleModes, menuOpen, setMenuOpen } = useNav();
  const clock = useTimerClock();
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, setMenuOpen]);
  if (!menuOpen) return null;
  const items = MODES.filter((m) => visibleModes.includes(m));
  return (
    <div className="menu-layer" onClick={() => setMenuOpen(false)}>
      <div className="menu" role="menu" aria-label="Modes" onClick={(e) => e.stopPropagation()}>
        {items.map((m) => {
          const Icon = MODE_ICON[m];
          return (
            <button key={m} type="button" role="menuitem" className="menu__item" aria-current={m === mode} onClick={() => setMode(m)}>
              <Icon />
              <span style={{ flex: 1 }}>{MODE_LABEL[m]}</span>
              {m === 'chrono' && clock && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: m === mode ? '#fff' : 'var(--accent)' }}>
                  <span className="dot" style={{ background: m === mode ? '#fff' : 'var(--accent)' }} />
                  {clock}
                </span>
              )}
            </button>
          );
        })}
        <div className="menu__sep" aria-hidden="true" />
        <button type="button" role="menuitem" className="menu__item" aria-current={mode === 'settings'} onClick={() => setMode('settings')}>
          <IconSettings />
          <span>Réglages</span>
        </button>
      </div>
    </div>
  );
}

/** Feuille du bas avec voile ; Échap ou toucher le voile ferme. */
export function Sheet({ title, onClose, children, label }: { title?: ReactNode; onClose: () => void; children: ReactNode; label?: string }) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : label}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__handle" aria-hidden="true" />
        <div className="sheet__head">
          {title ? (
            <h2 id={titleId} className="sheet__title">
              {title}
            </h2>
          ) : (
            <span />
          )}
          <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}>
            <IconX />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Ligne de réglage : libellé à gauche, contrôle à droite. */
export function Field({ label, htmlFor, children }: { label: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="field">
      {htmlFor ? (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="field__label">{label}</span>
      )}
      <div className="field__control">{children}</div>
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ReactNode; style?: CSSProperties; ariaLabel?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          aria-label={o.ariaLabel}
          style={o.style}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Case carrée : le contour donne la priorité. */
export function PriorityCheck({
  priority,
  checked,
  onChange,
  label,
}: {
  priority: Priority;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      className="check"
      style={{ '--ring': PRIORITY_COLOR[priority] } as CSSProperties}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
    />
  );
}

export function Dot({ color, large }: { color: string; large?: boolean }) {
  return <span className={large ? 'dot dot--lg' : 'dot'} style={{ background: color }} aria-hidden="true" />;
}

export function Fab({ onClick, label = 'Ajouter' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="fab" aria-label={label} onClick={onClick}>
      <IconPlus size={24} />
    </button>
  );
}

/** Bouton rond play/pause qui lance le chrono d'une tâche. */
export function PlayButton({ taskId, title }: { taskId: ID; title: string }) {
  const { active, startTimer, pauseTimer } = useStore();
  const running = active?.taskId === taskId;
  return (
    <button
      type="button"
      className={running ? 'play-btn play-btn--on' : 'play-btn'}
      aria-label={running ? `Mettre en pause « ${title} »` : `Chronométrer « ${title} »`}
      onClick={() => (running ? pauseTimer() : startTimer(taskId))}
    >
      {running ? <IconPause size={16} /> : <IconPlay size={16} />}
    </button>
  );
}

/** Segmenté P1–P4 aux couleurs de priorité. */
export function PriorityPicker({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <Segmented<Priority>
      label="Priorité"
      value={value}
      onChange={onChange}
      options={([1, 2, 3, 4] as Priority[]).map((p) => ({
        value: p,
        label: `P${p}`,
        ariaLabel: `P${p} — ${PRIORITY_LABEL[p]}`,
        style: p === value ? { background: PRIORITY_COLOR[p], color: '#fff' } : { color: PRIORITY_COLOR[p] },
      }))}
    />
  );
}

export const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480];

export function DurationSelect({ id, value, onChange }: { id?: string; value: number; onChange: (min: number) => void }) {
  const options = DURATIONS.includes(value) ? DURATIONS : [...DURATIONS, value].sort((a, b) => a - b);
  return (
    <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {options.map((m) => (
        <option key={m} value={m}>
          {formatDuration(m)}
        </option>
      ))}
    </select>
  );
}

export function ToastView() {
  const { toast, showToast } = useNav();
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action!.run();
            showToast({ message: 'Annulé' });
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
