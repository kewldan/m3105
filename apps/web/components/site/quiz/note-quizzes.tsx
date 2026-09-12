import { SparklesIcon } from "lucide-react";

import { MdxBody } from "@/components/site/mdx-content";
import {
  QuizPlayer,
  type RenderedQuestion,
} from "@/components/site/quiz/quiz-player";
import { getQuiz } from "@/lib/api/public";
import type { Quiz, QuizSummary } from "@/lib/api/types";
import { plural } from "@/lib/format";
import { renderMdx } from "@/lib/mdx/render";

async function renderQuestions(
  quiz: Quiz,
): Promise<Record<string, RenderedQuestion>> {
  const entries = await Promise.all(
    quiz.questions.map(async (q): Promise<[string, RenderedQuestion]> => {
      const prompt = await renderMdx(q.prompt);
      const explanation = q.explanation ? await renderMdx(q.explanation) : null;
      return [
        q.id,
        {
          prompt: <MdxBody rendered={prompt} size="sm" />,
          explanation: explanation ? (
            <MdxBody rendered={explanation} size="sm" />
          ) : null,
        },
      ];
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * Server component: renders every quiz attached to a lecture inline, under
 * the note body. Renders nothing when the lecture has no quizzes.
 */
export async function NoteQuizzes({ quizzes }: { quizzes: QuizSummary[] }) {
  if (quizzes.length === 0) return null;
  const full = (
    await Promise.all(
      quizzes.map(async (q) => {
        try {
          return await getQuiz(q.slug);
        } catch {
          return null;
        }
      }),
    )
  ).filter((q): q is Quiz => q !== null);
  if (full.length === 0) return null;
  const rendered = await Promise.all(full.map(renderQuestions));
  const total = full.reduce((n, q) => n + q.questions.length, 0);

  return (
    <section
      id="quiz"
      aria-labelledby="quiz-heading"
      className="scroll-mt-24 space-y-5"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <SparklesIcon className="size-5" />
        </div>
        <div className="min-w-0 space-y-1">
          <h2 id="quiz-heading" className="text-xl font-semibold">
            Проверь себя
          </h2>
          <p className="text-sm text-muted-foreground">
            {full.length === 1
              ? `${total} ${plural(total, "вопрос", "вопроса", "вопросов")} по материалу лекции. Результаты хранятся только в вашем браузере.`
              : `${full.length} ${plural(full.length, "квиз", "квиза", "квизов")}, ${total} ${plural(total, "вопрос", "вопроса", "вопросов")}. Результаты хранятся только в вашем браузере.`}
          </p>
        </div>
      </div>
      <div className="space-y-6">
        {full.map((quiz, i) => (
          <div
            key={quiz.id}
            id={`quiz-${quiz.slug}`}
            className="scroll-mt-24 space-y-3"
          >
            {full.length > 1 ? (
              <h3 className="font-semibold">{quiz.title}</h3>
            ) : null}
            <QuizPlayer
              quiz={{
                slug: quiz.slug,
                title: quiz.title,
                description: quiz.description,
                shuffleQuestions: quiz.shuffleQuestions,
                shuffleOptions: quiz.shuffleOptions,
                questions: quiz.questions,
                noteSlug: quiz.noteSlug,
                noteTitle: quiz.noteTitle,
                subjectSlug: quiz.subjectSlug,
              }}
              rendered={rendered[i]}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
