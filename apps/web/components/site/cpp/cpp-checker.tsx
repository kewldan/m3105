"use client";

import { DiffEditor, Editor, type OnMount } from "@monaco-editor/react";
import {
  CheckCheckIcon,
  CircleXIcon,
  InfoIcon,
  PlayIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
  WandSparklesIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api/client";
import { checkCpp } from "@/lib/api/tools";
import type { CppCheckResult, CppDiagnostic } from "@/lib/api/types";
import { monaco } from "@/lib/monaco";
import { cn } from "@/lib/utils";

type CodeEditor = Parameters<OnMount>[0];

const STORAGE_KEY = "cpp-check:code";
const OWNER = "cpplint";

const SAMPLE = `#include <iostream>
#include <string>
#include <vector>

using namespace std;

class student {
public:
  student(string Name, int score) : Name(Name), score(score) {}
  string GetName() { return Name; }
  int score;
private:
  string Name;
};

int main(){
  vector<student> group = {student("Иванов", 87), student("Петрова", 93)};
  int Total = 0;
  for (int i = 0; i < group.size(); i++) Total += group[i].score;
  student* best = NULL;
  for (auto s : group) if (!best || s.score > best->score) best = &s;
  cout << "Средний балл: " << Total / group.size() << endl;
  return 0;
}
`;

const SEVERITY = {
  error: {
    marker: monaco.MarkerSeverity.Error,
    icon: CircleXIcon,
    className: "text-destructive",
  },
  warning: {
    marker: monaco.MarkerSeverity.Warning,
    icon: TriangleAlertIcon,
    className: "text-amber-600 dark:text-amber-400",
  },
  info: {
    marker: monaco.MarkerSeverity.Info,
    icon: InfoIcon,
    className: "text-sky-600 dark:text-sky-400",
  },
} as const;

const EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
  fontSize: 14,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  tabSize: 2,
  rulers: [80],
  automaticLayout: true,
  fixedOverflowWidgets: true,
};

function readSaved(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? SAMPLE;
  } catch {
    return SAMPLE;
  }
}

function save(code: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Приватный режим или запрет хранилища — код просто не запомнится.
  }
}

/** Документация проверки clang-tidy: google-build-using-namespace → checks/google/build-using-namespace. */
function checkDocsUrl(check: string): string | null {
  const dash = check.indexOf("-");
  if (dash < 0 || check === "clang-format") return null;
  const group = check.slice(0, dash);
  if (group === "clang") return null;
  return `https://clang.llvm.org/extra/clang-tidy/checks/${group}/${check.slice(dash + 1)}.html`;
}

function markerKey(m: {
  startLineNumber: number;
  startColumn: number;
  message: string;
}) {
  return `${m.startLineNumber}:${m.startColumn}:${m.message}`;
}

function toMarker(
  model: monaco.editor.ITextModel,
  d: CppDiagnostic,
): monaco.editor.IMarkerData {
  let { endLine, endColumn } = d;
  // У части замечаний clang-tidy даёт только точку — подсвечиваем слово под ней.
  if (endLine === d.line && endColumn <= d.column) {
    const word = model.getWordAtPosition({
      lineNumber: d.line,
      column: d.column,
    });
    endColumn = word ? word.endColumn : d.column + 1;
  }
  return {
    severity: SEVERITY[d.severity].marker,
    message: d.message,
    source: d.check || "clang",
    startLineNumber: d.line,
    startColumn: d.column,
    endLineNumber: endLine,
    endColumn,
  };
}

