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
export type CppCheckResult = Schema.CppCheckResult;
export type CppDiagnostic = Schema.CppDiagnostic;
export type CppEdit = Schema.CppEdit;
export type GradeColumn = Schema.GradeColumn;
export type GradeEntry = Schema.GradeEntry;
export type GradeLab = Schema.GradeLab;
export type GradeSourceSummary = Schema.GradeSourceSummary;
export type GradesResponse = Schema.GradesResponse;
export type HomeResponse = Schema.HomeResponse;
export type Health = Schema.Health;
export type Lab = Schema.Lab;
export type LabRef = Schema.LabRef;
export type Link = Schema.Link;
export type Note = Schema.Note;
export type NoteResponse = Schema.NoteResponse;
export type Page = Schema.Page;
export type Parity = Schema.Parity;
export type Participant = Schema.Participant;
export type QueueEntry = Schema.QueueEntry;
export type PracticeListResponse = Schema.PracticeListResponse;
export type PracticeSession = Schema.PracticeSession;
export type PracticeSessionView = Schema.PracticeSessionView;
export type PracticeSwap = Schema.PracticeSwap;
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
  /** Для кого: "stream:1", "group:М3105"; пусто — для всех. */
  audience: string[];
  slug?: string;
  name: string;
  shortName: string;
  color: SubjectColor;
  icon: string;
  lecturer: string;
  practiceTeacher: string;
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
  /** Автор (только админ выбирает); null — без автора. */
  authorId?: number | null;
  /** Для кого: "stream:1", "group:М3105"; пусто — для всех. */
  audience: string[];
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
  audience: string[];
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
  /** Для кого: "stream:1", "group:М3105"; пусто — для всех. */
  audience: string[];
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

export type PageInput = {
  slug?: string;
  title: string;
  summary: string;
  content: string;
  /** Раздел на /p; пусто — «Разное». */
  category: string;
  position: number;
  showInNav: boolean;
  status: Status;
};

export type NoteInput = {
  /** Автор (только админ выбирает); null — без автора. */
  authorId?: number | null;
  /** Для кого: "stream:1", "group:М3105"; пусто — для всех. */
  audience: string[];
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
  /** "Имя Фамилия" from the course list once the student picked themselves; empty before. */
  displayName: string;
  /** Study group from the course list; empty until the student picks themselves. */
  groupName: string;
  /** False until the student picks themselves in the course list: student actions are locked. */
  approved: boolean;
  approvedAt: string | null;
  telegramId: number | null;
  telegramUsername: string;
  photoUrl: string;
  /** University student number linking the account to score sheets; "" when not set. */
  isu: string;
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
  /** Omitted — left as is; "" unlinks. */
  isu?: string;
};

/** A row of the course list (admin). */
export type Student = {
  id: number;
  isu: string;
  /** "Фамилия Имя Отчество". */
  fullName: string;
  groupName: string;
  /** Stream number of the group; 0 when the list did not say. */
  stream: number;
  createdAt: string;
  /** The account that picked this row, if any. */
  userId: number | null;
  userName: string | null;
};

/** A free row a new account can pick; ISU numbers stay private. */
export type StudentChoice = { id: number; fullName: string; groupName: string };

export type StudentInput = { isu: string; fullName: string; groupName: string };

/** An editor role: a student responsible for a stream or a group. */
export type EditorRole = {
  id: number;
  userId: number;
  userName: string;
  userGroup: string;
  photoUrl: string;
  /** "stream:1" or "group:М3105". */
  scope: string;
  /** Who granted it; null — the admin. */
  grantedBy: string | null;
  createdAt: string;
};

export type EditorCandidate = { id: number; name: string; group: string };

/** /auth/me for the admin panel. */
export type StaffMe = {
  authenticated: boolean;
  role: "admin" | "editor";
  editor?: {
    userId: number;
    userName: string;
    scopes: string[];
    /** Every token the editor may address content to. */
    zone: string[];
  };
};

/** A journal entry: a create, update or delete of content. */
export type Edit = {
  id: number;
  actorId: number | null;
  actorName: string;
  entity:
    | "labs"
    | "notes"
    | "quizzes"
    | "events"
    | "practice"
    | "practice-rules";
  entityId: number;
  action: "create" | "update" | "delete";
  title: string;
  audience: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  revertedAt: string | null;
  createdAt: string;
};

export type StudyGroup = { name: string; stream: number; students: number };

export type StudentImportResult = {
  added: number;
  updated: number;
  skipped: number;
  total: number;
};

export type Passkey = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type PracticeSessionInput = {
  /** Для кого: "stream:1", "group:М3105"; пусто — для всех. */
  audience: string[];
  subjectId: number;
  startsAt: string;
  endsAt: string | null;
  location: string;
  capacity: number | null;
  note: string;
  /** Отменить (true) или вернуть (false); не передано — как есть. */
  canceled?: boolean | null;
  cancelReason?: string;
};

