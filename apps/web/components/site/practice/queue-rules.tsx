import { ChevronDownIcon, ListOrderedIcon } from "lucide-react";

/** The agreed queue rules, short enough to read before signing up. */
export function QueueRules() {
  return (
    <details className="group rounded-2xl border bg-card p-4 sm:p-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <ListOrderedIcon className="size-4 text-primary" aria-hidden />
        Как строится очередь
        <ChevronDownIcon
          className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground text-pretty">
        <li>
          В очереди защиты, а не люди: одна строка — вы с одной лабой. Принесли
          две — вторая пойдёт после первых лаб всех остальных.
        </li>
        <li>
          Первыми идут защиты, которые в прошлый раз остались в резерве: кого не
          успели принять две пары подряд — раньше тех, кого не успели один раз,
          дальше в прежнем порядке.
        </li>
        <li>
          Дальше — у кого лаба новее, тот раньше. При равенстве решает жребий:
          он закреплён за вами на эту сдачу и не меняется от перезагрузки. Время
          записи не важно — гнаться за первыми минутами не нужно.
        </li>
        <li>
          В 20:00 накануне порядок замораживается. Записаться можно и позже, но
          только в конец, по времени записи, — никого не сдвигая.
        </li>
        <li>
          Преподаватель принимает около 10 защит за пару. Остальные — резерв:
          приходите, примут, если останется время, а если нет — в следующий раз
          вы первые.
        </li>
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">
        Баллы от очереди не зависят: срок считается по последнему пушу в
        пул-реквест.
      </p>
    </details>
  );
}
