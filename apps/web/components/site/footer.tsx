import Link from "next/link";

import { type NavLink, primaryLinks } from "@/components/site/nav-config";
import type { Settings } from "@/lib/api/types";

const REPO = "https://github.com/kewldan/m3105";

/** Short commit linked to GitHub; «—» when the build does not know it. */
function Commit({ label, sha }: { label: string; sha: string }) {
  return (
    <span>
      {label}{" "}
      {sha ? (
        <a
          href={`${REPO}/commit/${sha}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono transition-colors hover:text-foreground"
        >
          {sha.slice(0, 7)}
        </a>
      ) : (
        "—"
      )}
    </span>
  );
}

export function SiteFooter({
  settings,
  member,
  apiCommit,
  pageLinks = [],
}: {
  settings: Settings;
  member: boolean;
  /** Commit of the running API, "" if unknown. */
  apiCommit: string;
  pageLinks?: NavLink[];
}) {
  const links = [...primaryLinks(member), ...pageLinks];
  return (
    <footer className="mt-auto border-t bg-muted/30 print:hidden">
      <div className="container-page flex flex-col gap-5 py-8">
        <nav aria-label="Навигация в подвале">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium text-foreground">
            {settings.groupName}
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Commit label="фронт" sha={process.env.NEXT_PUBLIC_GIT_SHA ?? ""} />
            <Commit label="бэк" sha={apiCommit} />
            <a
              href={REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Исходный код
            </a>
            <span>
              ©{" "}
              <a
                href="https://github.com/kewldan"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-foreground"
              >
                Тенишев Даниил
              </a>{" "}
              2026
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
}
