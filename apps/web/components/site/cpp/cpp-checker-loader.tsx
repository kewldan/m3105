"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

// Monaco работает только в браузере и весит несколько мегабайт: грузится
// отдельным чанком уже после страницы.
export const CppCheckerLoader = dynamic(
  () => import("./cpp-checker").then((m) => m.CppChecker),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[min(70vh,640px)] rounded-xl" />,
  },
);
