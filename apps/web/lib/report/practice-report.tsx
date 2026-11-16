import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  BookOpen,
  Clock,
  type IconNode,
  icons,
  List,
  Lock,
  LockOpen,
  MapPin,
  RefreshCw,
  RotateCcw,
  Undo,
  Users,
} from "lucide";
import { createElement, type ReactNode } from "react";
import { render } from "takumi-js";
import { Renderer } from "takumi-js/node";

import type {
  Participant,
  PracticeSessionView,
  QueueEntry,
  Settings,
  SubjectColor,
} from "@/lib/api/types";
import { fmtDate, fmtTime, inTz, plural, WEEKDAYS_FULL } from "@/lib/format";
import { subjectIcon } from "@/lib/subject-icons";

/**
 * Картинка «Кто сдаёт» для Telegram-бота: одна сдача, очередь защит и теормин
 * в одну строку. Рендерит takumi (JSX → PNG), высота по содержимому. Макет —
 * Claude Design «Кто сдаёт — картинка для бота М3105», развёрнутый горизонтально.
 */

/** Ширина в CSS-пикселях; PNG получается в REPORT_SCALE раз больше. */
export const REPORT_WIDTH = 1600;
/**
 * Telegram хранит фото максимум 2560 px по большей стороне: 1600 × 1.6 —
 * ровно предел, так картинка остаётся чёткой и не пережимается сильнее.
 */
export const REPORT_SCALE = 1.6;

const C = {
  bg: "#0b0b0f",
  card: "#141419",
  cardBorder: "#24242b",
  row: "#1c1c22",
  chipMuted: "#2a2a31",
  text: "#fafafa",
  textSoft: "#e4e4e7",
  muted: "#a1a1aa",
  gray: "#d4d4d8",
  amber: "#ffd230",
};

/** Tailwind 4: 500 — заливка, 300 — текст на тёмном. */
const ACCENT: Record<SubjectColor, [string, string]> = {
  blue: ["#2b7fff", "#8ec5ff"],
  indigo: ["#615fff", "#a3b3ff"],
  violet: ["#8e51ff", "#c4b4ff"],
  cyan: ["#00b8db", "#53eafd"],
  teal: ["#00bba7", "#46ecd5"],
  emerald: ["#00bc7d", "#5ee9b5"],
  amber: ["#fe9a00", "#ffd230"],
  orange: ["#ff6900", "#ffb86a"],
  rose: ["#ff2056", "#ffa1ad"],
  slate: ["#62748e", "#cad5e2"],
};

/** Фон и буквы инициалов, когда аватарки нет; цвет закреплён за аккаунтом. */
const AVATAR: [string, string][] = [
  ["rgba(43,127,255,0.22)", "#bedbff"],
  ["rgba(0,184,219,0.22)", "#a2f4fd"],
  ["rgba(254,154,0,0.22)", "#fee685"],
  ["rgba(142,81,255,0.22)", "#ddd6ff"],
  ["rgba(0,188,125,0.22)", "#a4f4cf"],
  ["rgba(255,32,86,0.22)", "#ffccd3"],
];

/** Ширина панели теормина справа от очереди. */
const THEORY_WIDTH = 440;

function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const heading = { fontFamily: "Manrope", fontWeight: 700 } as const;
const ellipsis = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const;

/**
 * Иконка lucide как `<svg>` из данных пакета `lucide`: компоненты lucide-react
 * в роуте собираются под react-server, и takumi не может вызвать их клиентский `Icon`.
 */
function Svg({
  node,
  size,
  color,
  strokeWidth = 2,
}: {
  node: IconNode;
  size: number;
  color: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {node.map(([tag, attrs]) =>
        createElement(tag, { key: JSON.stringify(attrs), ...attrs }),
      )}
    </svg>
  );
}

/** Данные иконки предмета: ключ из `subject-icons` → имя иконки lucide. */
function subjectIconNode(key: string | null | undefined): IconNode {
  const name = subjectIcon(key).displayName ?? "";
  return icons[name as keyof typeof icons] ?? BookOpen;
}

export type ReportInput = {
  session: PracticeSessionView;
  settings: Pick<
    Settings,
    "timezone" | "groupName" | "semesterStart" | "firstWeekParity"
  >;
  /** Аватарки, которые удалось скачать: photoUrl → байты. */
  avatars: Map<string, Uint8Array>;
  now: Date;
};

