"use client";

import {
  CalendarPlusIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
} from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function SubscribeDialog({ subject }: { subject?: string }) {
  const origin = useSyncExternalStore(
    () => () => {},
    () => process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin,
    () => process.env.NEXT_PUBLIC_SITE_URL ?? "",
  );
  const [copied, setCopied] = useState(false);
  const qs = subject ? `?subject=${encodeURIComponent(subject)}` : "";
  const url = `${origin}/api/v1/calendar.ics${qs}`;

  const webcal = url.replace(/^https?:\/\//, "webcal://");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Ссылка скопирована");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Не удалось скопировать — выделите ссылку вручную");
    }
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>
        <CalendarPlusIcon data-icon="inline-start" />
        Добавить в календарь
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Подписка на календарь</DialogTitle>
          <DialogDescription>
            Подпишитесь по ссылке — календарь будет обновляться сам, а за сутки
            до дедлайна, контрольной или экзамена придёт напоминание.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Ссылка на календарь"
            className="font-mono text-xs"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={copy}
            aria-label="Скопировать ссылку"
          >
            {copied ? <CheckIcon className="text-emerald-600" /> : <CopyIcon />}
          </Button>
        </div>
        <div className="space-y-2 text-sm">
          <div>
            <div className="font-medium">Google Календарь</div>
            <p className="text-muted-foreground">
              Слева «Другие календари» → «+» → «По URL», вставьте ссылку.
            </p>
          </div>
          <div>
            <div className="font-medium">Apple Календарь (iPhone, Mac)</div>
            <p className="text-muted-foreground">
              Откройте{" "}
              <a
                href={webcal}
                className="text-primary underline underline-offset-4"
              >
                webcal-ссылку
              </a>{" "}
              или «Файл» → «Новая подписка на календарь».
            </p>
          </div>
          <div>
            <div className="font-medium">Outlook</div>
            <p className="text-muted-foreground">
              «Добавить календарь» → «Подписаться из Интернета».
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            render={<a href={url} download="m3105.ics" />}
          >
            <DownloadIcon data-icon="inline-start" />
            Скачать .ics
          </Button>
          <Button render={<a href={webcal} />}>
            <CalendarPlusIcon data-icon="inline-start" />
            Подписаться
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