/** Editor plus clang-format / clang-tidy results. */
export function CppChecker() {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "vs-dark" : "vs";
  const [code, setCode] = useState(readSaved);
  const [result, setResult] = useState<CppCheckResult | null>(null);
  const [checkedCode, setCheckedCode] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState("issues");
  const editorRef = useRef<CodeEditor | null>(null);
  // Исправления clang-tidy по ключу маркера: их читает провайдер quick fix.
  const fixesRef = useRef(new Map<string, CppDiagnostic>());
  const runRef = useRef<() => Promise<void>>(async () => {});

  const stale = result !== null && checkedCode !== code;
  const diagnostics = result?.diagnostics ?? [];
  const issues = diagnostics.filter((d) => d.check !== "clang-format");
  const formatLines = diagnostics.length - issues.length;
  const errors = issues.filter((d) => d.severity === "error").length;
  const warnings = issues.length - errors;

  async function run() {
    const editor = editorRef.current;
    const source = editor?.getValue() ?? code;
    setPending(true);
    try {
      const res = await checkCpp(source);
      setResult(res);
      setCheckedCode(source);
      const model = editor?.getModel();
      if (model) {
        fixesRef.current.clear();
        const markers = res.diagnostics.map((d) => {
          const m = toMarker(model, d);
          if (d.fixes.length) fixesRef.current.set(markerKey(m), d);
          return m;
        });
        monaco.editor.setModelMarkers(model, OWNER, markers);
      }
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Не удалось проверить код",
      );
    } finally {
      setPending(false);
    }
  }
  runRef.current = run;

  useEffect(() => {
    const provider = monaco.languages.registerCodeActionProvider("cpp", {
      provideCodeActions(model, _range, context) {
        const actions: monaco.languages.CodeAction[] = [];
        for (const marker of context.markers) {
          const d = fixesRef.current.get(markerKey(marker));
          if (!d) continue;
          actions.push({
            title: `Исправить: ${d.fixes.map((f) => f.text).join(", ")}`,
            kind: "quickfix",
            diagnostics: [marker],
            isPreferred: true,
            edit: {
              edits: d.fixes.map((f) => ({
                resource: model.uri,
                versionId: undefined,
                textEdit: {
                  range: new monaco.Range(
                    f.line,
                    f.column,
                    f.endLine,
                    f.endColumn,
                  ),
                  text: f.text,
                },
              })),
            },
          });
        }
        return { actions, dispose() {} };
      },
    });
    return () => provider.dispose();
  }, []);

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
      runRef.current(),
    );
  };

  function onChange(value: string | undefined) {
    const next = value ?? "";
    setCode(next);
    save(next);
  }

  function reveal(d: CppDiagnostic) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.revealLineInCenter(d.line);
    editor.setPosition({ lineNumber: d.line, column: d.column });
    editor.focus();
  }

  function applyFix(d: CppDiagnostic) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.pushUndoStop();
    editor.executeEdits(
      OWNER,
      d.fixes.map((f) => ({
        range: new monaco.Range(f.line, f.column, f.endLine, f.endColumn),
        text: f.text,
      })),
    );
    editor.pushUndoStop();
    void runRef.current();
  }

  function applyFormat() {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || !result) return;
    editor.pushUndoStop();
    editor.executeEdits(OWNER, [
      { range: model.getFullModelRange(), text: result.formatted },
    ]);
    editor.pushUndoStop();
    setTab("issues");
    void runRef.current();
  }

  function reset() {
    editorRef.current?.setValue(SAMPLE);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={run} disabled={pending}>
            {pending ? <Spinner /> : <PlayIcon />}
            Проверить
          </Button>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            <Kbd>⌘/Ctrl</Kbd> <Kbd>Enter</Kbd>
          </span>
          <Button variant="ghost" className="ml-auto" onClick={reset}>
            <RotateCcwIcon />
            Пример
          </Button>
        </div>
        <div className="overflow-hidden rounded-xl border bg-background">
          <Editor
            height="min(70vh, 640px)"
            language="cpp"
            path="main.cc"
            theme={theme}
            value={code}
            onChange={onChange}
            onMount={onMount}
            options={EDITOR_OPTIONS}
            loading={<Spinner />}
          />
        </div>
      </div>

      <div className="min-w-0">
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <TabsList>
            <TabsTrigger value="issues">
              Замечания
              {result ? (
                <Badge variant="secondary">{issues.length}</Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="format" disabled={!result}>
              clang-format
              {result ? <Badge variant="secondary">{formatLines}</Badge> : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="issues" className="mt-3 space-y-3">
            {result === null ? (
              <Hint />
            ) : (
              <>
                <Summary
                  errors={errors}
                  warnings={warnings}
                  formatLines={formatLines}
                  stale={stale}
                  onFormat={() => setTab("format")}
                />
                <ul className="space-y-2">
                  {issues.map((d) => (
                    <IssueItem
                      key={`${d.line}:${d.column}:${d.check}:${d.message}`}
                      d={d}
                      onReveal={() => reveal(d)}
                      onFix={stale ? undefined : () => applyFix(d)}
                    />
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  clang-tidy и clang-format, {result.version}. Файл main.cc,
                  -std=c++20 -Wall -Wextra.
                </p>
              </>
            )}
          </TabsContent>

          <TabsContent value="format" className="mt-3 space-y-3">
            {result ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    {formatLines === 0
                      ? "Оформление уже по Google Style."
                      : "Слева ваш код, справа — после clang-format --style=Google."}
                  </p>
                  <Button
                    size="sm"
                    className="ml-auto"
                    onClick={applyFormat}
                    disabled={formatLines === 0 || stale}
                  >
                    <WandSparklesIcon />
                    Применить
                  </Button>
                </div>
                <div className="overflow-hidden rounded-xl border">
                  <DiffEditor
                    height="min(70vh, 640px)"
                    language="cpp"
                    theme={theme}
                    original={checkedCode ?? ""}
                    modified={result.formatted}
                    options={{
                      ...EDITOR_OPTIONS,
                      readOnly: true,
                      renderSideBySide: false,
                      lineNumbers: "on",
                    }}
                    loading={<Spinner />}
                  />
                </div>
              </>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Hint() {
  return (
    <div className="space-y-2 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
      <p>
        Вставьте код и нажмите «Проверить». clang-tidy найдёт нарушения{" "}
        <a
          className="text-primary underline-offset-4 hover:underline"
          href="https://google.github.io/styleguide/cppguide.html"
          target="_blank"
          rel="noreferrer"
        >
          Google C++ Style Guide
        </a>{" "}
        (имена, using namespace, касты, nullptr) и типичные ошибки, а
        clang-format покажет, как оформить код.
      </p>
      <p>
        Подчёркнутое можно исправить прямо в редакторе: курсор на замечание и{" "}
        <Kbd>⌘/Ctrl</Kbd> <Kbd>.</Kbd>
      </p>
    </div>
  );
}

function Summary({
  errors,
  warnings,
  formatLines,
  stale,
  onFormat,
}: {
  errors: number;
  warnings: number;
  formatLines: number;
  stale: boolean;
  onFormat: () => void;
}) {
  const clean = errors + warnings + formatLines === 0;
  return (
    <div className="space-y-2">
      {stale ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          Код изменился после проверки — позиции замечаний могли сдвинуться.
        </p>
      ) : null}
      {clean ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCheckIcon className="size-5" />
          Замечаний нет — код соответствует Google Style.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant={errors ? "destructive" : "secondary"}>
            Ошибок: {errors}
          </Badge>
          <Badge variant="secondary">Предупреждений: {warnings}</Badge>
          {formatLines ? (
            <button
              type="button"
              onClick={onFormat}
              className="text-primary underline-offset-4 hover:underline"
            >
              clang-format поменяет строк: {formatLines} →
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function IssueItem({
  d,
  onReveal,
  onFix,
}: {
  d: CppDiagnostic;
  onReveal: () => void;
  onFix?: () => void;
}) {
  const sev = SEVERITY[d.severity];
  const Icon = sev.icon;
  const docs = d.check ? checkDocsUrl(d.check) : null;
  return (
    <li className="group flex gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/40">
      <Icon className={cn("mt-0.5 size-4 shrink-0", sev.className)} />
      <div className="min-w-0 flex-1 space-y-1">
        <button
          type="button"
          onClick={onReveal}
          className="block text-left text-sm break-words"
        >
          <span className="mr-1.5 font-mono text-xs text-muted-foreground">
            {d.line}:{d.column}
          </span>
          {d.message}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {d.check ? (
            docs ? (
              <a
                href={docs}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {d.check}
              </a>
            ) : (
              <span className="font-mono text-xs text-muted-foreground">
                {d.check}
              </span>
            )
          ) : null}
          {d.fixes.length && onFix ? (
            <Button
              size="xs"
              variant="outline"
              className="ml-auto"
              onClick={onFix}
            >
              <WandSparklesIcon />
              Исправить
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
