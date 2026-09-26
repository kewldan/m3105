/**
 * Kind of a class taken from the start of a note title: "Лекция 3. …" → "Лекция 3",
 * "Практика 25 сентября. …" → "Практика". `number` is only the order of notes within a
 * subject, so it can't be shown as a lecture number. Null for titles without a kind.
 */
export function noteKind(title: string): string | null {
  const m = /^(Лекция|Практика|Семинар)(?=[\s.:]|$)(?:\s+(\d+)(?=[.:]))?/.exec(
    title,
  );
  if (!m) return null;
  return m[2] ? `${m[1]} ${m[2]}` : m[1];
}
