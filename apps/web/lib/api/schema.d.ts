// Сгенерировано из apps/api/internal/api/openapi.yaml.
// Не редактировать руками: правится спека, потом `bun run codegen` (в apps/web).
// Генератор — scripts/openapi-types.ts.

/** Формат всех ошибок API */
export type Error = {
  /** Сообщение для пользователя */
  error: string;
  code:
    | "validation"
    | "not_found"
    | "conflict"
    | "unauthorized"
    | "bad_password"
    | "rate_limited"
    | "internal";
  /** Ошибки валидации по полям (только для `validation`) */
  fields?: Record<string, string>;
};

/** RFC 3339 с таймзоной */
export type DateTime = string;

/** `YYYY-MM-DD` */
export type Date = string;

export type Parity = "odd" | "even";

/** В публичных ответах всегда `published` */
export type Status = "draft" | "published";

export type SubjectColor =
  | "blue"
  | "indigo"
  | "violet"
  | "cyan"
  | "teal"
  | "emerald"
  | "amber"
  | "orange"
  | "rose"
  | "slate";

export type Link = {
  title: string;
  url: string;
};

export type Settings = {
  siteTitle: string;
  groupName: string;
  description: string;
  semesterStart: Date | null;
  semesterEnd: Date | null;
  firstWeekParity: Parity;
  timezone: string;
  links: Link[];
  /** В публичных ответах всегда пустая строка */
  inviteCode: string;
  updatedAt: DateTime;
};

/** Текущая учебная неделя, считается от начала семестра */
export type Week = {
  /** Номер недели; 0, если семестр не настроен */
  number: number;
  parity: Parity;
  start: DateTime;
  /** Сейчас идёт семестр */
  inRange: boolean;
  /** Дата начала семестра задана */
  configured: boolean;
};

export type AuthInfo = {
  /** Username бота; пусто, если вход через Telegram не настроен */
  telegramBot: string;
  telegramBotId: string;
  /** Доступен вход по имени (только вне production) */
  devLogin: boolean;
  /** Для первого входа нужен код доступа */
  inviteRequired: boolean;
};

export type SubjectRef = {
  id: number;
  slug: string;
  name: string;
  shortName: string;
  color: SubjectColor;
  /** Ключ иконки; пусто = иконка по умолчанию */
  icon: string;
};

export type Subject = SubjectRef & {
  teacher: string;
  /** MDX */
  description: string;
  links: Link[];
  position: number;
  createdAt: DateTime;
  updatedAt: DateTime;
};

export type SubjectWithCounts = Subject & {
  labsCount: number;
  notesCount: number;
  quizzesCount: number;
};

/** Денормализованные поля предмета у дочерних сущностей */
export type SubjectJoin = {
  subjectSlug: string;
  subjectName: string;
  subjectShortName: string;
  subjectColor: SubjectColor | "";
  subjectIcon: string;
};

export type Lab = SubjectJoin & {
  id: number;
  subjectId: number;
  /** Ноль допустим для необязательной вводной лабы */
  number: number;
  slug: string;
  title: string;
  summary: string;
  /** Задание, MDX */
  content: string;
  /** Требования, MDX */
  requirements: string;
  /** Как сдавать, MDX */
  submission: string;
  /** Варианты, MDX */
  variants: string;
  materials: Link[];
  deadlineAt: DateTime | null;
  deadlineNote: string;
  maxScore: number | null;
  teacher: string;
  status: Status;
  createdAt: DateTime;
  updatedAt: DateTime;
};

export type Note = SubjectJoin & {
  id: number;
  subjectId: number;
  number: number;
  slug: string;
  title: string;
  summary: string;
  /** MDX с формулами и кодом */
  content: string;
  lectureDate: Date | null;
  status: Status;
  createdAt: DateTime;
  updatedAt: DateTime;
  /** Опубликованные квизы, привязанные к конспекту */
  quizzesCount: number;
};

export type NoteResponse = Note & {
  quizzes: QuizSummary[];
  prev: Note | null;
  next: Note | null;
};

export type QuizOption = {
  id: string;
  /** Markdown */
  text: string;
  correct: boolean;
};

export type QuizQuestion = {
  id: string;
  type: "single" | "multiple" | "text";
  /** Markdown с формулами */
  prompt: string;
  /** Для `single` и `multiple` */
  options?: QuizOption[];
  /** Принимаемые ответы для `text`, сравнение без учёта регистра, пробелов и ё/е */
  answers?: string[];
  /** Показывается после ответа */
  explanation?: string;
  points?: number;
  tags?: string[];
};

export type Quiz = SubjectJoin & {
  id: number;
  subjectId: number | null;
  noteId: number | null;
  slug: string;
  title: string;
  description: string;
  questions: QuizQuestion[];
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  status: Status;
  createdAt: DateTime;
  updatedAt: DateTime;
  noteSlug: string;
  noteTitle: string;
};

export type QuizSummary = Quiz & {
  questionsCount: number;
};

export type FAQItem = {
  id: number;
  question: string;
  /** MDX */
  answer: string;
  category: string;
  position: number;
  createdAt: DateTime;
  updatedAt: DateTime;
};

