"use client";

import { useEffect, useState } from "react";

import { SelectField } from "@/components/admin/select-field";
import { useStaff } from "@/lib/admin/staff";
import { adminApi } from "@/lib/api/admin";
import type { EditorCandidate } from "@/lib/api/types";

const NONE = "none";

/**
 * Author of a lab or note. The admin picks any confirmed student (or nobody);
 * an editor sees it read-only — what they create is signed with their name.
 */
export function AuthorField({
  id,
  value,
  name,
  onChange,
}: {
  id?: string;
  value: number | null;
  /** Current author's name from the saved row, shown to editors. */
  name: string;
  onChange: (next: number | null) => void;
}) {
  const { isAdmin, editor } = useStaff();
  const [people, setPeople] = useState<EditorCandidate[]>([]);
  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    adminApi.editors
      .candidates()
      .then((list) => {
        if (live) setPeople(list);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <p id={id} className="text-sm">
        {name || editor?.userName || "—"}
      </p>
    );
  }
  const options = [
    { value: NONE, label: "Без автора" },
    ...people.map((p) => ({
      value: String(p.id),
      label: `${p.name} · ${p.group}`,
    })),
  ];
  // Keep the saved author selectable while the list is loading.
  if (value != null && !people.some((p) => p.id === value))
    options.push({ value: String(value), label: name || `#${value}` });
  return (
    <SelectField
      id={id}
      value={value == null ? NONE : String(value)}
      onChange={(v) => onChange(v === NONE || !v ? null : Number(v))}
      options={options}
    />
  );
}
