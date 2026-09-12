#!/usr/bin/env bun
/**
 * Seeds demo content through the admin API.
 *
 *   bun scripts/seed.ts --api http://localhost:8080 --password dev-password-123
 *
 * Safe to run on an empty database; on a non-empty one it appends new rows.
 */

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) =>
      a.startsWith("--") ? [a.slice(2), all[i + 1] ?? ""] : null,
    )
    .filter((x): x is [string, string] => x !== null),
);
const API = `${(args.api ?? process.env.API_URL ?? "http://localhost:8080").replace(/\/$/, "")}/api/v1`;
const PASSWORD =
  args.password ?? process.env.ADMIN_PASSWORD ?? "dev-password-123";

let cookie = "";

async function call<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

const days = (n: number, hour = 23, minute = 59) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

const monday = () => {
  const d = new Date();
  const wd = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (wd - 1) - 7 * 2); // two weeks ago → week 3 now
  return d.toISOString().slice(0, 10);
};

await call("POST", "/auth/login", { password: PASSWORD });
console.log("✓ вход выполнен");

const settings = await call<Record<string, unknown>>("GET", "/admin/settings");
await call("PUT", "/admin/settings", {
  ...settings,
  siteTitle: "М3105",
  groupName: "М3105",
  description: "Группа М3105: дедлайны, календарь, конспекты и квизы",
  semesterStart: monday(),
  semesterEnd: null,
  firstWeekParity: "odd",
  timezone: "Europe/Moscow",
  links: [
    { title: "Чат группы в Telegram", url: "https://t.me/example_m3105" },
    { title: "Google Drive с материалами", url: "https://drive.google.com" },
  ],
});
console.log("✓ настройки");

type Subject = { id: number; slug: string };
const subj = async (s: Record<string, unknown>) =>
  call<Subject>("POST", "/admin/subjects", s);

const prog = await subj({
  name: "Программирование",
  shortName: "Прога",
  color: "blue",
  icon: "code",
  teacher: "Иванов Иван Иванович",
  position: 1,
  description: `Курс по языку **C** и основам алгоритмов.

<Callout type="info" title="Как проходит курс">Лекция раз в неделю, лабораторные по нечётным неделям. Всего 6 лаб за семестр.</Callout>`,
  links: [{ title: "Методичка (PDF)", url: "https://example.com/prog.pdf" }],
});
const math = await subj({
  name: "Математический анализ",
  shortName: "Матан",
  color: "violet",
  icon: "sigma",
  teacher: "Петрова Мария Сергеевна",
  position: 2,
  description:
    "Пределы, производные, интегралы. Контрольные по темам, экзамен в январе.",
  links: [],
});
const web = await subj({
  name: "Веб-технологии",
  shortName: "Веб",
  color: "emerald",
  icon: "globe",
  teacher: "Сидоров Пётр Алексеевич",
  position: 3,
  description:
    "HTML, CSS, JavaScript и немного бэкенда. Итоговый проект в конце семестра.",
  links: [{ title: "Репозиторий курса", url: "https://github.com" }],
});
const physics = await subj({
  name: "Физика",
  shortName: "Физика",
  color: "amber",
  icon: "atom",
  teacher: "Кузнецов Андрей Николаевич",
  position: 4,
  description: "Механика и молекулярная физика.",
  links: [],
});
console.log("✓ предметы");

const lab = (l: Record<string, unknown>) =>
  call("POST", "/admin/labs", { status: "published", materials: [], ...l });