/** Какие недели: все, нечётные или чётные (по началу семестра в настройках). */
export type RuleWeeks = "all" | "odd" | "even";

/** Регулярная сдача: по ней занятия создаются сразу на весь период. */
export type PracticeRule = {
  id: number;
  subjectId: number;
  /** 1 — понедельник … 7 — воскресенье. */
  weekday: number;
  /** "ЧЧ:ММ" по времени сайта; `endTime` может быть пустым. */
  startTime: string;
  endTime: string;
  weeks: RuleWeeks;
  /** "YYYY-MM-DD". */
  startsOn: string;
  endsOn: string;
  location: string;
  capacity: number | null;
  note: string;
  audience: string[];
  createdAt: string;
  updatedAt: string;
  subjectSlug: string;
  subjectName: string;
  subjectShortName: string;
  subjectColor: SubjectColor;
  subjectIcon: string;
  sessionsCount: number;
  upcomingCount: number;
  canceledCount: number;
  /** Начала ближайших неотменённых занятий. */
  next: string[];
};

export type PracticeRuleInput = Pick<
  PracticeRule,
  | "subjectId"
  | "weekday"
  | "startTime"
  | "endTime"
  | "weeks"
  | "startsOn"
  | "endsOn"
  | "location"
  | "capacity"
  | "note"
  | "audience"
>;

/** Что сохранение правила сделает с датой. */
export type PracticeRulePlanAction =
  | "create"
  | "adopt"
  | "update"
  | "keep"
  | "manual"
  | "canceled"
  | "past"
  | "delete"
  | "cancel"
  | "detach";

export type PracticeRulePlanItem = {
  day: string;
  startsAt: string;
  endsAt: string | null;
  action: PracticeRulePlanAction;
  sessionId: number | null;
  signups: number;
  /** Привязанная сдача отличается от правила и останется изменённой вручную. */
  differs: boolean;
};

export type MySignup = { session: PracticeSession; labs: LabRef[] };

export type MeResponse = {
  user: User;
  completedLabIds: number[];
  signups: MySignup[];
  passkeys: Passkey[];
  grades: MyGrade[];
  /** Editor roles of the student: "stream:1", "group:М3105". */
  editorScopes: string[];
};

// ---- scores from external sheets ----

export type GradeParts = GradeEntry["parts"];
export type GradeLabs = GradeEntry["labs"];

export type Place = { rank: number; size: number };

export type MyGrade = {
  source: GradeSourceSummary;
  group: string;
  total: number;
  parts: GradeParts;
  labs: GradeLabs;
  course: Place;
  inGroup: Place;
  /** Among students registered on the site. */
  site: Place;
  changedAt: string;
};

export type AdminGradeColumn = GradeColumn & { header: string };

/**
 * Labs graded with modifiers: block headers next to each lab's total and
 * the rules. Empty `theory` — the source has no labs.
 */
export type GradeScheme = {
  theory: string;
  plus: string;
  minus: string;
  late: string;
  bonusPercent: number;
  /** Multiplier at each deadline stage, from 0 (on time). */
  lateFactors: number[];
};

export type GradeSource = {
  id: number;
  subjectId: number;
  title: string;
  spreadsheetId: string;
  tabPattern: string;
  nameColumn: string;
  idColumn: string;
  groupColumn: string;
  totalColumn: string;
  maxTotal: number;
  columns: AdminGradeColumn[];
  scheme: GradeScheme;
  syncHours: number;
  enabled: boolean;
  membersOnly: boolean;
  syncedAt: string | null;
  syncError: string;
  rowsCount: number;
  createdAt: string;
  updatedAt: string;
  subjectSlug: string;
  subjectName: string;
  subjectColor: SubjectColor;
  subjectIcon: string;
  /** Rows that belong to site accounts. */
  linkedCount: number;
};

export type GradeSourceInput = {
  subjectId: number;
  title: string;
  /** Google Sheets link or bare id. */
  spreadsheet: string;
  tabPattern: string;
  nameColumn: string;
  idColumn: string;
  groupColumn: string;
  totalColumn: string;
  maxTotal: number;
  columns: AdminGradeColumn[];
  scheme: GradeScheme;
  syncHours: number;
  enabled: boolean;
  membersOnly: boolean;
};

export type GradeSyncResult = {
  tabs: string[];
  skipped: string[];
  rows: number;
  /** Accounts linked by name during this sync. */
  linked: number;
  /** Labs whose total in the sheet disagrees with the scheme. */
  warnings: string[];
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

// ---- social: comments ----

export type CommentTarget = "note" | "lab";

export type AdminComment = Comment & {
  targetTitle: string | null;
  targetPath: string | null;
};

// ---- attachments ----

/** К чему относится файл: ссылка из текстов админки, комментарий или незаконченная загрузка студента. */
export type AttachmentPlace = "content" | "comment" | "pending";

export type ContentRef = {
  type: "note" | "lab" | "page" | "subject";
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
