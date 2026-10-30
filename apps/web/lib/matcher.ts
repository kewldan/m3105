/**
 * Подбор варианта по анкете (MDX-компонент <Matcher>).
 *
 * Каждый ответ сдвигает профиль человека по осям (`vec`), задаёт желаемую
 * сложность (`level`), сообщает, что человек умеет (`has`) и что ему нравится
 * (`likes` — веса тегов). Итог по варианту:
 *
 *   сходство  = косинус между профилем и вектором варианта (отрицательное → 0)
 *   × сложность — гаусс от разницы с желаемой: тяжелее желаемого штрафуется
 *                 сильнее (σ = 0,8), легче — мягче (σ = 1,4)
 *   × навыки   — 0,55, если вариант требует то, чего нет среди `has`
 *   × (1 + сумма весов совпавших тегов, в пределах от −0,3 до +0,4)
 *
 * Процент совпадения — 100 · (1 − e^(−2,2 · итог)): без жёсткого потолка,
 * идеальное попадание даёт около 90 %, бонусы тегов — до 95–97 %.
 */

export type Vec = Record<string, number>;

export type MatcherOption = {
  label: string;
  vec?: Vec;
  level?: number;
  has?: string[];
  likes?: Record<string, number>;
};

export type MatcherQuestion = {
  text: string;
  hint?: string;
  multi?: boolean;
  options: MatcherOption[];
};

export type MatcherItem = {
  id: string;
  title: string;
  href?: string;
  badge?: string;
  tone?: string;
  vec: Vec;
  level?: number;
  needs?: string[];
  tags?: string[];
};

export type MatcherData = {
  dims: Record<string, string>;
  tags?: Record<string, string>;
  skills?: Record<string, string>;
  questions: MatcherQuestion[];
  items: MatcherItem[];
};

export type Profile = {
  vec: Vec;
  level?: number;
  has: Set<string>;
  likes: Record<string, number>;
};

export type Reason = { tone: "good" | "bad"; text: string };

export type Ranked = {
  item: MatcherItem;
  score: number;
  percent: number;
  similarity: number;
  levelFit: number;
  skillFit: number;
  bonus: number;
  reasons: Reason[];
};

export const ANY_SKILL = "any";
const SKILL_PENALTY = 0.55;

/** Collects the profile from the chosen option indexes of every question. */
export function buildProfile(
  questions: MatcherQuestion[],
  answers: number[][],
): Profile {
  const vec: Vec = {};
  const has = new Set<string>();
  const likes: Record<string, number> = {};
  const levels: number[] = [];
  questions.forEach((q, i) => {
    for (const idx of answers[i] ?? []) {
      const o = q.options[idx];
      if (!o) continue;
      for (const [k, v] of Object.entries(o.vec ?? {})) {
        vec[k] = (vec[k] ?? 0) + v;
      }
      for (const s of o.has ?? []) has.add(s);
      for (const [k, v] of Object.entries(o.likes ?? {})) {
        likes[k] = (likes[k] ?? 0) + v;
      }
      if (o.level !== undefined) levels.push(o.level);
    }
  });
  const level = levels.length
    ? levels.reduce((a, b) => a + b, 0) / levels.length
    : undefined;
  return { vec, level, has, likes };
}

function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (const [k, v] of Object.entries(a)) s += v * (b[k] ?? 0);
  return s;
}

function norm(a: Vec): number {
  return Math.sqrt(dot(a, a));
}

function levelFit(item?: number, target?: number): number {
  if (item === undefined || target === undefined) return 1;
  const d = item - target;
  const sigma = d > 0 ? 0.8 : 1.4;
  return Math.exp(-(d * d) / (2 * sigma * sigma));
}

function list(labels: string[]): string {
  if (labels.length < 2) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} и ${labels.at(-1)}`;
}

export function rank(data: MatcherData, profile: Profile): Ranked[] {
  const pn = norm(profile.vec);
  return data.items
    .map((item) => {
      const cn = norm(item.vec);
      const similarity =
        pn && cn ? Math.max(0, dot(profile.vec, item.vec) / (pn * cn)) : 0;
      const lf = levelFit(item.level, profile.level);
      const needs = item.needs ?? [];
      const skillOk =
        needs.length === 0 ||
        profile.has.has(ANY_SKILL) ||
        needs.some((n) => profile.has.has(n));
      const skillFit = skillOk ? 1 : SKILL_PENALTY;
      const matched = (item.tags ?? []).filter((t) => profile.likes[t]);
      const bonus = Math.min(
        0.4,
        Math.max(
          -0.3,
          matched.reduce((s, t) => s + profile.likes[t], 0),
        ),
      );
      const score = similarity * lf * skillFit * (1 + bonus);

      const reasons: Reason[] = [];
      const contrib = Object.keys(data.dims)
        .map((k) => ({ k, v: (profile.vec[k] ?? 0) * (item.vec[k] ?? 0) }))
        .sort((a, b) => b.v - a.v);
      const good = contrib.filter((c) => c.v > 0).slice(0, 3);
      if (good.length) {
        reasons.push({
          tone: "good",
          text: `Совпадает с тем, что тебе интересно: ${list(good.map((c) => data.dims[c.k]))}`,
        });
      }
      const bad = contrib.filter((c) => c.v < 0).slice(-2);
      if (bad.length) {
        reasons.push({
          tone: "bad",
          text: `Но здесь есть то, чего ты не хочешь: ${list(bad.map((c) => data.dims[c.k]))}`,
        });
      }
      if (item.level !== undefined && profile.level !== undefined) {
        const d = item.level - profile.level;
        if (d >= 0.75) {
          reasons.push({
            tone: "bad",
            text: "Сложнее, чем ты хочешь вкладываться",
          });
        } else if (d <= -1.25) {
          reasons.push({
            tone: "bad",
            text: "Проще, чем ты хочешь, — может стать скучно",
          });
        } else if (Math.abs(d) <= 0.5) {
          reasons.push({ tone: "good", text: "Сложность как раз по силам" });
        }
      }
      if (!skillOk) {
        const names = needs.map((n) => data.skills?.[n] ?? n);
        reasons.push({
          tone: "bad",
          text: `Нужен ${list(names)}, а его нет среди твоих языков`,
        });
      }
      for (const t of matched) {
        const label = data.tags?.[t];
        if (!label) continue;
        reasons.push({
          tone: profile.likes[t] > 0 ? "good" : "bad",
          text: label,
        });
      }
      return {
        item,
        score,
        percent: Math.max(
          1,
          Math.min(99, Math.round(100 * (1 - Math.exp(-2.2 * score)))),
        ),
        similarity,
        levelFit: lf,
        skillFit,
        bonus,
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score);
}
