/**
 * Liste simple réordonnable : appui long sur une ligne puis glisser pour la déplacer (les
 * autres lignes s'écartent), comme dans la Checklist mais sans sous-niveaux. Le clic qui suit
 * un déplacement est ignoré (`guard`), pour ne pas ouvrir la ligne qu'on vient de poser.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

/** Appui long avant de pouvoir déplacer une ligne. */
const LONG_PRESS_MS = 350;

type Gesture =
  | { kind: 'pending'; index: number; x: number; y: number; timer: number }
  | { kind: 'drag'; index: number; y: number; scrollY: number; tops: number[]; heights: number[] };

export function ReorderList<T extends { id: string }>({
  items,
  onReorder,
  render,
  style,
}: {
  items: T[];
  onReorder: (ids: string[]) => void;
  /** Contenu d'une ligne ; `guard` enveloppe ses actions au clic. */
  render: (item: T, guard: (action: () => void) => () => void) => ReactNode;
  style?: CSSProperties;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const swallow = useRef(false);
  const lastY = useRef(0);
  const [drag, setDrag] = useState<{ index: number; dy: number; to: number } | null>(null);

  // Pendant un déplacement, la page ne défile pas (écouteur non passif).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (gesture.current?.kind === 'drag' && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

  const update = (clientY: number) => {
    const g = gesture.current;
    if (!g || g.kind !== 'drag') return;
    const dy = clientY - g.y + (window.scrollY - g.scrollY);
    const center = g.tops[g.index] + dy + g.heights[g.index] / 2;
    let to = 0;
    g.tops.forEach((top, j) => {
      if (j !== g.index && top + g.heights[j] / 2 < center) to++;
    });
    setDrag({ index: g.index, dy, to });
  };

  // Défilement automatique près du bord de l'écran.
  useEffect(() => {
    if (!drag) return;
    let raf = 0;
    const tick = () => {
      if (gesture.current?.kind === 'drag') {
        const y = lastY.current;
        const speed = y < 72 ? -10 : y > window.innerHeight - 72 ? 10 : 0;
        if (speed) {
          window.scrollBy(0, speed);
          update(y);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  const reset = () => {
    const g = gesture.current;
    if (g?.kind === 'pending') window.clearTimeout(g.timer);
    gesture.current = null;
    setDrag(null);
  };

  const onPointerDown = (index: number) => (e: ReactPointerEvent<HTMLLIElement>) => {
    if (e.button !== 0) return;
    reset();
    const { clientX: x, clientY: y } = e;
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    const timer = window.setTimeout(() => {
      const rects = ([...(listRef.current?.children ?? [])] as HTMLElement[]).map((it) => it.getBoundingClientRect());
      gesture.current = {
        kind: 'drag',
        index,
        y,
        scrollY: window.scrollY,
        tops: rects.map((r) => r.top + window.scrollY),
        heights: rects.map((r) => r.height),
      };
      try {
        el.setPointerCapture(pointerId);
      } catch {
        /* pointeur déjà relâché */
      }
      navigator.vibrate?.(12);
      lastY.current = y;
      setDrag({ index, dy: 0, to: index });
    }, LONG_PRESS_MS);
    gesture.current = { kind: 'pending', index, x, y, timer };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLLIElement>) => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pending') {
      // Le doigt bouge avant l'appui long : on fait défiler la page.
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8) reset();
      return;
    }
    lastY.current = e.clientY;
    update(e.clientY);
  };

  const onPointerUp = () => {
    const g = gesture.current;
    if (g?.kind === 'drag' && drag) {
      swallow.current = true;
      window.setTimeout(() => (swallow.current = false), 350);
      if (drag.to !== drag.index) {
        const ids = items.map((i) => i.id);
        const [moved] = ids.splice(drag.index, 1);
        ids.splice(drag.to, 0, moved);
        onReorder(ids);
      }
    }
    reset();
  };

  // Aperçu : chaque ligne glisse vers sa future place.
  const shifts = useMemo(() => {
    const g = gesture.current;
    if (!drag || !g || g.kind !== 'drag') return null;
    const gap = g.tops.length > 1 ? g.tops[1] - g.tops[0] - g.heights[0] : 8;
    const size = g.heights[drag.index] + gap;
    return items.map((_, j) => {
      if (j === drag.index) return drag.dy;
      if (drag.index < j && j <= drag.to) return -size;
      if (drag.to <= j && j < drag.index) return size;
      return 0;
    });
  }, [drag, items]);

  const guard = (action: () => void) => () => {
    if (!swallow.current) action();
  };

  return (
    <ul ref={listRef} className="reorder-list" style={style}>
      {items.map((item, i) => (
        <li
          key={item.id}
          className={drag?.index === i ? 'reorder-list__item reorder-list__item--lifted' : drag ? 'reorder-list__item reorder-list__item--shifting' : 'reorder-list__item'}
          style={shifts ? { transform: `translateY(${shifts[i]}px)` } : undefined}
          onPointerDown={onPointerDown(i)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={reset}
          onContextMenu={(e) => e.preventDefault()}
        >
          {render(item, guard)}
        </li>
      ))}
    </ul>
  );
}