await lab({
  subjectId: prog.id,
  number: 1,
  title: "Ввод-вывод и арифметика",
  summary: "Первая программа на C: считать числа, посчитать, вывести.",
  content: `Напишите программу, которая считывает два целых числа и выводит их сумму, разность, произведение и частное.

\`\`\`c title="main.c"
#include <stdio.h>

int main(void) {
    int a, b;
    if (scanf("%d %d", &a, &b) != 2) return 1;
    printf("%d %d %d\\n", a + b, a - b, a * b);
    if (b != 0) printf("%.2f\\n", (double)a / b);
    return 0;
}
\`\`\`

<Callout type="tip">Обратите внимание на деление на ноль — это отдельный тестовый случай.</Callout>`,
  requirements: `- Компилируется без предупреждений с \`-Wall -Wextra\`
- Обрабатывает деление на ноль
- Код отформатирован`,
  submission: `1. Создайте ветку \`lab1\` в своём репозитории.
2. Загрузите код и файл \`README.md\` с описанием.
3. Откройте pull request и скиньте ссылку преподавателю.`,
  variants: "Вариант = номер в списке группы по модулю 5 плюс один.",
  deadlineAt: days(-3, 23, 59),
  deadlineNote: "Просроченные лабы принимаются со штрафом −1 балл.",
  maxScore: 10,
  teacher: "Иванов И.И.",
  materials: [
    { title: "Слайды лекции 1", url: "https://example.com/slides1.pdf" },
  ],
});
await lab({
  subjectId: prog.id,
  number: 2,
  title: "Условия и циклы",
  summary: "Ветвления, циклы и простейшие алгоритмы на массивах.",
  content: `Реализуйте функции:

1. Проверка числа на простоту.
2. Поиск максимального элемента массива.
3. Обращение массива на месте.

$$
\\text{Сложность решения не должна превышать } O(n\\sqrt{n})
$$`,
  requirements: "Каждая функция в отдельном файле, тесты в `tests/`.",
  submission: "Так же, как первую лабу: ветка `lab2`, pull request.",
  variants: "",
  deadlineAt: days(4, 23, 59),
  deadlineNote: "",
  maxScore: 10,
  teacher: "Иванов И.И.",
});
await lab({
  subjectId: prog.id,
  number: 3,
  title: "Указатели и строки",
  summary: "Работа с памятью, строки как массивы символов.",
  content:
    "## Задание\n\nРеализуйте собственные `strlen`, `strcpy` и `strcmp`.",
  requirements: "",
  submission: "",
  variants: "",
  deadlineAt: days(12, 23, 59),
  deadlineNote: "",
  maxScore: 12,
  teacher: "",
});
await lab({
  subjectId: prog.id,
  number: 4,
  title: "Структуры и файлы",
  summary: "Черновик: задание уточняется.",
  content: "",
  requirements: "",
  submission: "",
  variants: "",
  deadlineAt: null,
  deadlineNote: "",
  maxScore: null,
  teacher: "",
  status: "draft",
});
await lab({
  subjectId: web.id,
  number: 1,
  title: "Статическая страница",
  summary: "Сверстать страницу-визитку по макету.",
  content: `Сверстайте адаптивную страницу-визитку. Макет в Figma по ссылке в материалах.

<Steps>
1. Семантическая разметка.
2. Стили без фреймворков.
3. Проверка на мобильном.
</Steps>`,
  requirements: "Валидный HTML, адаптив от 360px.",
  submission: "Ссылка на GitHub Pages в форме сдачи.",
  variants: "",
  deadlineAt: days(7, 20, 0),
  deadlineNote: "",
  maxScore: 8,
  teacher: "Сидоров П.А.",
  materials: [{ title: "Макет в Figma", url: "https://figma.com" }],
});
await lab({
  subjectId: web.id,
  number: 2,
  title: "Интерактив на JavaScript",
  summary: "Добавить форму с валидацией и тёмную тему.",
  content:
    "## Задание\n\nДобавьте на страницу из лабы 1 форму обратной связи с валидацией и переключатель темы.",
  requirements: "",
  submission: "",
  variants: "",
  deadlineAt: days(21, 20, 0),
  deadlineNote: "",
  maxScore: 10,
  teacher: "",
});
await lab({
  subjectId: physics.id,
  number: 1,
  title: "Измерение ускорения свободного падения",
  summary: "Лабораторная в физическом практикуме, отчёт по шаблону.",
  content:
    "## Задание\n\nПровести серию измерений с математическим маятником и оценить погрешность.",
  requirements: "Отчёт в PDF по шаблону кафедры.",
  submission: "Распечатанный отчёт на следующем занятии.",
  variants: "",
  deadlineAt: days(2, 10, 0),
  deadlineNote: "Защита на занятии.",
  maxScore: 5,
  teacher: "",
});
console.log("✓ лабы");

