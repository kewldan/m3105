export type NavLink = {
  href: string;
  label: string;
  exact?: boolean;
};

export const PRIMARY_LINKS: NavLink[] = [
  { href: "/", label: "Главная", exact: true },
  { href: "/calendar", label: "Календарь" },
  { href: "/labs", label: "Лабы" },
  { href: "/practice", label: "Сдачи" },
  { href: "/grades", label: "Баллы" },
  { href: "/notes", label: "Конспекты" },
  { href: "/faq", label: "ЧаВо" },
  { href: "/cpp", label: "C++" },
];

/** Index of the static pages, grouped by category. */
export const USEFUL_LINK: NavLink = { href: "/p", label: "Полезное" };

export function isActivePath(pathname: string, link: NavLink): boolean {
  if (link.exact) return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}