/** Учебная неделя даты — как `semester.Compute` в API. */
export function academicWeek(
  date: Date,
  settings: ReportInput["settings"],
): { number: number; parity: "odd" | "even" } | null {
  if (!settings.semesterStart) return null;
  const tz = settings.timezone;
  const dayIndex = (d: Date) => {
    const t = inTz(d, tz);
    const wd = t.getDay() === 0 ? 7 : t.getDay();
    return Math.round(
      Date.UTC(t.getFullYear(), t.getMonth(), t.getDate() - (wd - 1)) /
        86_400_000,
    );
  };
  const [y, m, d] = String(settings.semesterStart)
    .slice(0, 10)
    .split("-")
    .map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const sw = start.getUTCDay() === 0 ? 7 : start.getUTCDay();
  const startMonday = Math.round(Date.UTC(y, m - 1, d - (sw - 1)) / 86_400_000);
  const days = dayIndex(date) - startMonday;
  if (days < 0) return null;
  const number = Math.floor(days / 7) + 1;
  const first = settings.firstWeekParity === "even" ? "even" : "odd";
  const parity = number % 2 === 1 ? first : first === "odd" ? "even" : "odd";
  return { number, parity };
}

function dayDiff(a: Date, b: Date, tz: string): number {
  const day = (d: Date) => {
    const t = inTz(d, tz);
    return Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) / 86_400_000;
  };
  return Math.round(day(b) - day(a));
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/** «М3105» → «5»: группа бейджем с последней цифрой. */
function groupDigit(group: string | null | undefined): string {
  return group?.match(/\d(?=\D*$)/)?.[0] ?? "";
}

function audienceLabel(audience: string[]): string {
  if (audience.length === 0) return "Для всех";
  return audience
    .map((a) =>
      a.startsWith("group:")
        ? a.slice(6)
        : a.startsWith("stream:")
          ? `${a.slice(7)} поток`
          : a,
    )
    .join(" · ");
}

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 40,
        padding: "0 12px",
        borderRadius: 10,
        background: "rgba(11,11,15,0.45)",
        flexShrink: 0,
      }}
    >
      {icon}
      <span
        style={{
          fontSize: 21,
          lineHeight: 1,
          color: C.textSoft,
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </span>
    </div>
  );
}

function GroupBadge({
  group,
  home,
  accent,
  size,
}: {
  group: string | null | undefined;
  home: boolean;
  accent: [string, string];
  size: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: 8,
        background: home ? rgba(accent[0], 0.24) : C.chipMuted,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          ...heading,
          fontSize: 19,
          lineHeight: 1,
          color: home ? accent[1] : C.gray,
        }}
      >
        {groupDigit(group)}
      </span>
    </div>
  );
}

function Flag({
  icon,
  label,
  color,
}: {
  icon: IconNode;
  label: string;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexShrink: 0,
        alignItems: "center",
        gap: 6,
        height: 28,
        padding: "0 10px",
        borderRadius: 8,
        background: rgba(color, 0.16),
        border: `1px solid ${rgba(color, 0.4)}`,
      }}
    >
      <Svg node={icon} size={15} color={color} strokeWidth={2.4} />
      <span
        style={{
          fontWeight: 700,
          fontSize: 19,
          lineHeight: 1,
          color,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </div>
  );
}

/** Редкие флаги — плашкой под строкой; поздняя запись — только иконкой справа. */
function flagsOf(e: QueueEntry): ReactNode[] {
  const out: ReactNode[] = [];
  if (e.carried) {
    const label = e.missed > 1 ? `из резерва ×${e.missed}` : "из резерва";
    out.push(<Flag key="carried" icon={Undo} label={label} color="#8ec5ff" />);
  }
  if (e.notReached) {
    out.push(
      <Flag
        key="nr"
        icon={RotateCcw}
        label="не успел в прошлый раз"
        color="#c4b4ff"
      />,
    );
  }
  return out;
}

function LateMark() {
  return (
    <div
      style={{
        display: "flex",
        flexShrink: 0,
        width: 36,
        height: 36,
        borderRadius: 18,
        background: rgba(C.amber, 0.16),
        border: `1px solid ${rgba(C.amber, 0.45)}`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg node={Clock} size={20} color={C.amber} strokeWidth={2.4} />
    </div>
  );
}

function Avatar({
  user,
  avatars,
  size,
}: {
  user: QueueEntry["user"];
  avatars: Map<string, Uint8Array>;
  size: number;
}) {
  const [bg, fg] = AVATAR[user.id % AVATAR.length];
  const src = user.photoUrl && avatars.has(user.photoUrl) ? user.photoUrl : "";
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: size / 2,
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <span style={{ ...heading, fontSize: 19, lineHeight: 1, color: fg }}>
        {initials(user.name)}
      </span>
      {src ? (
        // biome-ignore lint/performance/noImgElement: рендер takumi, не страница
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: size,
            height: size,
            objectFit: "cover",
            borderRadius: size / 2,
          }}
        />
      ) : null}
    </div>
  );
}

