"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, type ReactNode, useEffect } from "react";

import { AppSidebar } from "@/components/admin/app-sidebar";
import { LogoutButton } from "@/components/admin/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { breadcrumbsFor } from "@/lib/admin/nav";
import { StaffProvider, useStaff } from "@/lib/admin/staff";
import type { StaffMe } from "@/lib/api/types";

function AdminBreadcrumbs() {
  const pathname = usePathname();
  const crumbs = breadcrumbsFor(pathname);
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={c.href ?? c.label}>
              <BreadcrumbItem
                className={
                  i === 0 && crumbs.length > 1
                    ? "hidden sm:inline-flex"
                    : undefined
                }
              >
                {last || !c.href ? (
                  <BreadcrumbPage>{c.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link href={c.href} />}>
                    {c.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!last ? (
                <BreadcrumbSeparator
                  className={i === 0 ? "hidden sm:block" : undefined}
                />
              ) : null}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** Editors have no overview: their start page is the labs list. */
function EditorHome() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin } = useStaff();
  useEffect(() => {
    if (!isAdmin && pathname === "/admin") router.replace("/admin/labs");
  }, [isAdmin, pathname, router]);
  return null;
}

export function AdminShell({
  children,
  staff,
  defaultOpen = true,
}: {
  children: ReactNode;
  staff: StaffMe;
  defaultOpen?: boolean;
}) {
  return (
    <StaffProvider value={staff}>
      <AdminShellInner defaultOpen={defaultOpen}>{children}</AdminShellInner>
    </StaffProvider>
  );
}

function AdminShellInner({
  children,
  defaultOpen,
}: {
  children: ReactNode;
  defaultOpen: boolean;
}) {
  const { isAdmin } = useStaff();
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <EditorHome />
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-backdrop-filter:bg-background/70 md:rounded-t-xl md:px-4">
          <SidebarTrigger aria-label="Переключить меню" />
          <Separator
            orientation="vertical"
            className="mr-1 data-[orientation=vertical]:h-4"
          />
          <div className="min-w-0 flex-1 overflow-hidden">
            <AdminBreadcrumbs />
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              render={
                <Link href="/" target="_blank" rel="noopener noreferrer" />
              }
            >
              <ExternalLinkIcon data-icon="inline-start" />
              Открыть сайт
            </Button>
            <ThemeToggle />
            <div className="hidden sm:block">
              {isAdmin ? (
                <LogoutButton />
              ) : (
                <Button variant="ghost" size="sm" render={<Link href="/me" />}>
                  Профиль
                </Button>
              )}
            </div>
          </div>
        </header>
        <div className="animate-fade-in flex flex-1 flex-col gap-6 p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
