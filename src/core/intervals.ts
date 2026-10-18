/** Intervalles demi-ouverts [start, end) en millisecondes. */
export interface Interval {
  start: number;
  end: number;
}

/** Trie, fusionne les chevauchements et retire les intervalles vides. */
export function normalize(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ start: iv.start, end: iv.end });
  }
  return out;
}

/** `base` moins `cut` (les deux normalisés). */
export function subtract(base: Interval[], cut: Interval[]): Interval[] {
  const out: Interval[] = [];
  let j = 0;
  for (const b of base) {
    let start = b.start;
    while (j < cut.length && cut[j].end <= start) j++;
    let k = j;
    while (k < cut.length && cut[k].start < b.end) {
      if (cut[k].start > start) out.push({ start, end: cut[k].start });
      start = Math.max(start, cut[k].end);
      k++;
    }
    if (start < b.end) out.push({ start, end: b.end });
  }
  return out;
}

/** Restreint à [from, to). */
export function clip(list: Interval[], from: number, to: number): Interval[] {
  const out: Interval[] = [];
  for (const iv of list) {
    const start = Math.max(iv.start, from);
    const end = Math.min(iv.end, to);
    if (end > start) out.push({ start, end });
  }
  return out;
}

export function totalLength(list: Interval[]): number {
  return list.reduce((sum, iv) => sum + (iv.end - iv.start), 0);
}
