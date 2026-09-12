// biome-ignore-all lint/suspicious/noArrayIndexKey: rows are positional and have no stable identity
"use client";

import { LinkIcon, PlusIcon, TrashIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Link } from "@/lib/api/types";

/** Editable list of {title, url} rows. */
export function LinksEditor({
  value,
  onChange,
  addLabel = "Добавить ссылку",
  disabled,
}: {
  value: Link[];
  onChange: (links: Link[]) => void;
  addLabel?: string;
  disabled?: boolean;
}) {
  function update(i: number, patch: Partial<Link>) {
    onChange(value.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ссылок пока нет.</p>
      ) : (
        value.map((link, i) => (
          <div
            key={i}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]"
          >
            <Input
              placeholder="Название"
              value={link.title}
              disabled={disabled}
              onChange={(e) => update(i, { title: e.target.value })}
              aria-label={`Название ссылки ${i + 1}`}
            />
            <Input
              placeholder="https://…"
              value={link.url}
              disabled={disabled}
              inputMode="url"
              onChange={(e) => update(i, { url: e.target.value })}
              aria-label={`Адрес ссылки ${i + 1}`}
              className="col-span-2 sm:col-span-1 sm:col-start-2"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Удалить ссылку"
              disabled={disabled}
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="col-start-2 row-start-1 sm:col-start-3"
            >
              <TrashIcon />
            </Button>
          </div>
        ))
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onChange([...value, { title: "", url: "" }])}
      >
        {value.length === 0 ? (
          <LinkIcon data-icon="inline-start" />
        ) : (
          <PlusIcon data-icon="inline-start" />
        )}
        {addLabel}
      </Button>
    </div>
  );
}
