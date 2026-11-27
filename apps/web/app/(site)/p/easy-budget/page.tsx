import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  HistoryChart,
  Legend,
  LegendLine,
} from "@/components/site/easy-budget/charts";
import { Panel } from "@/components/site/easy-budget/panel";
import {
  ChanceSection,
  Headline,
  Heatmap,
  HeroFigures,
  LabSection,
  Ladder,
  Tornado,
} from "@/components/site/easy-budget/sections";
import { BudgetProvider } from "@/components/site/easy-budget/state";
import {
  Directions,
  Dumbbells,
  KcpStack,
  OlympBars,
  Rule,
  Tex,
} from "@/components/site/easy-budget/static";
import { breadcrumbs, JsonLd } from "@/components/site/json-ld";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PARAM_ROWS, SCENARIO_KEYS, SCENARIOS } from "@/lib/easy-budget/model";
import { absoluteUrl, pageMetadata } from "@/lib/seo";

const PATH = "/p/easy-budget";
const TITLE = "Перевод на бюджет 09.03.02 в 2027: шансы по среднему баллу";

export const metadata: Metadata = pageMetadata({
  title: TITLE,
  description:
    "Модель перевода с контракта на бюджет ИСиТ (09.03.02) в ИТМО летом 2027: вакансии 2021–2026, правила приказа № 822 и Монте-Карло. Двигайте свой средний — шанс пересчитается.",
  path: PATH,
});

const NAV: [string, string][] = [
  ["model", "Шансы"],
  ["history", "История мест"],
  ["math", "Формулы"],
  ["lab", "Лаборатория"],
  ["sens", "Чувствительность"],
  ["ladder", "Сколько четвёрок можно"],
  ["rules", "Правила"],
  ["plan", "Календарь"],
  ["src", "Источники"],
];

function Section({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`scroll-mt-32 space-y-5 ${className ?? ""}`}>
      {children}
    </section>
  );
}

function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xl font-semibold text-balance sm:text-2xl">
      {children}
    </h2>
  );
}

const CALENDAR: [string, string, boolean?][] = [
  [
    "Январь 2027",
    "Зимняя сессия. Скорее всего, входит в ранжирование «за два семестра». Ни одной тройки и пересдачи.",
  ],
  [
    "19–29 января",
    "Зимняя волна в my.itmo. Для 1-го курса вакансий исторически 0 — не ваш шанс.",
  ],
  [
    "Июнь 2027",
    "Летняя сессия. Для допуска нужна «крайняя сессия» только на 4–5 и ноль долгов, в том числе по зачётам.",
  ],
  [
    "~29 июня – 3 июля",
    "Первое летнее окно (даты 2026 года), всего пять дней. Подайте заявление и сканы достижений.",
    true,
  ],
  [
    "~1 июля",
    "Файл «Информация о наличии вакантных мест на 01.07.2027» на student.itmo.ru и edu.itmo.ru. Проверьте сноски-исключения по программам.",
  ],
  [
    "~3–21 августа",
    "Вторая волна. Неодобренные заявки участвуют в ней автоматически.",
  ],
  [
    "Зима и лето 2028",
    "Запасные попытки: 3–6 мест зимой на 2-м курсе, 1–7 летом на 3-й.",
  ],
];

