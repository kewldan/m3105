import { Skeleton } from "@/components/ui/skeleton";

const LINES = ["w-full", "w-11/12", "w-full", "w-4/5", "w-full", "w-2/3"];

/**
 * Каркас конспекта: показывается сразу по клику, пока сервер собирает
 * страницу. Повторяет её сетку, чтобы текст встал на место без прыжка.
 */
export default function NoteLoading() {
  return (
    <div className="space-y-8" aria-busy="true">
      <span className="sr-only">Открываем конспект…</span>
      <div className="space-y-4">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-6 w-40 rounded-full" />
        <Skeleton className="h-9 w-full max-w-xl sm:h-10" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-10">
        <div className="min-w-0 space-y-8">
          <Skeleton className="h-11 w-full rounded-xl lg:hidden" />
          {["a", "b", "c"].map((block) => (
            <div key={block} className="space-y-3">
              <Skeleton className="h-6 w-1/2" />
              {LINES.map((width, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: статичный список полосок
                <Skeleton key={i} className={`h-4 ${width}`} />
              ))}
            </div>
          ))}
        </div>
        <div className="hidden space-y-3 lg:block">
          <Skeleton className="h-5 w-32" />
          {LINES.map((width, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: статичный список полосок
            <Skeleton key={i} className={`h-4 ${width}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
