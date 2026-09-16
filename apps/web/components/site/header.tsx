import Link from "next/link";

import { ItmoLogo } from "@/components/site/itmo-logo";
import { MobileNav } from "@/components/site/mobile-nav";
import { type NavLink, PRIMARY_LINKS } from "@/components/site/nav-config";
import { NavLinks } from "@/components/site/nav-links";
import { SearchDialog } from "@/components/site/search-dialog";
import { UserMenu } from "@/components/site/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import type { SettingsResponse } from "@/lib/api/types";

export function SiteHeader({ site }: { site: SettingsResponse }) {
  const pageLinks: NavLink[] = site.navPages.map((p) => ({
    href: `/p/${p.slug}`,
    label: p.title,
  }));
  const links: NavLink[] = [...PRIMARY_LINKS, ...pageLinks];
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="container-page flex h-14 items-center gap-2 md:h-16">
        <MobileNav
          links={links}
          extLinks={site.settings.links}
          title={site.settings.siteTitle}
        />
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg font-heading text-lg font-bold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ItmoLogo size={36} />
          <span>{site.settings.siteTitle}</span>
        </Link>
        <NavLinks
          links={PRIMARY_LINKS}
          more={pageLinks}
          className="ml-4 hidden lg:flex"
        />
        <div className="ml-auto flex items-center gap-1.5">
          <SearchDialog />
          <ThemeToggle />
          <UserMenu className="ml-0.5" />
        </div>
      </div>
    </header>
  );
}
