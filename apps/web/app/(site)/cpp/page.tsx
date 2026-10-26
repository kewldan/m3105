import type { Metadata } from "next";

import { CppCheckerLoader } from "@/components/site/cpp/cpp-checker-loader";
import { PageHeader } from "@/components/site/page-header";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Проверка C++ по Google Style",
  description:
    "Вставьте код на C++ — clang-tidy и clang-format проверят его по Google C++ Style Guide и подскажут, как исправить.",
  path: "/cpp",
});

export default function CppPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Инструменты"
        title="Проверка C++"
        description="clang-tidy и clang-format по Google C++ Style Guide: имена, оформление, типичные ошибки. Код никуда не сохраняется, кроме вашего браузера."
      />
      <CppCheckerLoader />
    </div>
  );
}