const ev = (e: Record<string, unknown>) =>
  call("POST", "/admin/events", {
    allDay: false,
    location: "",
    description: "",
    url: "",
    ...e,
  });
await ev({
  title: "Контрольная по пределам",
  kind: "test",
  subjectId: math.id,
  startsAt: days(5, 10, 0),
  endsAt: days(5, 11, 30),
  location: "Ауд. 301",
});
await ev({
  title: "Консультация перед контрольной",
  kind: "consultation",
  subjectId: math.id,
  startsAt: days(3, 16, 0),
  endsAt: days(3, 17, 0),
  location: "Ауд. 305",
});
await ev({
  title: "Экзамен по матанализу",
  kind: "exam",
  subjectId: math.id,
  startsAt: days(60, 9, 0),
  allDay: true,
  description: "Допуск: все контрольные сданы.",
});
await ev({
  title: "День открытых дверей",
  kind: "other",
  subjectId: null,
  startsAt: days(15, 12, 0),
  url: "https://example.com/open-day",
});
console.log("✓ события");

const faq = (f: Record<string, unknown>) => call("POST", "/admin/faq", f);
await faq({
  question: "Как сдавать лабораторные?",
  answer:
    "Через **pull request** в свой репозиторий. Ссылку отправьте преподавателю в личку.",
  category: "Сдача",
  position: 1,
});
await faq({
  question: "Что будет, если пропустить дедлайн?",
  answer:
    "Дедлайны мягкие: работу примут, но с штрафом. Подробности — на странице каждой лабы.",
  category: "Сдача",
  position: 2,
});
await faq({
  question: "Как узнать, чётная сейчас неделя или нечётная?",
  answer: "Смотрите чип недели в шапке сайта.",
  category: "Организация",
  position: 3,
});
await faq({
  question: "Где взять методички?",
  answer:
    "Ссылки собраны на страницах предметов и в разделе «Материалы» у лаб.",
  category: "Материалы",
  position: 4,
});
await faq({
  question: "Как подписаться на дедлайны в календаре?",
  answer:
    "На странице календаря нажмите «Добавить в календарь» и вставьте ссылку в Google Calendar или Apple Calendar.",
  category: "Календарь",
  position: 5,
});
console.log("✓ ЧаВо");

type Note = { id: number; slug: string };
const note = (n: Record<string, unknown>) =>
  call<Note>("POST", "/admin/notes", { status: "published", ...n });
