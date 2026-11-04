"use client";

import {
  ContactIcon,
  FileUpIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UserRoundCheckIcon,
} from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { type Column, DataTable } from "@/components/admin/data-table";
import { PageTitle } from "@/components/admin/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { handleApiError } from "@/lib/admin/errors";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";
import type { Student } from "@/lib/api/types";
import { plural } from "@/lib/format";

const EMPTY = { isu: "", fullName: "", groupName: "" };

function fold(s: string): string {
  return s.toLowerCase().replaceAll("ё", "е");
}

export default function StudentsPage() {
  const { data, loading, reload, setData } = useQuery(() =>
    adminApi.students.list(),
  );
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [row, setRow] = useState(EMPTY);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const picked = data?.filter((s) => s.userId !== null).length ?? 0;
  const words = fold(query).split(/\s+/).filter(Boolean);
  const shown = data?.filter((s) => {
    const hay = fold(
      `${s.fullName} ${s.groupName} ${s.isu} ${s.userName ?? ""}`,
    );
    return words.every((w) => hay.includes(w));
  });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
    setImportError("");
  }

  async function runImport() {
    setImporting(true);
    setImportError("");
    try {
      const res = await adminApi.students.import(text);
      const parts = [
        `добавлено ${res.added}`,
        `обновлено ${res.updated}`,
        res.skipped ? `пропущено ${res.skipped}` : "",
      ].filter(Boolean);
      toast.success(`Список загружен: ${parts.join(", ")}`, {
        description: `Всего в списке ${res.total} ${plural(res.total, "человек", "человека", "человек")}.`,
      });
      setText("");
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.fields.text)
        setImportError(err.fields.text);
      else handleApiError(err);
    } finally {
      setImporting(false);
    }
  }

  async function addRow(e: FormEvent) {
    e.preventDefault();
    setAdding(true);
    setRowErrors({});
    try {
      setData(await adminApi.students.create(row));
      toast.success(`${row.fullName} в списке`);
      setRow(EMPTY);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0)
        setRowErrors(err.fields);
      else handleApiError(err);
    } finally {
      setAdding(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await adminApi.students.remove(deleting.id);
      toast.success("Строка удалена");
      setDeleting(null);
      reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setDeleteLoading(false);
    }
  }

  const columns: Column<Student>[] = [
    {
      id: "name",
      header: "ФИО",
      sort: (r) => r.fullName,
      cell: (r) => <span className="font-medium">{r.fullName}</span>,
    },
    {
      id: "group",
      header: "Группа",
      sort: (r) => r.groupName,
      className: "tabular-nums",
      cell: (r) => r.groupName,
    },
    {
      id: "isu",
      header: "ИСУ",
      sort: (r) => r.isu,
      className: "tabular-nums text-muted-foreground",
      cell: (r) => r.isu,
    },
    {
      id: "user",
      header: "Аккаунт",
      sort: (r) => r.userName ?? "",
      cell: (r) =>
        r.userName ? (
          <Badge
            variant="outline"
            className="gap-1 border-emerald-500/40 font-normal text-emerald-700 dark:text-emerald-300"
          >
            <UserRoundCheckIcon className="size-3" aria-hidden />
            {r.userName}
          </Badge>
        ) : (
          <span className="text-muted-foreground">свободен</span>
        ),
    },
    {
      id: "actions",
      header: <span className="sr-only">Действия</span>,
      className: "w-px",
      cell: (r) => (
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          aria-label={`Удалить ${r.fullName}`}
          onClick={() => setDeleting(r)}
        >
          <Trash2Icon />
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageTitle
        title="Список курса"
        description="Новый аккаунт подтверждается, когда студент находит себя в этом списке: имя, группа и номер ИСУ берутся отсюда, и сам он их уже не поменяет. Уже выбранных другим не видно."
        actions={
          data ? (
            <>
              <Badge variant="secondary" className="gap-1.5">
                <UserRoundCheckIcon className="size-3.5" aria-hidden />
                Выбрали себя: {picked}
              </Badge>
              <Badge variant="secondary" className="gap-1.5">
                <ContactIcon className="size-3.5" aria-hidden />В списке:{" "}
                {data.length}
              </Badge>
            </>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div>
            <h2 className="font-medium">Загрузить списки групп</h2>
            <p className="text-sm text-muted-foreground text-pretty">
              Вставьте таблицу, скопированную со страницы (колонки ИСУ, ФИО и
              группа в любом порядке), CSV или выберите сохранённую страницу
              целиком (.mht, .html). Новые номера добавятся, у знакомых
              обновятся ФИО и группа — вместе с аккаунтами, которые их выбрали.
              Никто не удаляется.
            </p>
          </div>
          <Textarea
            value={fileName ? `Файл «${fileName}»` : text}
            readOnly={fileName !== ""}
            onChange={(e) => {
              setText(e.target.value);
              setImportError("");
            }}
            placeholder={"558064\tМуковоз Максим Александрович\t1\tM3104"}
            rows={6}
            aria-label="Таблица студентов"
            aria-invalid={importError ? true : undefined}
            className="font-mono text-xs"
          />
          {importError ? (
            <p className="text-sm text-destructive">{importError}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={runImport}
              disabled={importing || text.trim() === ""}
            >
              {importing ? <Spinner /> : null}
              Загрузить
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".mht,.mhtml,.html,.htm,.csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <FileUpIcon data-icon="inline-start" />
              Выбрать файл
            </Button>
            {fileName ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setFileName("");
                  setText("");
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                Убрать файл
              </Button>
            ) : null}
          </div>
        </section>

        <form
          onSubmit={addRow}
          className="space-y-3 rounded-xl border bg-card p-4"
        >
          <div>
            <h2 className="font-medium">Добавить одного</h2>
            <p className="text-sm text-muted-foreground text-pretty">
              Для тех, кого нет в списках: перевёлся, восстановился.
            </p>
          </div>
          {(
            [
              ["fullName", "Фамилия Имя Отчество", "ФИО"],
              ["groupName", "М3105", "Группа"],
              ["isu", "Номер ИСУ", "Номер ИСУ"],
            ] as const
          ).map(([key, placeholder, label]) => (
            <div key={key} className="space-y-1">
              <Input
                value={row[key]}
                onChange={(e) => setRow({ ...row, [key]: e.target.value })}
                placeholder={placeholder}
                aria-label={label}
                aria-invalid={rowErrors[key] ? true : undefined}
                inputMode={key === "isu" ? "numeric" : undefined}
              />
              {rowErrors[key] ? (
                <p className="text-xs text-destructive">{rowErrors[key]}</p>
              ) : null}
            </div>
          ))}
          <Button type="submit" variant="secondary" disabled={adding}>
            {adding ? <Spinner /> : <PlusIcon data-icon="inline-start" />}
            Добавить
          </Button>
        </form>
      </div>

      <div className="relative max-w-sm">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ФИО, группа, ИСУ или аккаунт"
          aria-label="Поиск по списку"
          className="pl-8"
        />
      </div>
      <DataTable
        rows={shown}
        loading={loading}
        columns={columns}
        rowKey={(r) => r.id}
        defaultSort={{ id: "group", dir: "asc" }}
        emptyTitle={query ? "Никого не нашли" : "Список пуст"}
        emptyDescription={
          query
            ? undefined
            : "Пока список пуст, новые студенты не смогут подтвердить аккаунт. Загрузите списки групп выше."
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={`Удалить «${deleting?.fullName ?? ""}» из списка?`}
        description={
          deleting?.userName
            ? `Аккаунт «${deleting.userName}», который выбрал эту строку, останется подтверждённым. Чтобы он выбрал заново, отвяжите его в «Студентах».`
            : "Выбрать эту строку больше будет нельзя."
        }
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />
    </>
  );
}