function QueueRow({
  pos,
  entry,
  home,
  accent,
  avatars,
}: {
  pos: number;
  entry: QueueEntry;
  home: string;
  accent: [string, string];
  avatars: Map<string, Uint8Array>;
}) {
  const flags = flagsOf(entry);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        height: flags.length ? 104 : 72,
        padding: "0 14px 0 10px",
        borderRadius: 12,
        background: C.row,
        flexShrink: 0,
        opacity: entry.reserve ? 0.6 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          width: 44,
          height: 44,
          borderRadius: 11,
          background: rgba(accent[0], 0.2),
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span
          style={{ ...heading, fontSize: 24, lineHeight: 1, color: accent[1] }}
        >
          {pos}
        </span>
      </div>
      <Avatar user={entry.user} avatars={avatars} size={48} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 1,
          flex: 1,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: 25,
            lineHeight: "30px",
            color: C.text,
            ...ellipsis,
          }}
        >
          {entry.user.name}
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
          }}
        >
          <GroupBadge
            group={entry.user.group}
            home={entry.user.group === home}
            accent={accent}
            size={28}
          />
          <span
            style={{
              fontWeight: 700,
              fontSize: 22,
              lineHeight: "28px",
              color: accent[1],
              flexShrink: 0,
            }}
          >
            ЛР {entry.lab.number}
          </span>
          <span
            style={{
              fontSize: 22,
              lineHeight: "28px",
              color: C.muted,
              flex: 1,
              minWidth: 0,
              ...ellipsis,
            }}
          >
            · {entry.lab.title}
          </span>
        </div>
        {flags.length ? (
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>{flags}</div>
        ) : null}
      </div>
      {entry.late ? <LateMark /> : null}
    </div>
  );
}

/** Делит список на `n` колонок по порядку: сначала первая сверху вниз. */
function columnsOf<T>(list: T[], n: number): T[][] {
  const size = Math.ceil(list.length / n);
  return Array.from({ length: n }, (_, i) =>
    list.slice(i * size, (i + 1) * size),
  );
}

function Queue({
  queue,
  columns,
  home,
  accent,
  avatars,
}: {
  queue: QueueEntry[];
  columns: number;
  home: string;
  accent: [string, string];
  avatars: Map<string, Uint8Array>;
}) {
  const reserveAt = queue.findIndex((e) => e.reserve);
  const items = queue.map((entry, i) => ({ entry, pos: i + 1 }));
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {columnsOf(items, columns).map((col, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: колонки не переставляются
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              flex: 1,
              minWidth: 0,
            }}
          >
            {col.map(({ entry, pos }) => (
              <QueueRow
                key={`${entry.user.id}-${entry.lab.id}`}
                pos={pos}
                entry={entry}
                home={home}
                accent={accent}
                avatars={avatars}
              />
            ))}
          </div>
        ))}
      </div>
      {reserveAt >= 0 ? (
        <span style={{ fontSize: 21, lineHeight: "26px", color: C.muted }}>
          С {reserveAt + 1}-го места — резерв: примут, если останется время
        </span>
      ) : null}
    </div>
  );
}

