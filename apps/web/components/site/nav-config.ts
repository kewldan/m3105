export type NavLink = {
  href: string;
  label: string;
  exact?: boolean;
  /** Only for confirmed students of the site's group. */
  groupOnly?: boolean;
};

export const PRIMARY_LINKS: NavLink[] = [
  { href: "/", label: "Главная", exact: true },
  { href: "/calendar", label: "Календарь" },
  { href: "/labs", label: "Лабы" },
  { href: "/practice", label: "Сдачи" },
  { href: "/notes", label: "Конспекты" },
  { href: "/faq", label: "ЧаВо" },
  { href: "/shawarma", label: "Шаверма", groupOnly: true },
  { href: "/jokes", label: "Анекдоты", groupOnly: true },
];

/** Primary links the viewer may open. */
export function primaryLinks(member: boolean): NavLink[] {
  return PRIMARY_LINKS.filter((l) => member || !l.groupOnly);
}

export function isActivePath(pathname: string, link: NavLink): boolean {
  if (link.exact) return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}
