export type NavLink = { href: string; label: string; exact?: boolean };

export const PRIMARY_LINKS: NavLink[] = [
  { href: "/", label: "Главная", exact: true },
  { href: "/calendar", label: "Календарь" },
  { href: "/labs", label: "Лабы" },
  { href: "/practice", label: "Сдачи" },
  { href: "/notes", label: "Конспекты" },
  { href: "/faq", label: "ЧаВо" },
  { href: "/shawarma", label: "Шаверма" },
  { href: "/jokes", label: "Анекдоты" },
];

export function isActivePath(pathname: string, link: NavLink): boolean {
  if (link.exact) return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}
