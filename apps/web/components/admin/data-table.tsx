"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  InboxIcon,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type Column<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  /** Enables sorting by the returned value. */
  sort?: (row: T) => string | number | null | undefined;
};

type SortState = { id: string; dir: "asc" | "desc" } | null;

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading = false,
  emptyTitle = "Пока пусто",
  emptyDescription,
  emptyAction,
  defaultSort,
  className,
}: {
  rows: T[] | null | undefined;
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  defaultSort?: SortState;
  className?: string;
}) {
  const [sort, setSort] = useState<SortState>(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!rows) return [];
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sort) return rows;
    const getter = col.sort;
    return rows.slice().sort((a, b) => {
      const va = getter(a);
      const vb = getter(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "ru");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  function toggleSort(id: string) {
    setSort((prev) => {
      if (!prev || prev.id !== id) return { id, dir: "asc" };
      if (prev.dir === "asc") return { id, dir: "desc" };
      return null;
    });
  }

  if (!loading && rows && rows.length === 0) {
    return (
      <Empty className={cn("rounded-xl border border-dashed", className)}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <InboxIcon />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          {emptyDescription ? (
            <EmptyDescription>{emptyDescription}</EmptyDescription>
          ) : null}
        </EmptyHeader>
        {emptyAction}
      </Empty>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => (
              <TableHead
                key={col.id}
                className={cn("bg-muted/40", col.headerClassName)}
              >
                {col.sort ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(col.id)}
                    className="-mx-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-muted"
                  >
                    {col.header}
                    {sort?.id === col.id ? (
                      sort.dir === "asc" ? (
                        <ArrowUpIcon className="size-3.5 text-muted-foreground" />
                      ) : (
                        <ArrowDownIcon className="size-3.5 text-muted-foreground" />
                      )
                    ) : (
                      <ChevronsUpDownIcon className="size-3.5 text-muted-foreground/60" />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && !rows
            ? Array.from({ length: 5 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
                <TableRow key={i}>
                  {columns.map((col) => (
                    <TableCell key={col.id}>
                      <Skeleton className="h-4 w-full max-w-40" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : sorted.map((row) => (
                <TableRow key={rowKey(row)} className="animate-fade-in">
                  {columns.map((col) => (
                    <TableCell key={col.id} className={col.className}>
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </div>
  );
}
