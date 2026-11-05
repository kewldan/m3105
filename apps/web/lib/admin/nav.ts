import {
  BookOpenIcon,
  CalendarClockIcon,
  CircleQuestionMarkIcon,
  ClipboardCheckIcon,
  ContactIcon,
  FileTextIcon,
  FlaskConicalIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  type LucideIcon,
  MessageCircleIcon,
  NewspaperIcon,
  NotebookPenIcon,
  PaperclipIcon,
  SearchIcon,
  SettingsIcon,
  ShieldCheckIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Open to editors (responsible students), not only to the admin. */
  editor?: boolean;
};

export const ADMIN_NAV: NavItem[] = [
  { title: "Обзор", href: "/admin", icon: LayoutDashboardIcon, exact: true },
  { title: "Предметы", href: "/admin/subjects", icon: BookOpenIcon },
  { title: "Лабы", href: "/admin/labs", icon: FlaskConicalIcon, editor: true },
  {
    title: "Дедлайны и события",
    href: "/admin/events",
    icon: CalendarClockIcon,
    editor: true,
  },
  {
    title: "Сдачи",
    href: "/admin/practice",
    icon: ClipboardCheckIcon,
    editor: true,
  },
  {
    title: "Конспекты",
    href: "/admin/notes",
    icon: NotebookPenIcon,
    editor: true,
  },
  {
    title: "Квизы",
    href: "/admin/quizzes",
    icon: ListChecksIcon,
    editor: true,
  },
  { title: "ЧаВо", href: "/admin/faq", icon: CircleQuestionMarkIcon },
  { title: "Страницы", href: "/admin/pages", icon: FileTextIcon },
  { title: "Файлы", href: "/admin/files", icon: PaperclipIcon },
  { title: "Студенты", href: "/admin/users", icon: UsersIcon },
  { title: "Список курса", href: "/admin/students", icon: ContactIcon },
  {
    title: "Ответственные",
    href: "/admin/editors",
    icon: ShieldCheckIcon,
    editor: true,
  },
  { title: "Журнал", href: "/admin/journal", icon: HistoryIcon, editor: true },
  { title: "Баллы", href: "/admin/grades", icon: TrophyIcon },
  { title: "Посты", href: "/admin/posts", icon: NewspaperIcon },
  { title: "Комментарии", href: "/admin/comments", icon: MessageCircleIcon },
  { title: "Поиск", href: "/admin/search", icon: SearchIcon },
  { title: "Настройки", href: "/admin/settings", icon: SettingsIcon },
];

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Builds breadcrumb entries for an admin pathname. */
export function breadcrumbsFor(
  pathname: string,
): { label: string; href?: string }[] {
  const crumbs: { label: string; href?: string }[] = [
    { label: "Обзор", href: "/admin" },
  ];
  if (pathname === "/admin") return crumbs;
  const section = ADMIN_NAV.find((n) => !n.exact && isNavActive(n, pathname));
  if (!section) return crumbs;
  const rest = pathname.slice(section.href.length).split("/").filter(Boolean);
  if (rest.length === 0) {
    crumbs.push({ label: section.title });
    return crumbs;
  }
  crumbs.push({ label: section.title, href: section.href });
  const tail = rest[0];
  crumbs.push({ label: tail === "new" ? "Создание" : "Редактирование" });
  return crumbs;
}
