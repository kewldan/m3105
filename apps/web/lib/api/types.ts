// Mirrors the JSON shapes produced by apps/api (Go). Keep in sync with
// apps/api/internal/models and apps/api/internal/store.

export type Link = { title: string; url: string };

export type Parity = "odd" | "even";
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

export type Settings = {
  siteTitle: string;
  groupName: string;
  description: string;
  semesterStart: string | null; // YYYY-MM-DD
  semesterEnd: string | null;
  firstWeekParity: Parity;
  timezone: string;
  links: Link[];
  /** Optional access code for first-time sign-in. Always empty in public responses. */
  inviteCode: string;
  updatedAt: string;
};

export type Week = {
  number: number;
  parity: Parity;
  start: string;
  inRange: boolean;
  configured: boolean;
};

export type SubjectRef = {
  id: number;
  slug: string;
  name: string;
  shortName: string;
  color: SubjectColor;
  /** Key from lib/subject-icons.ts; empty = default icon. */
  icon: string;
};

export type Subject = {
  id: number;
  slug: string;
  name: string;
  shortName: string;
  color: SubjectColor;
  icon: string;
  teacher: string;
  description: string;
  links: Link[];
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type SubjectWithCounts = Subject & {
  labsCount: number;
  notesCount: number;
  quizzesCount: number;
};

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

export type Lab = SubjectJoin & {
  id: number;
  subjectId: number;
  number: number;
  slug: string;
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
  createdAt: string;
  updatedAt: string;
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

export type FAQItem = {
  id: number;
  question: string;
  answer: string;
  category: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type FAQInput = {
  question: string;
  answer: string;
  category: string;
  position: number;
};

export type Page = {
  id: number;
  slug: string;
  title: string;
  summary: string;
  content: string;
  position: number;
  showInNav: boolean;
  status: Status;
  createdAt: string;
  updatedAt: string;
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

export type Note = SubjectJoin & {
  id: number;
  subjectId: number;
  number: number;
  slug: string;
  title: string;
  summary: string;
  content: string;
  lectureDate: string | null;
  status: Status;
  createdAt: string;
  updatedAt: string;
  /** Published quizzes attached to the note. */
  quizzesCount: number;
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

export type QuizOption = { id: string; text: string; correct: boolean };

export type QuizQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  options?: QuizOption[];
  answers?: string[];
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
  createdAt: string;
  updatedAt: string;
  noteSlug: string;
  noteTitle: string;
};

export type QuizSummary = Quiz & { questionsCount: number };

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

export type CalendarItem = {
  id: string;
  source: "lab" | "event" | "practice";
  kind: CalendarKind;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string;
  description: string;
  path: string;
  url: string;
  subject: SubjectRef | null;
  labNumber?: number;
  labId?: number;
};

export type SearchResult = {
  kind: "lab" | "note" | "quiz" | "faq" | "page" | "subject";
  title: string;
  subtitle: string;
  path: string;
};

// ---- aggregated responses ----

export type AuthInfo = {
  /** Telegram bot username; empty when not configured. */
  telegramBot: string;
  /** Numeric bot id for the Telegram Login JS API; empty when not configured. */
  telegramBotId: string;
  /** Development-only name login is available. */
  devLogin: boolean;
  /** First-time sign-in requires the group access code. */
  inviteRequired: boolean;
};

export type SettingsResponse = {
  settings: Settings;
  week: Week;
  now: string;
  navPages: Page[];
  auth: AuthInfo;
};

export type HomeResponse = {
  settings: Settings;
  week: Week;
  now: string;
  /** Lab deadlines only. */
  upcomingDeadlines: CalendarItem[];
  overdueDeadlines: CalendarItem[];
  /** Tests, exams, consultations and practice sessions. */
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

export type NoteResponse = Note & {
  quizzes: QuizSummary[];
  prev: Note | null;
  next: Note | null;
};

export type CalendarResponse = {
  items: CalendarItem[];
  from: string;
  to: string;
  now: string;
};

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
  practice: number;
  upcoming: CalendarItem[];
};

// ---- student accounts ----

export type User = {
  id: number;
  name: string;
  telegramId: number | null;
  telegramUsername: string;
  photoUrl: string;
  createdAt: string;
  lastLoginAt: string;
};

export type PublicUser = { id: number; name: string; photoUrl: string };

export type AdminUser = User & {
  passkeysCount: number;
  completionsCount: number;
  signupsCount: number;
};

export type Passkey = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type PracticeSession = SubjectJoin & {
  id: number;
  subjectId: number;
  startsAt: string;
  endsAt: string | null;
  location: string;
  capacity: number | null;
  note: string;
  createdAt: string;
  updatedAt: string;
  /** Distinct students signed up. */
  signupsCount: number;
};

export type PracticeSessionInput = {
  subjectId: number;
  startsAt: string;
  endsAt: string | null;
  location: string;
  capacity: number | null;
  note: string;
};

export type LabRef = {
  id: number;
  number: number;
  title: string;
  slug: string;
  subjectSlug: string;
};

export type Participant = { user: PublicUser; labs: LabRef[] };

export type PracticeSessionView = PracticeSession & {
  /** Only filled for signed-in viewers. */
  participants: Participant[];
  myLabIds: number[];
  full: boolean;
  past: boolean;
  /** Published labs of the subject, only for signed-in viewers. */
  availableLabs: LabRef[];
};

export type PracticeListResponse = {
  sessions: PracticeSessionView[];
  now: string;
  signedIn: boolean;
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
