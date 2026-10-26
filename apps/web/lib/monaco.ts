"use client";

// Monaco собирается в бандл, а не грузится с CDN: CSP пускает скрипты только
// со своего origin. Берётся ядро редактора, его стандартные фичи (поиск,
// сворачивание, quick fix…) и подсветка C++; языковые сервисы TypeScript,
// CSS и JSON не нужны, поэтому воркер один — базовый.
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/features/register.all";
import "monaco-editor/languages/definitions/cpp/register";

self.MonacoEnvironment = {
  getWorker: () =>
    new Worker(
      new URL("monaco-editor/editor/editor.worker.js", import.meta.url),
      { type: "module" },
    ),
};

loader.config({ monaco });

export { monaco };