const SOURCES: [string, string][][] = [
  [
    ["Вакантные места на 03.07.2023", "https://student.itmo.ru/files/3489"],
    ["29.01.2024", "https://student.itmo.ru/files/4002"],
    ["04.07.2024", "https://student.itmo.ru/files/4204"],
    ["15.08.2024", "https://student.itmo.ru/files/4344"],
  ],
  [
    ["27.06.2025", "https://student.itmo.ru/files/4875"],
    ["18.08.2025", "https://edu.itmo.ru/files/884"],
    ["20.01.2026", "https://student.itmo.ru/files/5321"],
    ["01.07.2026", "https://edu.itmo.ru/files/911"],
    ["18.08.2026", "https://itmo.ru/sveden/vacant"],
    ["01.06.2021", "https://edu.itmo.ru/files/650"],
  ],
  [
    ["Положение ИТМО 2022", "https://edu.itmo.ru/files/422"],
    ["Переводы, восстановления", "https://edu.itmo.ru/ru/transfersofstudents/"],
    ["С платного на бесплатное", "https://student.itmo.ru/ru/transfer_budget/"],
  ],
  [
    [
      "Приказ Минобрнауки № 822",
      "https://normativ.kontur.ru/document?moduleId=1&documentId=456428",
    ],
  ],
  [
    [
      "Программа «Разработка ПО»",
      "https://abit.itmo.ru/program/bachelor/software_engineering",
    ],
    [
      "ITMO.NEWS об итогах приёма 2026",
      "https://news.itmo.ru/ru/trend/education/news/14973/",
    ],
  ],
  [
    [
      "«Радио Свобода»: 152 олимпиадника на 132 места",
      "https://www.svoboda.org/a/kak-otlichniki-po-ege-okazalisj-za-bortom-rossiyskih-vuzov/33834674.html",
    ],
    ["postupashkin.ru", "https://www.postupashkin.ru/catalog/itmo"],
  ],
];

function SourceLinks({ links }: { links: [string, string][] }) {
  return (
    <li>
      {links.map(([label, href], i) => (
        <span key={href}>
          {i ? ", " : ""}
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            {label}
          </a>
        </span>
      ))}
    </li>
  );
}

const ROLE = "text-muted-foreground";

