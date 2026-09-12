import type { EventKind, Parity, Status } from "@/lib/api/types";
import { EVENT_KIND_LABEL } from "@/lib/format";

export type Option<V extends string = string> = { value: V; label: string };

export const STATUS_OPTIONS: Option<Status>[] = [
  { value: "draft", label: "Черновик" },
  { value: "published", label: "Опубликовано" },
];

export const PARITY_OPTIONS: Option<Parity>[] = [
  { value: "odd", label: "Нечётная" },
  { value: "even", label: "Чётная" },
];

export const EVENT_KIND_OPTIONS: Option<EventKind>[] = (
  ["deadline", "test", "exam", "consultation", "other"] as EventKind[]
).map((value) => ({ value, label: EVENT_KIND_LABEL[value] ?? value }));

export const TIMEZONE_OPTIONS: Option[] = [
  "Europe/Kaliningrad",
  "Europe/Moscow",
  "Europe/Samara",
  "Asia/Yekaterinburg",
  "Asia/Omsk",
  "Asia/Novosibirsk",
  "Asia/Krasnoyarsk",
  "Asia/Irkutsk",
  "Asia/Yakutsk",
  "Asia/Vladivostok",
  "Asia/Magadan",
  "Asia/Kamchatka",
  "Europe/Minsk",
  "Europe/Kyiv",
  "Asia/Almaty",
  "Asia/Tashkent",
  "Asia/Tbilisi",
  "Asia/Yerevan",
  "UTC",
].map((value) => ({ value, label: value }));
