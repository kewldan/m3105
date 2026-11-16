"use client";

import { CheckIcon, CopyIcon, ImageOffIcon } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";

import { useUser } from "@/components/site/user-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BADGE_FAMILIES,
  type BadgeFamily,
  type BadgeOptions,
  type BadgeTheme,
  badgeHtml,
  badgeMarkdown,
  badgeUrl,
  ISU_RE,
} from "@/lib/badges";
import { cn } from "@/lib/utils";

export type BadgeSubject = { slug: string; name: string };

type ThemeChoice = BadgeTheme | "auto";

/** Builder of README cards: style, theme, subjects; live preview and code. */
export function BadgeBuilder({ subjects }: { subjects: BadgeSubject[] }) {
  const { me } = useUser();
  const myIsu = me?.user.approved ? me.user.isu : "";
  const [isu, setIsu] = useState(myIsu);
  const [familyId, setFamilyId] = useState("classic");
  const [theme, setTheme] = useState<ThemeChoice>("auto");
  const [picked, setPicked] = useState<string[]>(subjects.map((s) => s.slug));
  const [hideName, setHideName] = useState(false);
  const [hideTotal, setHideTotal] = useState(false);

  const cleanIsu = useDeferredValue(isu.trim());
  const valid = ISU_RE.test(cleanIsu);
  const family =
    BADGE_FAMILIES.find((f) => f.id === familyId) ?? BADGE_FAMILIES[0];
  const all = picked.length === subjects.length;
  const options: BadgeOptions = {
    isu: cleanIsu,
    subjects: all
      ? []
      : subjects.map((s) => s.slug).filter((s) => picked.includes(s)),
    hideName,
    hideTotal,
  };
  const urls = themedUrls(family, theme, options);
  // Превью идут через тот же сайт: в dev — через прокси Next на локальный API.
  const previews = themedUrls(family, theme, options, "");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="space-y-6">
        <section className="space-y-2">
          <Label htmlFor="badge-isu">Номер ИСУ</Label>
          <Input
            id="badge-isu"
            inputMode="numeric"
            autoComplete="off"
            placeholder="например, 561445"
            value={isu}
            onChange={(e) => setIsu(e.target.value.replace(/\D/g, ""))}
            className="max-w-56 tabular-nums"
          />
          <p className="text-sm text-muted-foreground text-pretty">
            {myIsu && cleanIsu === myIsu
              ? "Это ваш номер — подставили из профиля."
              : "Карточка строится по номеру ИСУ из таблиц баллов, входить на сайт не нужно."}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Оформление</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BADGE_FAMILIES.map((f) => {
              const style = f.styles.dark ?? f.styles.light ?? "";
              const active = f.id === family.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFamilyId(f.id)}
                  aria-pressed={active}
                  className={cn(
                    "group flex flex-col gap-2 rounded-xl border bg-card p-2 text-left transition-colors",
                    "hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary",
                    active && "border-primary ring-2 ring-primary/30",
                  )}
                >
                  <span className="flex h-20 items-center justify-center overflow-hidden rounded-lg bg-muted/60 p-1.5">
                    {valid ? (
                      // biome-ignore lint/performance/noImgElement: SVG с API, оптимизировать нечего
                      <img
                        src={badgeUrl(style, options, "")}
                        alt=""
                        loading="lazy"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <ImageOffIcon
                        className="size-5 text-muted-foreground"
                        aria-hidden
                      />
                    )}
                  </span>
                  <span className="truncate px-1 text-xs font-medium">
                    {f.title}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {family.styles.dark && family.styles.light ? (
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Тема</h2>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["auto", "Как у читателя"],
                  ["dark", "Тёмная"],
                  ["light", "Светлая"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={theme === value ? "default" : "outline"}
                  onClick={() => setTheme(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            {theme === "auto" ? (
              <p className="text-sm text-muted-foreground text-pretty">
                GitHub сам покажет тёмную или светлую карточку под тему того,
                кто открыл README.
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Что показать</h2>
          {subjects.length > 1 ? (
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {subjects.map((s) => {
                const id = `badge-subject-${s.slug}`;
                const on = picked.includes(s.slug);
                return (
                  <div key={s.slug} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={on}
                      disabled={on && picked.length === 1}
                      onCheckedChange={(v) =>
                        setPicked((cur) =>
                          v
                            ? [...cur, s.slug]
                            : cur.filter((x) => x !== s.slug),
                        )
                      }
                    />
                    <Label htmlFor={id} className="font-normal">
                      {s.name}
                    </Label>
                  </div>
                );
              })}
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <Switch
              id="badge-name"
              checked={!hideName}
              onCheckedChange={(v) => setHideName(!v)}
            />
            <Label htmlFor="badge-name" className="font-normal">
              Имя и фамилия
            </Label>
          </div>
          {family.id === "shields" ? (
            <div className="flex items-center gap-2">
              <Switch
                id="badge-total"
                checked={!hideTotal}
                onCheckedChange={(v) => setHideTotal(!v)}
              />
              <Label htmlFor="badge-total" className="font-normal">
                Бейдж с суммой
              </Label>
            </div>
          ) : null}
        </section>
      </div>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <section
          aria-label="Превью"
          className="flex min-h-48 flex-col items-center justify-center gap-3 overflow-x-auto rounded-2xl border bg-[repeating-conic-gradient(var(--color-muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-4"
        >
          {valid ? (
            Object.entries(previews).map(([t, src]) => (
              // biome-ignore lint/performance/noImgElement: SVG с API, оптимизировать нечего
              <img
                key={t}
                src={src}
                alt={`Карточка, ${t === "dark" ? "тёмная" : "светлая"} тема`}
                className={cn("h-auto max-w-full", family.wide && "max-w-none")}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Введите номер ИСУ, чтобы увидеть карточку
            </p>
          )}
        </section>

        <Tabs defaultValue="md">
          <TabsList>
            <TabsTrigger value="md">Markdown</TabsTrigger>
            <TabsTrigger value="html">HTML</TabsTrigger>
            <TabsTrigger value="url">Ссылка</TabsTrigger>
          </TabsList>
          <TabsContent value="md">
            <Snippet
              disabled={!valid}
              code={
                urls.dark && urls.light
                  ? badgeHtml(urls)
                  : badgeMarkdown((urls.dark ?? urls.light) as string)
              }
            />
          </TabsContent>
          <TabsContent value="html">
            <Snippet disabled={!valid} code={badgeHtml(urls)} />
          </TabsContent>
          <TabsContent value="url">
            <Snippet disabled={!valid} code={Object.values(urls).join("\n")} />
          </TabsContent>
        </Tabs>
        <p className="text-sm text-muted-foreground text-pretty">
          Вставьте код в README профиля — репозиторий с именем как у вашего
          логина на GitHub. Баллы обновляются сами после синка таблиц; GitHub
          кэширует картинки, так что свежие цифры появятся в течение часа.
        </p>
      </div>
    </div>
  );
}

function themedUrls(
  family: BadgeFamily,
  theme: ThemeChoice,
  o: BadgeOptions,
  base?: string,
): Partial<Record<BadgeTheme, string>> {
  const { dark, light } = family.styles;
  if (dark && light) {
    if (theme === "dark") return { dark: badgeUrl(dark, o, base) };
    if (theme === "light") return { light: badgeUrl(light, o, base) };
    return { dark: badgeUrl(dark, o, base), light: badgeUrl(light, o, base) };
  }
  const only = (dark ?? light) as string;
  return dark
    ? { dark: badgeUrl(only, o, base) }
    : { light: badgeUrl(only, o, base) };
}

function Snippet({ code, disabled }: { code: string; disabled: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Скопировано");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Не удалось скопировать");
    }
  };
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl border bg-muted/50 p-3 pr-12 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
        {code}
      </pre>
      <Button
        size="icon-sm"
        variant="ghost"
        className="absolute top-2 right-2"
        onClick={copy}
        disabled={disabled}
        aria-label="Скопировать"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  );
}