function Theory({
  theory,
  count,
  home,
  accent,
}: {
  theory: Participant[];
  count: number;
  home: string;
  accent: [string, string];
}) {
  const perLab = new Map<number, number>();
  for (const p of theory)
    for (const l of p.labs)
      perLab.set(l.number, (perLab.get(l.number) ?? 0) + 1);
  const labs = [...perLab].sort((a, b) => a[0] - b[0]);
  // Своя группа в конце, как в макете: остальные — по порядку записи.
  const sorted = [...theory].sort(
    (a, b) => Number(a.user.group === home) - Number(b.user.group === home),
  );
  const people = theory.length;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: THEORY_WIDTH,
        flexShrink: 0,
        padding: "18px 20px",
        borderRadius: 16,
        background: C.card,
        border: `1px solid ${C.cardBorder}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Svg node={BookOpen} size={28} color={accent[1]} />
        <span
          style={{ ...heading, fontSize: 30, lineHeight: 1, color: C.text }}
        >
          Теормин
        </span>
        <span
          style={{
            ...heading,
            fontSize: 22,
            lineHeight: 1,
            color: accent[1],
            marginLeft: "auto",
          }}
        >
          {people
            ? `${people} чел. · ${count} ${plural(count, "отметка", "отметки", "отметок")}`
            : "никто не отметился"}
        </span>
      </div>
      {labs.length ? (
        <div
          style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}
        >
          {labs.map(([n, c]) => (
            <div
              key={n}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                height: 36,
                padding: "0 12px",
                borderRadius: 9,
                background: C.row,
              }}
            >
              <span style={{ fontSize: 20, lineHeight: 1, color: C.muted }}>
                ЛР {n}
              </span>
              <span
                style={{
                  ...heading,
                  fontSize: 20,
                  lineHeight: 1,
                  color: C.text,
                }}
              >
                {c}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {people ? (
        <div
          style={{ display: "flex", flexDirection: "column", marginTop: 10 }}
        >
          {sorted.map((p) => (
            <div
              key={p.user.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                height: 44,
              }}
            >
              <GroupBadge
                group={p.user.group}
                home={p.user.group === home}
                accent={accent}
                size={28}
              />
              <span
                style={{
                  fontSize: 24,
                  lineHeight: "30px",
                  color: C.textSoft,
                  flex: 1,
                  minWidth: 0,
                  ...ellipsis,
                }}
              >
                {p.user.name}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                {p.labs.map((l) => (
                  <div
                    key={l.id}
                    style={{
                      display: "flex",
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: rgba(accent[0], 0.2),
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        ...heading,
                        fontSize: 19,
                        lineHeight: 1,
                        color: accent[1],
                      }}
                    >
                      {l.number}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Report({ session: s, settings, avatars, now }: ReportInput) {
  const tz = settings.timezone || "Europe/Moscow";
  const home = settings.groupName || "М3105";
  const accent = ACCENT[s.subjectColor as SubjectColor] ?? ACCENT.blue;
  const starts = new Date(s.startsAt);
  const diff = dayDiff(now, starts, tz);
  const when =
    diff === 0
      ? "Кто сдаёт сегодня"
      : diff === 1
        ? "Кто сдаёт завтра"
        : diff < 0
          ? "Кто сдавал"
          : "Кто сдаёт";
  const weekday =
    WEEKDAYS_FULL[(inTz(starts, tz).getDay() + 6) % 7].toLowerCase();
  const week = academicWeek(starts, settings);
  const defenses = s.queue.length;
  const time = `${fmtTime(s.startsAt, tz)}${s.endsAt ? `–${fmtTime(s.endsAt, tz)}` : ""}`;
  const showTheory = s.theoryMin && !s.canceled;
  const mutedIcon = (node: IconNode) => (
    <Svg node={node} size={20} color={C.muted} />
  );

  let body: ReactNode;
  if (s.canceled) {
    body = (
      <div
        style={{
          display: "flex",
          flex: 1,
          padding: "20px 24px",
          borderRadius: 14,
          background: "rgba(255,32,86,0.14)",
          border: "1px solid rgba(255,32,86,0.4)",
        }}
      >
        <span
          style={{
            ...heading,
            fontSize: 30,
            lineHeight: "38px",
            color: "#ffa1ad",
          }}
        >
          Занятие отменено{s.cancelReason ? `: ${s.cancelReason}` : ""}
        </span>
      </div>
    );
  } else if (defenses) {
    body = (
      <Queue
        queue={s.queue}
        columns={showTheory ? 2 : 3}
        home={home}
        accent={accent}
        avatars={avatars}
      />
    );
  } else {
    body = (
      <div
        style={{
          display: "flex",
          flex: 1,
          justifyContent: "center",
          padding: "40px 0",
          borderRadius: 14,
          background: C.row,
        }}
      >
        <span style={{ fontSize: 28, color: C.muted }}>
          Пока никто не записался
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        width: REPORT_WIDTH,
        padding: "26px 28px 28px",
        backgroundColor: C.bg,
        backgroundImage: `linear-gradient(180deg, ${rgba(accent[0], 0.16)} 0px, ${C.bg} 360px)`,
        fontFamily: "Inter",
        color: C.text,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
          <span
            style={{
              ...heading,
              fontSize: 56,
              lineHeight: "64px",
              letterSpacing: -1.2,
              color: C.text,
            }}
          >
            {fmtDate(starts, tz)}, {weekday}
          </span>
          {week ? (
            <span style={{ fontSize: 26, lineHeight: "32px", color: C.muted }}>
              {week.number} неделя ·{" "}
              {week.parity === "odd" ? "нечётная" : "чётная"}
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Svg node={RefreshCw} size={20} color={C.muted} />
            <span style={{ fontSize: 21, lineHeight: 1, color: C.muted }}>
              обновлено {fmtTime(now, tz)}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              height: 38,
              padding: "0 14px",
              borderRadius: 19,
              background: rgba(accent[0], 0.18),
              border: `1px solid ${rgba(accent[0], 0.4)}`,
            }}
          >
            <div
              style={{
                display: "flex",
                width: 10,
                height: 10,
                borderRadius: 5,
                background: accent[0],
                boxShadow: `0 0 10px ${accent[0]}`,
              }}
            />
            <span
              style={{
                ...heading,
                fontSize: 22,
                lineHeight: 1,
                color: accent[1],
              }}
            >
              {when}
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          height: 100,
          padding: "0 22px",
          borderRadius: 16,
          border: `1px solid ${C.cardBorder}`,
          backgroundColor: C.card,
          backgroundImage: `linear-gradient(110deg, ${rgba(accent[0], 0.42)} 0%, ${rgba(accent[0], 0.12)} 45%, ${rgba(accent[0], 0.04)} 100%)`,
        }}
      >
        <div
          style={{
            display: "flex",
            width: 64,
            height: 64,
            borderRadius: 16,
            background: accent[0],
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: `0 8px 24px ${rgba(accent[0], 0.45)}`,
          }}
        >
          <Svg
            node={subjectIconNode(s.subjectIcon)}
            size={34}
            color="#ffffff"
            strokeWidth={2.2}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexShrink: 1,
            minWidth: 0,
            maxWidth: 420,
          }}
        >
          <span
            style={{
              ...heading,
              fontSize: 40,
              lineHeight: "44px",
              ...ellipsis,
            }}
          >
            {s.subjectShortName || s.subjectName}
          </span>
          {s.subjectShortName ? (
            <span
              style={{
                fontSize: 21,
                lineHeight: "26px",
                color: C.muted,
                ...ellipsis,
              }}
            >
              {s.subjectName}
            </span>
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            flex: 1,
            minWidth: 0,
            justifyContent: "center",
          }}
        >
          <Chip icon={mutedIcon(Users)}>{audienceLabel(s.audience)}</Chip>
          <Chip icon={mutedIcon(List)}>
            {defenses} {plural(defenses, "защита", "защиты", "защит")} ·{" "}
            {s.signupsCount}{" "}
            {plural(s.signupsCount, "студент", "студента", "студентов")}
          </Chip>
          {s.frozen ? (
            <Chip icon={mutedIcon(Lock)}>порядок зафиксирован</Chip>
          ) : (
            <Chip icon={mutedIcon(LockOpen)}>
              фиксация в {fmtTime(s.freezesAt, tz)}
            </Chip>
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 2,
            flexShrink: 0,
          }}
        >
          <span style={{ ...heading, fontSize: 38, lineHeight: "42px" }}>
            {time}
          </span>
          {s.location ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {mutedIcon(MapPin)}
              <span
                style={{ fontSize: 22, lineHeight: "28px", color: C.textSoft }}
              >
                ауд. {s.location}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {body}
        {showTheory ? (
          <Theory
            theory={s.theory}
            count={s.theoryCount}
            home={home}
            accent={accent}
          />
        ) : null}
      </div>
    </div>
  );
}

let rendererPromise: Promise<Renderer> | null = null;

/** Один рендерер на процесс: шрифты из public/og регистрируются один раз. */
function renderer(): Promise<Renderer> {
  rendererPromise ??= (async () => {
    const r = new Renderer();
    const font = (file: string) =>
      readFile(path.join(process.cwd(), "public", "og", file));
    const [inter400, inter700, manrope700] = await Promise.all([
      font("Inter-400.ttf"),
      font("Inter-700.ttf"),
      font("Manrope-700.ttf"),
    ]);
    await r.registerFont({ name: "Inter", data: inter400, weight: 400 });
    await r.registerFont({ name: "Inter", data: inter700, weight: 700 });
    await r.registerFont({ name: "Manrope", data: manrope700, weight: 700 });
    return r;
  })();
  rendererPromise.catch(() => {
    rendererPromise = null;
  });
  return rendererPromise;
}

/** PNG отчёта по сдаче, REPORT_WIDTH × REPORT_SCALE пикселей в ширину. */
export async function renderPracticeReport(
  input: ReportInput,
): Promise<Uint8Array> {
  return render(<Report {...input} />, {
    renderer: await renderer(),
    // width — в пикселях PNG, devicePixelRatio масштабирует вёрстку под него.
    width: Math.round(REPORT_WIDTH * REPORT_SCALE),
    devicePixelRatio: REPORT_SCALE,
    format: "png",
    images: [...input.avatars].map(([src, data]) => ({ src, data })),
  });
}
