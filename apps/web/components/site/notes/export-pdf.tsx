"use client";

import { FileDownIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Картинки из MDX ленивые: без этого на бумагу попадут только уже прокрученные. */
function loadImages(root: ParentNode): Promise<unknown> | null {
  const lazy = [
    ...root.querySelectorAll<HTMLImageElement>('img[loading="lazy"]'),
  ];
  for (const img of lazy) img.loading = "eager";
  const pending = lazy.filter((img) => !img.complete);
  if (pending.length === 0) return null;
  return Promise.race([
    Promise.all(pending.map((img) => img.decode().catch(() => undefined))),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}

/**
 * «Сохранить в PDF» через печать браузера: текст остаётся текстом, формулы и
 * подсветка кода — векторными. Бумажную вёрстку задают print-стили в globals.css,
 * а здесь на время печати раскрываются спойлеры и подменяется заголовок — из него
 * браузер берёт имя файла. То же срабатывает и на ⌘P.
 */
export function ExportPdfButton({
  fileName,
  className,
}: {
  fileName: string;
  className?: string;
}) {
  const restore = useRef<(() => void) | null>(null);

  useEffect(() => {
    const prepare = () => {
      if (restore.current) return;
      const closed = [
        ...document.querySelectorAll<HTMLDetailsElement>(
          "#content details:not([open])",
        ),
      ];
      for (const d of closed) d.open = true;
      const title = document.title;
      document.title = fileName;
      restore.current = () => {
        for (const d of closed) d.open = false;
        document.title = title;
        restore.current = null;
      };
    };
    const done = () => restore.current?.();
    window.addEventListener("beforeprint", prepare);
    window.addEventListener("afterprint", done);
    return () => {
      window.removeEventListener("beforeprint", prepare);
      window.removeEventListener("afterprint", done);
      done();
    };
  }, [fileName]);

  const print = async () => {
    const content = document.getElementById("content");
    const images = content ? loadImages(content) : null;
    // Без ожидания, если ждать нечего: Safari спрашивает подтверждение, когда
    // print() вызван не прямо из клика.
    if (images) await images;
    window.print();
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            onClick={print}
            aria-label="Сохранить конспект в PDF"
            className={cn("print:hidden", className)}
          />
        }
      >
        <FileDownIcon data-icon="inline-start" />
        PDF
      </TooltipTrigger>
      <TooltipContent>
        Откроется печать — выберите «Сохранить как PDF»
      </TooltipContent>
    </Tooltip>
  );
}