export default function EasyBudgetPage() {
  return (
    <BudgetProvider>
      <article className="space-y-12 [--eb-you:oklch(0.63_0.2_42)] sm:space-y-16 dark:[--eb-you:oklch(0.74_0.17_50)]">
        <JsonLd
          data={breadcrumbs([
            { name: "Полезное", url: absoluteUrl("/p") },
            { name: TITLE, url: absoluteUrl(PATH) },
          ])}
        />

        <header className="animate-rise space-y-5">
          <div className="space-y-3">
            <Link
              href="/p"
              className="text-sm font-medium text-primary hover:text-foreground"
            >
              Полезное
            </Link>
            <h1 className="max-w-4xl text-3xl font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl">
              <Headline />
            </h1>
            <p className="max-w-3xl text-base text-pretty text-muted-foreground sm:text-lg">
              Модель перевода с контракта на бюджет в ИТМО для первокурсника
              ИСиТ: правила приказа № 822 и Положения ИТМО, вакансии 2021–2026
              из официальных файлов и Монте-Карло на 4 000 прогонов на каждый
              сценарий. Двигайте свой средний балл, и всё на странице
              пересчитается.
            </p>
          </div>
          <HeroFigures />
        </header>

        <nav
          aria-label="Разделы"
          className="no-scrollbar sticky top-14 z-30 -mx-4 flex gap-1 overflow-x-auto border-b bg-background/80 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/65 sm:-mx-6 sm:px-6 md:top-16 lg:-mx-8 lg:px-8"
        >
          {NAV.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="shrink-0 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>

        <Section id="model">
          <ChanceSection
            gradeFormula={
              <>
                Средний считается по 5-балльной шкале как{" "}
                <Tex>{"\\bar g = 5 - n_4/n"}</Tex>, где <Tex>{"n_4"}</Tex> —
                число четвёрок. Если ИТМО ранжирует по баллам БаРС, внутри одной
                оценки решают и баллы.
              </>
            }
          />
        </Section>

        <Section id="history">
          <div className="space-y-2">
            <H2>
              Летом на 2-й курс 09.03.02 открывается 18–20 мест четыре года
              подряд, зимой — 3–6
            </H2>
            <p className={`max-w-3xl ${ROLE}`}>
              Каждая точка — опубликованный файл «Информация о наличии вакантных
              мест». Июльский файл — места перед первой волной, августовский —
              что осталось после неё. В 2022 году файлов найти не удалось.
            </p>
          </div>
          <Panel className="space-y-3">
            <Legend>
              <LegendLine color="var(--primary)">
                июнь–июль, первая волна
              </LegendLine>
              <LegendLine color="var(--muted-foreground)">
                август, остаток
              </LegendLine>
              <LegendLine color="var(--eb-you)">
                январь, зимняя волна
              </LegendLine>
            </Legend>
            <HistoryChart />
          </Panel>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="space-y-5">
              <Panel className="space-y-3">
                <h3 className="text-base font-semibold">
                  Июль → август: сколько мест заняли
                </h3>
                <p className={`text-sm ${ROLE}`}>
                  Разница — минимальное число переведённых в первой волне. В
                  2024 и 2026 почти все места разобрали, в 2025 восемь остались
                  свободными: допущенных не хватило.
                </p>
                <Dumbbells />
                <Legend>
                  <LegendLine color="var(--primary)">июль</LegendLine>
                  <LegendLine color="var(--muted-foreground)">
                    август
                  </LegendLine>
                </Legend>
              </Panel>
              <Panel className="space-y-3">
                <h3 className="text-base font-semibold">
                  Откуда 175 бюджетных мест 2026 года
                </h3>
                <KcpStack />
                <p className={`text-sm ${ROLE}`}>
                  132 общих места, на которые подали 152 заявления олимпиадники.
                  По всему ИТМО без экзаменов зачислили 875 из 1 635 бюджетников
                  бакалавриата — 54%.
                </p>
                <OlympBars />
              </Panel>
            </div>
            <Panel className="space-y-3">
              <h3 className="text-base font-semibold">
                Соседние направления, 2-й курс, июль
              </h3>
              <p className={`text-sm ${ROLE}`}>
                У 09.03.02 самое большое и стабильное окно среди ИТ-направлений.
                Штриховка — нет данных.
              </p>
              <Directions />
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-base font-semibold">
                Неявная доля отсева бюджетников за 1-й курс
              </h3>
              <Tex display>
                {
                  "\\hat d = \\frac{k_{\\text{июль}}}{\\text{КЦП}} = \\frac{18}{175} \\approx 10{,}3\\%"
                }
              </Tex>
            </div>
            <div className="space-y-3">
              <p>
                Это нижняя оценка отсева федеральных бюджетников набора 2025
                года. Олимпиадники, которых ИТМО учит за свой счёт сверх КЦП, в
                эту разность не входят: их отчисление вакансию не создаёт.
                Официальной статистики отчислений по направлению или факультету
                найти не удалось; все остальные цифры отсева в модели выведены
                из вакансий.
              </p>
              <p className={`text-sm ${ROLE}`}>
                Устойчивость 18–20 мест (разброс ±1) заметно меньше, чем дал бы
                чисто случайный отсев:{" "}
                <Tex>{"\\sqrt{175\\cdot0{,}11\\cdot0{,}89}\\approx4{,}1"}</Tex>{" "}
                места. Похоже, отсев первого курса — структурный (сессии,
                «архитектура ЭВМ»), а не случайный.
              </p>
            </div>
          </div>
        </Section>

        <Section id="math">
          <div className="space-y-2">
            <H2>Как устроена модель</H2>
            <p className={`max-w-3xl ${ROLE}`}>
              Три случайные величины: сколько мест <Tex>k</Tex>, сколько
              допущенных конкурентов <Tex>N</Tex> и какие у них средние. Ваш
              шанс — доля прогонов, где вы входите в первые <Tex>k</Tex>.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-x-8 gap-y-8 lg:grid-cols-2">
            <div className="space-y-8">
              <Rule title="1. Вакантные места">
                <p>
                  По приказу № 822 вакансии — разница между контрольными цифрами
                  приёма и фактическим числом бюджетников на курсе:
                </p>
                <Tex display>{"k = \\text{КЦП} - B_{\\text{факт}}"}</Tex>
                <p>
                  В модели это отсев доли <Tex>d</Tex> из <Tex>{"B=175"}</Tex>,
                  минус места, ушедшие не платникам (целевики, СВО, переводы),
                  плюс добавка к августовской волне:
                </p>
                <Tex display>
                  {
                    "\\begin{gathered}k = \\operatorname{round}(B\\,d) - L + A\\\\ d\\sim\\mathcal N(\\mu_d,\\sigma_d)\\\\ L\\sim\\operatorname{Pois}(\\lambda_L),\\quad A\\sim\\operatorname{Pois}(\\lambda_A)\\end{gathered}"
                  }
                </Tex>
              </Rule>
              <Rule title="2. Допущенные конкуренты">
                <p>
                  Из контрактной когорты <Tex>M</Tex> до конкурса доходит доля{" "}
                  <Tex>{"p_e"}</Tex>: все экзамены на 4–5, без долгов, подали
                  заявление.
                </p>
                <Tex display>
                  {
                    "\\begin{gathered}N\\sim\\operatorname{Bin}(M,p_e),\\quad M\\sim\\mathcal U\\{M_c\\pm25\\}\\\\ p_e\\sim\\operatorname{Beta}\\big(\\kappa\\mu_e,\\,\\kappa(1-\\mu_e)\\big),\\quad \\kappa=40\\end{gathered}"
                  }
                </Tex>
                <p className={`text-sm ${ROLE}`}>
                  Калибровка: 2024 — допущенных ≤ 20 (взяли всех с 4,0); 2025 —
                  около 11 (8 мест из 19 остались); 2026 — не меньше 17.
                </p>
              </Rule>
            </div>
            <div className="space-y-8">
              <Rule title="3. Средние баллы">
                <p>
                  У каждого конкурента своя «вероятность пятёрки»{" "}
                  <Tex>{"\\theta_i"}</Tex>; число пятёрок из <Tex>n</Tex> оценок
                  биномиально. Получается бета-биномиальное распределение
                  среднего:
                </p>
                <Tex display>
                  {
                    "\\theta_i\\sim\\operatorname{Beta}(a,b),\\quad F_i\\sim\\operatorname{Bin}(n,\\theta_i),\\quad G_i = 4+\\frac{F_i}{n}"
                  }
                </Tex>
                <Tex display>
                  {
                    "\\Pr\\!\\Big(G=4+\\tfrac jn\\Big)=\\binom nj\\frac{\\mathrm B(j+a,\\;n-j+b)}{\\mathrm B(a,b)}"
                  }
                </Tex>
              </Rule>
              <Rule title="4. Ранг и вероятность">
                <p>
                  Пусть <Tex>X</Tex> — сколько конкурентов строго выше вас,{" "}
                  <Tex>T</Tex> — сколько с таким же средним. Ничьи решают
                  «особые достижения», в модели это жребий:
                </p>
                <Tex display>
                  {"X=\\#\\{i:G_i>g\\},\\quad T=\\#\\{i:G_i=g\\}"}
                </Tex>
                <Tex display>
                  {
                    "\\begin{aligned}\\Pr(\\text{перевод}\\mid g)&=\\mathbb E_{k,N}\\!\\left[\\operatorname{clip}_{[0,1]}\\frac{k-X}{T+1}\\right]\\\\&\\approx\\frac1S\\sum_{s=1}^{S}\\operatorname{clip}_{[0,1]}\\frac{k_s-X_s}{T_s+1}\\end{aligned}"
                  }
                </Tex>
              </Rule>
            </div>
            <Rule title="5. Проходной балл">
              <p>
                Проходной — средний <Tex>k</Tex>-го в рейтинге, то есть{" "}
                <Tex>k</Tex>-я порядковая статистика сверху. Если допущенных не
                больше мест, проходят все:
              </p>
              <Tex display>
                {
                  "g^*=\\begin{cases}4{,}0, & N\\le k\\\\ G_{(N-k+1:N)}\\approx Q_G\\!\\left(1-\\dfrac kN\\right), & N>k\\end{cases}"
                }
              </Tex>
              <p>
                Отсюда чувствительность к числу мест:{" "}
                <Tex>
                  {
                    "\\dfrac{\\partial g^*}{\\partial k}\\approx-\\dfrac{1}{N\\,f_G(g^*)}"
                  }
                </Tex>
                . Чем плотнее конкуренты вокруг порога, тем меньше одно место
                сдвигает планку.
              </p>
            </Rule>
            <Rule title="6. Сценарии">
              <p>
                Итоговая кривая — смесь трёх сценариев с весами из исследования:
              </p>
              <Tex display>
                {
                  "P_{\\text{mix}}(g)=0{,}25\\,P_{\\text{опт}}(g)+0{,}5\\,P_{\\text{баз}}(g)+0{,}25\\,P_{\\text{пес}}(g)"
                }
              </Tex>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Параметр</TableHead>
                    <TableHead className="text-right">Опт.</TableHead>
                    <TableHead className="text-right">База</TableHead>
                    <TableHead className="text-right">Песс.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PARAM_ROWS.map(([name, key, format]) => (
                    <TableRow key={key}>
                      <TableCell>{name}</TableCell>
                      {SCENARIO_KEYS.map((s) => (
                        <TableCell key={s} className="text-right tabular-nums">
                          {format(SCENARIOS[s][key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Rule>
          </div>
        </Section>

        <Section id="lab">
          <div className="space-y-2">
            <H2>Лаборатория: соберите свой сценарий</H2>
            <p className={`max-w-3xl ${ROLE}`}>
              По умолчанию здесь базовый сценарий. Меняйте допущения, и графики
              ниже пересчитаются на 3 000 прогонах. Оранжевая кривая — ваши
              параметры, синяя — смесь сценариев.
            </p>
          </div>
          <LabSection
            tex={{
              k: <Tex>k</Tex>,
              N: <Tex>N</Tex>,
              gStar: <Tex>{"g^*"}</Tex>,
              pmf: <Tex>{"\\Pr(G=g)"}</Tex>,
            }}
          />
        </Section>

        <Section id="sens">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
            <Tornado />
            <div className="space-y-4">
              <H2>Проходной средний по числу мест и конкурентов</H2>
              <p className={ROLE}>
                Оценка <Tex>{"g^*\\approx Q_G(1-k/N)"}</Tex> при базовом
                распределении средних. Рамкой отмечен вероятный диапазон 2027
                года.
              </p>
              <Heatmap />
              <p className={`text-sm ${ROLE}`}>
                По горизонтали — места <Tex>k</Tex>, по вертикали — допущенные{" "}
                <Tex>N</Tex>.
              </p>
            </div>
          </div>
        </Section>

        <Section id="ladder">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
            <Ladder />
            <div id="plan" className="scroll-mt-32 space-y-4">
              <H2>Календарь до перевода</H2>
              <dl className="grid grid-cols-1 gap-x-5 sm:grid-cols-[9.5em_minmax(0,1fr)] sm:gap-y-3.5">
                {CALENDAR.map(([when, what, key]) => (
                  <div key={when} className="contents">
                    <dt
                      className="font-heading font-semibold whitespace-nowrap"
                      style={key ? { color: "var(--eb-you)" } : undefined}
                    >
                      {when}
                    </dt>
                    <dd className="mb-3 text-muted-foreground sm:mb-0">
                      {what}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Section>

        <Section id="rules">
          <H2>Правила и тонкости</H2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <Panel className="space-y-2">
              <h3 className="text-base font-semibold">Кто допускается</h3>
              <p className={`text-sm ${ROLE}`}>
                Нет академической задолженности, дисциплинарных взысканий и
                долга по оплате. Промежуточная аттестация последнего периода —
                на «отлично», «отлично и хорошо» или «хорошо». Без этого —
                только льготные категории: сироты, лица до 20 лет с единственным
                родителем-инвалидом I группы, родившие в период обучения, дети
                участников СВО, утратившие родителей во время учёбы.
              </p>
            </Panel>
            <Panel className="space-y-2">
              <h3 className="text-base font-semibold">Как ранжируют</h3>
              <p className={`text-sm ${ROLE}`}>
                Конкурс общий по направлению, курсу и форме — без деления на
                потоки и программы, так что 4,5 с соседнего потока выше 4,4 с
                ТОП ИТ ПРО. Первая очередь — «хорошисты-отличники», затем
                льготники. При равенстве — результаты аттестации двух семестров,
                затем особые достижения. Переходы с контракта на бюджет
                рассматриваются раньше восстановлений и переводов из других
                вузов.
              </p>
            </Panel>
            <Panel className="space-y-2">
              <h3 className="text-base font-semibold">Подводные камни</h3>
              <p className={`text-sm ${ROLE}`}>
                Отчисление олимпиадника, которого ИТМО учит за свой счёт, не
                создаёт федеральной вакансии. Место отчисленного целевика
                сначала предлагают обладателям целевого договора. В файле
                вакансий бывают сноски «на ОП … мест нет». Зачёты (у ИСиТ 2 в
                семестр, на ТОП-потоках 3) в средний, скорее всего, не входят,
                но несданный зачёт — это долг. Положение ИТМО от 12.05.2026
                прочитать не удалось: правила взяты из редакции 2022 года и
                приказа № 822.
              </p>
            </Panel>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Документ</TableHead>
                <TableHead>Что важно</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&_td]:align-top [&_td]:whitespace-normal">
              <TableRow>
                <TableCell className="min-w-56">
                  Приказ Минобрнауки № 822 от 28.08.2023 (действует с 01.09.2024
                  до 01.03.2030)
                </TableCell>
                <TableCell className="min-w-56">
                  Заменил приказ № 443. Формула вакансий, «крайняя сессия»,
                  льготные категории, переход за счёт средств вуза, приоритет
                  целевиков.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  Положение ИТМО ЛНАОБУЧ-СМК-03-34-2022 от 27.06.2022
                </TableCell>
                <TableCell>
                  п. 4.16 — расчёт мест минимум дважды в год; п. 5.3.1 — переход
                  с платного в первую очередь; п. 5.3.1.1 — очереди и тай-брейк
                  по двум семестрам.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  Положение ИТМО от 12.05.2026 (edu.itmo.ru/files/912)
                </TableCell>
                <TableCell>Действующая редакция, текст не проверен.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  Приказы № 955-уч от 22.06.2026 и № 989-од от 30.06.2026
                </TableCell>
                <TableCell>
                  Состав комиссии и график переводов на 2026/27.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <details className="group rounded-xl border bg-card px-4 sm:px-5">
            <summary className="flex min-h-12 cursor-pointer items-center font-semibold">
              Что спросить у transfer@itmo.ru до зимней сессии
            </summary>
            <p className={`pb-4 ${ROLE}`}>
              Ранжируют по одному семестру или по двум? По 5-балльному среднему
              или по баллам БаРС? Входят ли дифзачёты? Сколько было претендентов
              на 2-й курс 09.03.02 летом 2026 и каков минимальный средний
              переведённых? Участвуют ли в конкурсе студенты, которых ИТМО учит
              за свой счёт?
            </p>
          </details>
        </Section>

        <Section id="src">
          <H2>Источники</H2>
          <ul className="grid list-disc grid-cols-1 gap-x-8 gap-y-1.5 pl-5 text-sm md:grid-cols-2">
            {SOURCES.map((links) => (
              <SourceLinks key={links[0][1]} links={links} />
            ))}
          </ul>
          <p className={`text-sm ${ROLE}`}>
            Вероятности — модельная оценка, а не статистика: число допущенных и
            распределение их средних никто не публикует. Модель: Монте-Карло с
            фиксированным зерном, бета-биномиальные средние, параметры в таблице
            сценариев.
          </p>
        </Section>
      </article>
    </BudgetProvider>
  );
}
