import type { Subject } from "@/lib/api/types";

export type SubjectTeacher = { role: string; name: string };

/** Лектор и преподаватель практики; один и тот же человек показывается один раз. */
export function subjectTeachers(
  subject: Pick<Subject, "lecturer" | "practiceTeacher">,
): SubjectTeacher[] {
  const { lecturer, practiceTeacher } = subject;
  if (lecturer && lecturer === practiceTeacher) {
    return [{ role: "Лекции и практика", name: lecturer }];
  }
  const out: SubjectTeacher[] = [];
  if (lecturer) out.push({ role: "Лекции", name: lecturer });
  if (practiceTeacher) out.push({ role: "Практика", name: practiceTeacher });
  return out;
}
