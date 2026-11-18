/**
 * Where the reader stopped in a lecture, kept in the browser. The place is
 * tied to a heading and a share of its section, not to pixels: it survives
 * another screen width, a rotated phone and pictures that load late.
 */
export type ReadingPosition = {
  /** Id of the heading the reader is under; empty before the first one. */
  heading: string;
  /** How far through that section, 0..1. */
  part: number;
  /** How much of the whole lecture is behind, 0..1. */
  progress: number;
  at: string;
};

const KEY = "edu3105:note-positions";
/** Lectures remembered at once; the oldest go first. */
const KEEP = 60;
/** The reading line sits right under the sticky header (same as in the TOC). */
const HEADER_OFFSET = 96;
/** Closer to the top than this there is nothing worth returning to. */
const START_PX = 400;
/** From here the lecture counts as read to the end. */
export const DONE = 0.97;

type Stored = Record<string, ReadingPosition>;

function readAll(): Stored {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Stored) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Stored): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage may be unavailable (private mode); ignore.
  }
}

export function readPosition(note: string): ReadingPosition | null {
  const pos = readAll()[note];
  if (!pos || typeof pos.part !== "number" || typeof pos.progress !== "number")
    return null;
  return pos;
}

/** Saves the place; `null` forgets it (the start or the end of the lecture). */
export function writePosition(note: string, pos: ReadingPosition | null): void {
  const all = readAll();
  delete all[note];
  if (pos) all[note] = pos;
  const keys = Object.keys(all);
  if (keys.length > KEEP) {
    keys.sort((a, b) => (all[a].at < all[b].at ? -1 : 1));
    for (const key of keys.slice(0, keys.length - KEEP)) delete all[key];
  }
  writeAll(all);
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** Sections of the text: the lead before the first heading, then h2/h3. */
function sections(body: HTMLElement) {
  const offset = window.scrollY;
  const rect = body.getBoundingClientRect();
  const marks = [{ id: "", top: rect.top + offset }];
  for (const el of body.querySelectorAll<HTMLElement>("h2[id], h3[id]")) {
    marks.push({ id: el.id, top: el.getBoundingClientRect().top + offset });
  }
  const bottom = rect.bottom + offset;
  return marks.map((mark, i) => ({
    ...mark,
    height: Math.max(1, (marks[i + 1]?.top ?? bottom) - mark.top),
  }));
}

/** Document offsets of the text and the scroll distance it takes to read. */
function span(body: HTMLElement) {
  const rect = body.getBoundingClientRect();
  const top = rect.top + window.scrollY;
  return {
    top,
    // Дочитано, когда низ текста показался в окне, а не дошёл до шапки.
    length: rect.height - (window.innerHeight - HEADER_OFFSET),
  };
}

export type Measured = {
  /** Place worth returning to; null at the very start and at the end. */
  position: ReadingPosition | null;
  progress: number;
};

/** Where the reader is now. */
export function measure(body: HTMLElement): Measured {
  const line = window.scrollY + HEADER_OFFSET;
  const { top, length } = span(body);
  const progress = length > 0 ? clamp((line - top) / length) : 1;
  if (window.scrollY < START_PX) return { position: null, progress: 0 };
  if (progress >= DONE) return { position: null, progress: 1 };
  const all = sections(body);
  const current = all.findLast((s) => s.top <= line) ?? all[0];
  return {
    position: {
      heading: current.id,
      part: clamp((line - current.top) / current.height),
      progress,
      at: new Date().toISOString(),
    },
    progress,
  };
}

/** Scroll offset of a saved place in the page as it is laid out now. */
export function offsetOf(body: HTMLElement, pos: ReadingPosition): number {
  const section = sections(body).find((s) => s.id === pos.heading);
  if (section) {
    return section.top + pos.part * section.height - HEADER_OFFSET;
  }
  // Заголовок переименовали или убрали — остаётся доля всего текста.
  const { top, length } = span(body);
  return top + pos.progress * Math.max(0, length) - HEADER_OFFSET;
}
