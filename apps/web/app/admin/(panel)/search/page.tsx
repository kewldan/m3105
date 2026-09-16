"use client";

import { SearchXIcon, TrendingUpIcon } from "lucide-react";
import { useState } from "react";

import { type Column, DataTable } from "@/components/admin/data-table";
import { PageTitle } from "@/components/admin/page-title";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { SearchStat } from "@/lib/api/types";
import { fmtRelative, plural } from "@/lib/format";

const PERIODS = [
  { value: "7", label: "Неделя" },
  { value: "30", label: "Месяц" },
  { value: "90", label: "Квартал" },
];

export default function SearchStatsPage() {
  const [days, setDays] = useState("30");
  const { data, loading } = useQuery(
    () => adminApi.searchQueries(Number(days)),
    days,
  );

  const empty = (data ?? []).filter((r) => r.empty > 0);

  const columns: Column<SearchStat>[] = [
    {
      id: "query",
      header: "Запрос",
      sort: (r) => r.query,
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{r.query}</span>
          {r.empty > 0 ? (
            <Badge variant="destructive" className="gap-1 text-[11px]">
              <SearchXIcon className="size-3" aria-hidden />
              {r.empty === r.count
                ? "ничего не нашли"
                : `без результата ${r.empty} из ${r.count}`}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      id: "count",
      header: "Искали",
      sort: (r) => r.count,
      className: "tabular-nums whitespace-nowrap",
      cell: (r) => `${r.count} ${plural(r.count, "раз", "раза", "раз")}`,
    },
    {
      id: "results",
      header: "Нашлось",
      sort: (r) => r.results,
      className: "tabular-nums",
      cell: (r) => r.results,
    },
    {
      id: "last",
      header: "Последний раз",
      sort: (r) => r.lastAt,
      className: "whitespace-nowrap text-muted-foreground",
      cell: (r) => fmtRelative(r.lastAt),
    },
  ];

  return (
    <>
      <PageTitle
        title="Поиск"
        description="Что студенты ищут через ⌘K. Запросы без результатов — готовый список тем, которых на сайте не хватает. Промежуточные запросы «по мере набора» отфильтрованы: остаётся то, на чём человек остановился."
        actions={
          data ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1.5">
                <TrendingUpIcon className="size-3.5" aria-hidden />
                Запросов: {data.length}
              </Badge>
              {empty.length > 0 ? (
                <Badge variant="destructive" className="gap-1.5">
                  <SearchXIcon className="size-3.5" aria-hidden />
                  Без ответа: {empty.length}
                </Badge>
              ) : null}
            </div>
          ) : null
        }
      />
      <Tabs value={days} onValueChange={setDays}>
        <TabsList>
          {PERIODS.map((p) => (
            <TabsTrigger key={p.value} value={p.value}>
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <DataTable
        rows={data}
        loading={loading}
        columns={columns}
        rowKey={(r) => r.query}
        defaultSort={{ id: "count", dir: "desc" }}
        emptyTitle="Пока никто не искал"
        emptyDescription="Поиск открывается по ⌘K или кнопкой в шапке сайта. Как только им начнут пользоваться, здесь появятся запросы."
      />
    </>
  );
}