const n1 = await note({
  subjectId: prog.id,
  number: 1,
  title: "Введение в язык C",
  summary: "История, компиляция, структура программы, типы данных.",
  lectureDate: days(-14).slice(0, 10),
  content: `## Зачем C

C — язык 1972 года, который до сих пор лежит в основе операционных систем, компиляторов и встраиваемых систем.

## Компиляция

\`\`\`bash
gcc -Wall -Wextra -O2 main.c -o main
./main
\`\`\`

## Структура программы

\`\`\`c
#include <stdio.h>

int main(void) {
    printf("Hello, world!\\n");
    return 0;
}
\`\`\`

<Callout type="tip" title="Запомните">Функция \`main\` возвращает код завершения: 0 — успех, всё остальное — ошибка.</Callout>

## Типы данных

| Тип | Размер (обычно) | Диапазон |
|-----|-----------------|----------|
| \`char\` | 1 байт | −128…127 |
| \`int\` | 4 байта | ±2·10⁹ |
| \`double\` | 8 байт | ~15 значащих цифр |

### Переполнение

При выходе за диапазон знакового типа поведение **не определено**.

<Spoiler title="Почему не определено?">Стандарт оставляет это компилятору, чтобы он мог оптимизировать арифметику.</Spoiler>`,
});
await note({
  subjectId: prog.id,
  number: 2,
  title: "Указатели",
  summary: "Адреса, разыменование, арифметика указателей, массивы.",
  lectureDate: days(-7).slice(0, 10),
  content: `## Что такое указатель

Указатель хранит адрес в памяти. Размер указателя зависит от разрядности системы, а не от типа, на который он указывает.

\`\`\`c
int x = 42;
int *p = &x;   // p хранит адрес x
*p = 7;        // теперь x == 7
\`\`\`

## Арифметика

Прибавление целого к указателю сдвигает его на \`n * sizeof(T)\` байт:

$$
p + n \\equiv \\text{addr}(p) + n \\cdot \\text{sizeof}(T)
$$

<Callout type="warning">Разность допустима только для указателей на элементы одного массива.</Callout>

## Массивы и указатели

Имя массива в выражении превращается в указатель на первый элемент, поэтому \`a[i]\` эквивалентно \`*(a + i)\`.`,
});
const n3 = await note({
  subjectId: math.id,
  number: 1,
  title: "Предел последовательности",
  summary: "Определение по Коши, свойства, примеры.",
  lectureDate: days(-13).slice(0, 10),
  content: `## Определение

Число $a$ называется пределом последовательности $x_n$, если

$$
\\forall \\varepsilon > 0\\ \\exists N:\\ \\forall n > N\\quad |x_n - a| < \\varepsilon.
$$

## Свойства

1. Предел единственный.
2. Сходящаяся последовательность ограничена.
3. Предел суммы равен сумме пределов.

## Пример

$\\lim_{n\\to\\infty} \\frac{1}{n} = 0$, так как для любого $\\varepsilon$ достаточно взять $N > 1/\\varepsilon$.`,
});
const n4 = await note({
  subjectId: web.id,
  number: 1,
  title: "HTML и семантика",
  summary: "Документ, элементы, доступность.",
  lectureDate: days(-6).slice(0, 10),
  content:
    "## Семантика\n\nИспользуйте `<header>`, `<main>`, `<nav>`, `<article>` вместо `div` там, где это уместно.\n\n## Доступность\n\nАтрибут `alt` у картинок обязателен.",
});
console.log("✓ конспекты");

const quiz = (q: Record<string, unknown>) =>
  call("POST", "/admin/quizzes", {
    status: "published",
    shuffleQuestions: true,
    shuffleOptions: true,
    description: "",
    ...q,
  });
await quiz({
  subjectId: prog.id,
  noteId: n1.id,
  title: "Введение в C: проверь себя",
  description: "Пять вопросов по первой лекции.",
  questions: [
    {
      type: "single",
      prompt: "Что возвращает `main` при успешном завершении?",
      options: [
        { text: "0", correct: true },
        { text: "1" },
        { text: "−1" },
        { text: "Ничего" },
      ],
      explanation: "Ноль означает успех, любое другое значение — ошибка.",
    },
    {
      type: "single",
      prompt: "Какой флаг gcc включает основные предупреждения?",
      options: [
        { text: "`-Wall`", correct: true },
        { text: "`-O2`" },
        { text: "`-o`" },
      ],
      explanation: "`-O2` — оптимизация, `-o` — имя выходного файла.",
    },
    {
      type: "multiple",
      prompt: "Какие типы есть в C?",
      options: [
        { text: "`int`", correct: true },
        { text: "`double`", correct: true },
        { text: "`string`" },
        { text: "`char`", correct: true },
      ],
      explanation:
        "Отдельного типа `string` в C нет — строки это массивы `char`.",
    },
    {
      type: "text",
      prompt: "В каком году появился язык C?",
      answers: ["1972", "1972 год"],
      explanation: "Деннис Ритчи, Bell Labs, 1972.",
    },
    {
      type: "single",
      prompt: "Что происходит при переполнении знакового `int`?",
      options: [
        { text: "Поведение не определено", correct: true },
        { text: "Значение обнуляется" },
        { text: "Программа завершается с ошибкой" },
      ],
    },
  ],
});
await quiz({
  subjectId: math.id,
  noteId: n3.id,
  title: "Пределы: базовые понятия",
  description: "Проверка определения и свойств предела.",
  questions: [
    {
      type: "single",
      prompt: "Чему равен $\\lim_{n\\to\\infty} \\frac{1}{n}$?",
      options: [
        { text: "$0$", correct: true },
        { text: "$1$" },
        { text: "$\\infty$" },
      ],
    },
    {
      type: "multiple",
      prompt: "Что верно для сходящейся последовательности?",
      options: [
        { text: "Она ограничена", correct: true },
        { text: "Предел единственный", correct: true },
        { text: "Она монотонна" },
      ],
      explanation: "Монотонность не обязательна: $(-1)^n/n$ сходится к нулю.",
    },
    {
      type: "text",
      prompt: "Как называется определение предела через $\\varepsilon$ и $N$?",
      answers: ["по Коши", "определение по Коши", "Коши"],
    },
  ],
});
await quiz({
  subjectId: web.id,
  noteId: n4.id,
  title: "HTML: быстрый квиз",
  questions: [
    {
      type: "single",
      prompt: "Какой тег для основного содержимого страницы?",
      options: [
        { text: "`<main>`", correct: true },
        { text: "`<body>`" },
        { text: "`<section>`" },
      ],
    },
    {
      type: "single",
      prompt: "Обязателен ли `alt` у `<img>`?",
      options: [{ text: "Да", correct: true }, { text: "Нет" }],
    },
  ],
});
console.log("✓ квизы");

