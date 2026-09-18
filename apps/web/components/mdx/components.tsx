import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  LightbulbIcon,
  XCircleIcon,
} from "lucide-react";
import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

type CalloutType = "info" | "tip" | "warning" | "danger" | "success";

const CALLOUT: Record<
  CalloutType,
  { icon: typeof InfoIcon; className: string; title: string }
> = {
  info: {
    icon: InfoIcon,
    className:
      "border-blue-500/30 bg-blue-500/8 text-blue-900 dark:text-blue-100",
    title: "Заметка",
  },
  tip: {
    icon: LightbulbIcon,
    className:
      "border-violet-500/30 bg-violet-500/8 text-violet-900 dark:text-violet-100",
    title: "Совет",
  },
  warning: {
    icon: AlertTriangleIcon,
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100",
    title: "Внимание",
  },
  danger: {
    icon: XCircleIcon,
    className:
      "border-rose-500/40 bg-rose-500/10 text-rose-950 dark:text-rose-100",
    title: "Важно",
  },
  success: {
    icon: CheckCircle2Icon,
    className:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100",
    title: "Готово",
  },
};

/** <Callout type="warning" title="...">…</Callout> */
export function Callout({
  type = "info",
  title,
  children,
}: {
  type?: CalloutType;
  title?: string;
  children?: ReactNode;
}) {
  const c = CALLOUT[type] ?? CALLOUT.info;
  const Icon = c.icon;
  return (
    <div
      className={cn(
        "not-prose my-5 flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed print:break-inside-avoid",
        c.className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1 [&_p]:m-0 [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 dark:[&_code]:bg-white/10">
        <div className="font-semibold">{title ?? c.title}</div>
        <div>{children}</div>
      </div>
    </div>
  );
}

/** <Spoiler title="Показать решение">…</Spoiler> */
export function Spoiler({
  title = "Показать",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <details className="not-prose group my-5 rounded-xl border bg-card">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/60 group-open:border-b">
        {title}
      </summary>
      <div className="prose prose-sm dark:prose-invert max-w-none px-4 py-3">
        {children}
      </div>
    </details>
  );
}

/** <Steps>1. …</Steps> — a numbered list with larger spacing. */
export function Steps({ children }: { children?: ReactNode }) {
  return (
    <div className="[&>ol]:space-y-3 [&>ol>li]:pl-1 [&>ol>li::marker]:font-semibold [&>ol>li::marker]:text-primary">
      {children}
    </div>
  );
}

function Anchor({ href = "", children, ...rest }: ComponentProps<"a">) {
  const external = /^https?:\/\//.test(href);
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} {...rest}>
      {children}
    </Link>
  );
}

function Table(props: ComponentProps<"table">) {
  return (
    <div className="not-prose my-6 overflow-x-auto rounded-xl border">
      <table
        className="w-full text-sm [&_th]:bg-muted/60 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_td]:border-t [&_td]:px-3 [&_td]:py-2 [&_td]:align-top"
        {...props}
      />
    </div>
  );
}

function Pre(props: ComponentProps<"pre">) {
  return (
    <pre
      className="not-prose my-5 overflow-x-auto rounded-xl border bg-muted/40 px-4 py-3 text-[13px] leading-relaxed"
      {...props}
    />
  );
}

function Img({ alt = "", ...props }: ComponentProps<"img">) {
  return (
    // biome-ignore lint/performance/noImgElement: MDX images come from arbitrary external hosts.
    <img alt={alt} loading="lazy" className="rounded-xl border" {...props} />
  );
}

export const mdxComponents: MDXComponents = {
  Callout,
  Spoiler,
  Steps,
  a: Anchor,
  table: Table,
  pre: Pre,
  img: Img,
};
