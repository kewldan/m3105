/**
 * Теги кеша публичного контента. Их вешает `apiServer`, а сбрасывает
 * `/api/revalidate`, когда Go-админка сообщает об изменении — так страницы
 * обновляются сразу после сохранения, а не по таймеру.
 *
 * Держать в синхроне с `tagsForPath` в `apps/api/internal/api/api.go`.
 */
export const TAG = {
  settings: "settings",
  subjects: "subjects",
  labs: "labs",
  notes: "notes",
  quizzes: "quizzes",
  faq: "faq",
  pages: "pages",
  calendar: "calendar",
  practice: "practice",
  home: "home",
  /** Коммит API в подвале: админка его не меняет, живёт только по TTL. */
  version: "version",
} as const;

export type CacheTag = (typeof TAG)[keyof typeof TAG];