// Practice sessions (lab defence slots).
const practice = (p: Record<string, unknown>) =>
  call<{ id: number }>("POST", "/admin/practice", {
    location: "",
    capacity: null,
    note: "",
    ...p,
  });
const p1 = await practice({
  subjectId: prog.id,
  startsAt: days(3, 13, 0),
  endsAt: days(3, 14, 30),
  location: "412",
  capacity: 6,
  note: "Приносите ноутбук с собранным проектом.",
});
await practice({
  subjectId: prog.id,
  startsAt: days(10, 13, 0),
  endsAt: days(10, 14, 30),
  location: "412",
  capacity: 6,
});
const p3 = await practice({
  subjectId: web.id,
  startsAt: days(6, 9, 0),
  endsAt: days(6, 10, 30),
  location: "411",
  capacity: null,
  note: "Показываем сайт с телефона и ноутбука.",
});
await practice({
  subjectId: physics.id,
  startsAt: days(-2, 10, 45),
  endsAt: days(-2, 12, 15),
  location: "102",
  capacity: 8,
});
console.log("✓ сдачи");

// Demo students via dev login (works only outside production).
const adminCookie = cookie;
const labs = await call<{ id: number; subjectSlug: string; number: number }[]>(
  "GET",
  "/labs",
);
const labId = (subject: string, n: number) =>
  labs.find((l) => l.subjectSlug === subject && l.number === n)?.id;
const students: [string, string[], Record<number, number[]>][] = [
  [
    "Аня Смирнова",
    ["programmirovanie:1", "programmirovanie:2", "veb-tehnologii:1"],
    {
      [p1.id]: [
        labId("programmirovanie", 1) ?? 0,
        labId("programmirovanie", 2) ?? 0,
      ],
    },
  ],
  [
    "Дима Кузнецов",
    ["programmirovanie:1"],
    {
      [p1.id]: [labId("programmirovanie", 1) ?? 0],
      [p3.id]: [labId("veb-tehnologii", 1) ?? 0],
    },
  ],
  ["Лена Орлова", [], {}],
];
for (const [name, done, signups] of students) {
  cookie = "";
  try {
    await call("POST", "/auth/dev-login", { name });
  } catch {
    console.log("  dev-login недоступен, студенты пропущены");
    break;
  }
  for (const key of done) {
    const [subject, n] = key.split(":");
    const id = labId(subject, Number(n));
    if (id) await call("PUT", `/me/labs/${id}/done`);
  }
  for (const [sessionId, ids] of Object.entries(signups)) {
    await call("PUT", `/practice/${sessionId}/signups`, {
      labIds: ids.filter(Boolean),
    });
  }
}
cookie = adminCookie;
console.log("✓ студенты");
console.log("Готово. Откройте сайт и /admin.");
