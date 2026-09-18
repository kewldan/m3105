// Типы, которые отдаёт публичное API, приезжают из OpenAPI-спеки
// (`apps/api/internal/api/openapi.yaml`, генерация — `bun run codegen`).
// Источник правды один: правится спека, а не этот файл; CI падает при расхождении.
// Всё остальное — админские формы и личный кабинет — описано здесь руками:
// эти эндпоинты в публичную спеку не входят.
import type * as Schema from "./schema";

export type Attachment = Schema.Attachment;
export type AuthInfo = Schema.AuthInfo;
export type CalendarItem = Schema.CalendarItem;
export type CalendarResponse = Schema.CalendarResponse;
export type Comment = Schema.Comment;
export type FAQItem = Schema.FAQItem;
export type HomeResponse = Schema.HomeResponse;
export type Lab = Schema.Lab;
export type LabRef = Schema.LabRef;
export type Link = Schema.Link;
export type Note = Schema.Note;
export type NoteResponse = Schema.NoteResponse;
export type Page = Schema.Page;
export type Parity = Schema.Parity;
export type Participant = Schema.Participant;
export type Post = Schema.Post;
export type PostInput = Schema.PostInput;
export type PracticeListResponse = Schema.PracticeListResponse;
export type PracticeSession = Schema.PracticeSession;
export type PracticeSessionView = Schema.PracticeSessionView;
export type PublicUser = Schema.PublicUser;
export type Quiz = Schema.Quiz;
export type QuizOption = Schema.QuizOption;
export type QuizQuestion = Schema.QuizQuestion;
export type QuizSummary = Schema.QuizSummary;
export type SearchResult = Schema.SearchResult;
export type Settings = Schema.Settings;
export type SettingsResponse = Schema.SettingsResponse;
export type Status = Schema.Status;
export type Subject = Schema.Subject;
export type SubjectColor = Schema.SubjectColor;
export type SubjectRef = Schema.SubjectRef;
export type SubjectResponse = Schema.SubjectResponse;
export type SubjectWithCounts = Schema.SubjectWithCounts;
export type Week = Schema.Week;

// Mirrors the JSON shapes produced by apps/api (Go). Keep in sync with
// apps/api/internal/models and apps/api/internal/store.

export const SUBJECT_COLORS: SubjectColor[] = [
  "blue",
  "indigo",
  "violet",
  "cyan",
  "teal",
  "emerald",
  "amber",
  "orange",
  "rose",
  "slate",
];

export type EventKind = "deadline" | "test" | "exam" | "consultation" | "other";
/** Calendar items also include practice (lab defence) sessions. */
export type CalendarKind = EventKind | "practice";

export type SubjectInput = {
  slug?: string;
  name: string;
  shortName: string;
  color: SubjectColor;
  icon: string;
  teacher: string;
  description: string;
  links: Link[];
  position: number;
};

type SubjectJoin = {
  subjectSlug: string;
  subjectName: string;
  subjectShortName: string;
  subjectColor: SubjectColor | "";
  subjectIcon: string;
};

export type LabInput = {
  subjectId: number;
  number: number;
  slug?: string;
  title: string;
  summary: string;
  content: string;
  requirements: string;
  submission: string;
  variants: string;
  materials: Link[];
  deadlineAt: string | null;
  deadlineNote: string;
  maxScore: number | null;
  teacher: string;
  status: Status;
};

export type Event = SubjectJoin & {
  id: number;
  title: string;
  kind: EventKind;
  subjectId: number | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string;
  description: string;
  url: string;
  createdAt: string;
  updatedAt: string;
};

export type EventInput = {
  title: string;
  kind: EventKind;
  subjectId: number | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string;
  description: string;
  url: string;
};

export type FAQInput = {
  question: string;
  answer: string;
  category: string;
  position: number;
};

export type PageInput = {
  slug?: string;
  title: string;
  summary: string;
  content: string;
  position: number;
  showInNav: boolean;
  status: Status;
};

export type NoteInput = {
  subjectId: number;
  number: number;
  slug?: string;
  title: string;
  summary: string;
  content: string;
  lectureDate: string | null;
  status: Status;
};

export type QuestionType = "single" | "multiple" | "text";

export type QuizInput = {
  subjectId: number | null;
  noteId: number | null;
  slug?: string;
  title: string;
  description: string;
  questions: QuizQuestion[];
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  status: Status;
};

// ---- aggregated responses ----

export type OverviewResponse = {
  subjects: number;
  labs: number;
  labsDraft: number;
  notes: number;
  quizzes: number;
  faq: number;
  pages: number;
  events: number;
  users: number;
  /** Accounts waiting for an admin to confirm their group. */
  pendingUsers: number;
  practice: number;
  upcoming: CalendarItem[];
};

// ---- student accounts ----

export type User = {
  id: number;
  /** Shown name: the admin's displayName when set, otherwise telegramName. */
  name: string;
  /** Refreshed from Telegram on every login. */
  telegramName: string;
  /** Permanent override set by an admin ("Имя Фамилия"); empty when not set. */
  displayName: string;
  /** Study group the account belongs to; confirmed by an admin. */
  groupName: string;
  /** False until an admin confirms the account: student actions are locked. */
  approved: boolean;
  approvedAt: string | null;
  telegramId: number | null;
  telegramUsername: string;
  photoUrl: string;
  createdAt: string;
  lastLoginAt: string;
};

export type AdminUser = User & {
  passkeysCount: number;
  completionsCount: number;
  signupsCount: number;
};

export type AdminUserInput = {
  displayName: string;
  groupName: string;
  approved: boolean;
};

export type Passkey = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type PracticeSessionInput = {
  subjectId: number;
  startsAt: string;
  endsAt: string | null;
  location: string;
  capacity: number | null;
  note: string;
};

export type MySignup = { session: PracticeSession; labs: LabRef[] };

export type MeResponse = {
  user: User;
  completedLabIds: number[];
  signups: MySignup[];
  passkeys: Passkey[];
};

export type TelegramAuthData = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

export type PasskeyBeginResponse<T> = { challengeId: string; options: T };

export type ApiErrorBody = {
  error: string;
  code: string;
  fields?: Record<string, string>;
};

// ---- social: comments and posts ----

export type CommentTarget = "note" | "lab" | "post";

export type AdminComment = Comment & {
  targetTitle: string | null;
  targetPath: string | null;
};

export type PostKind = "shawarma" | "joke";

/** `members` — пост видят только вошедшие через Telegram студенты. */
export type PostVisibility = "public" | "members";

export type PostSort = "new" | "top";

// ---- attachments ----

/** К чему относится файл: ссылка из текстов админки, комментарий, пост или незаконченная загрузка студента. */
export type AttachmentPlace = "content" | "comment" | "post" | "pending";

export type ContentRef = {
  type: "note" | "lab" | "page" | "faq" | "subject";
  title: string;
  path: string;
};

export type AdminAttachment = Attachment & {
  place: AttachmentPlace;
  /** Кто загрузил; null — админка. */
  authorName: string | null;
  targetTitle: string | null;
  targetPath: string | null;
  /** Тексты со ссылкой на файл (только для файлов админки). */
  usedIn: ContentRef[];
};

/** Агрегированный поисковый запрос для админской аналитики. */
export type SearchStat = {
  query: string;
  /** Сколько раз искали за период. */
  count: number;
  /** Из них — сколько раз выдача была пустой. */
  empty: number;
  /** Сколько нашлось в последний раз. */
  results: number;
  lastAt: string;
};
