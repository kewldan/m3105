import {
  BookOpenIcon,
  CalendarClockIcon,
  CircleQuestionMarkIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  FlaskConicalIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  type LucideIcon,
  MessageCircleIcon,
  NewspaperIcon,
  NotebookPenIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
};

export const ADMIN_NAV: NavItem[] = [
  { title: "Обзор", href: "/admin", icon: LayoutDashboardIcon, exact: true },
  { title: "Предметы", href: "/admin/subjects", icon: BookOpenIcon },
  { title: "Лабы", href: "/admin/labs", icon: FlaskConicalIcon },
  {
    title: "Дедлайны и события",
    href: "/admin/events",
    icon: CalendarClockIcon,
  },
  { title: "Сдачи", href: "/admin/practice", icon: ClipboardCheckIcon },
  { title: "Конспекты", href: "/admin/notes", icon: NotebookPenIcon },
  { title: "Квизы", href: "/admin/quizzes", icon: ListChecksIcon },
  { title: "ЧаВо", href: "/admin/faq", icon: CircleQuestionMarkIcon },
  { title: "Страницы", href: "/admin/pages", icon: FileTextIcon },
  { title: "Студенты", href: "/admin/users", icon: UsersIcon },
  { title: "Посты", href: "/admin/posts", icon: NewspaperIcon },
  { title: "Комментарии", href: "/admin/comments", icon: MessageCircleIcon },
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