export type Page = {
  id: number;
  slug: string;
  title: string;
  summary: string;
  /** MDX */
  content: string;
  position: number;
  /** Показывать в меню сайта */
  showInNav: boolean;
  status: Status;
  createdAt: DateTime;
  updatedAt: DateTime;
};

export type CalendarItem = {
  id: string;
  source: "lab" | "event" | "practice";
  kind: "deadline" | "test" | "exam" | "consultation" | "other" | "practice";
  title: string;
  startsAt: DateTime;
  endsAt: DateTime | null;
  allDay: boolean;
  location: string;
  description: string;
  /** Путь на сайте, например `/labs/prog/lab-1` */
  path: string;
  /** Внешняя ссылка события, если есть */
  url: string;
  subject: SubjectRef | null;
  /** Только для `source: lab` */
  labNumber?: number;
  /** Только для `source: lab` */
  labId?: number;
};

export type SearchResult = {
  kind: "lab" | "note" | "quiz" | "faq" | "page" | "subject";
  title: string;
  subtitle: string;
  /** Путь на сайте */
  path: string;
  /** Фрагмент текста, совпадения обёрнуты в <mark>; может быть пустым */
  snippet: string;
};

export type SettingsResponse = {
  settings: Settings;
  week: Week;
  now: DateTime;
  /** Страницы с `showInNav`, без `content` */
  navPages: Page[];
  auth: AuthInfo;
};

export type HomeResponse = {
  settings: Settings;
  week: Week;
  now: DateTime;
  /** Только дедлайны лаб */
  upcomingDeadlines: CalendarItem[];
  overdueDeadlines: CalendarItem[];
  /** Контрольные, экзамены, консультации и сдачи */
  upcomingEvents: CalendarItem[];
  recentNotes: Note[];
  subjects: SubjectWithCounts[];
};

export type SubjectResponse = {
  subject: Subject;
  labs: Lab[];
  notes: Note[];
  quizzes: QuizSummary[];
};

export type CalendarResponse = {
  items: CalendarItem[];
  from: DateTime;
  to: DateTime;
  now: DateTime;
};

export type PublicUser = {
  id: number;
  name: string;
  photoUrl: string;
};

export type LabRef = {
  id: number;
  number: number;
  title: string;
  slug: string;
  subjectSlug: string;
};

export type Participant = {
  user: PublicUser;
  labs: LabRef[];
};

export type PracticeSession = SubjectJoin & {
  id: number;
  subjectId: number;
  startsAt: DateTime;
  endsAt: DateTime | null;
  location: string;
  /** `null` = без ограничения */
  capacity: number | null;
  note: string;
  createdAt: DateTime;
  updatedAt: DateTime;
  /** Число записавшихся студентов */
  signupsCount: number;
};

export type PracticeSessionView = PracticeSession & {
  /** Только для вошедших студентов, иначе пусто */
  participants: Participant[];
  myLabIds: number[];
  /** Мест нет */
  full: boolean;
  /** Занятие уже прошло */
  past: boolean;
  /** Опубликованные лабы предмета, только для вошедших */
  availableLabs: LabRef[];
};

export type PracticeListResponse = {
  sessions: PracticeSessionView[];
  now: DateTime;
  signedIn: boolean;
};

export type Comment = {
  id: number;
  targetType: "note" | "lab" | "post";
  targetId: number;
  body: string;
  createdAt: DateTime;
  updatedAt: DateTime;
  authorId: number;
  authorName: string;
  authorPhotoUrl: string;
  attachments: Attachment[];
  /** Комментарий текущего студента */
  mine: boolean;
};

export type Post = {
  id: number;
  kind: "shawarma" | "joke";
  /** Название точки для шавермы */
  title: string;
  body: string;
  address: string;
  /** Цена в рублях */
  price: number | null;
  rating: number | null;
  /** `members` — только для вошедших студентов */
  visibility: "public" | "members";
  /** Пометка 18+; сайт размывает текст до подтверждения возраста */
  nsfw: boolean;
  createdAt: DateTime;
  updatedAt: DateTime;
  authorId: number;
  authorName: string;
  authorPhotoUrl: string;
  likesCount: number;
  commentsCount: number;
  attachments: Attachment[];
  liked: boolean;
  mine: boolean;
};

export type PostInput = {
  /** Задаётся при создании */
  kind: "shawarma" | "joke";
  title?: string;
  body: string;
  address?: string;
  price?: number | null;
  /** Обязательна для шавермы */
  rating?: number | null;
  visibility?: "public" | "members";
  /** При true видимость принудительно становится members */
  nsfw?: boolean;
  /** Файлы поста по порядку. При обновлении без поля файлы не меняются, пустой список убирает все */
  attachmentIds?: string[];
};

/** Вложение — картинка или файл */
export type Attachment = {
  id: string;
  /** Адрес от корня сайта: /api/v1/files/{id}/{name} */
  url: string;
  /** Исходное имя файла */
  name: string;
  contentType: string;
  /** Размер в байтах */
  size: number;
  /** Ширина картинки с учётом поворота из EXIF */
  width: number | null;
  height: number | null;
  createdAt: DateTime;
};
