#!/usr/bin/env bun
/**
 * Строит ER-диаграмму базы (Mermaid) прямо из живой схемы Postgres и
 * вставляет её в README между маркерами `<!-- erd:start -->` и `<!-- erd:end -->`.
 *
 * Схема берётся из information_schema, поэтому диаграмма не расходится с
 * миграциями: прогнали новую — перегенерировали картинку.
 *
 *   cd apps/api && go run ./cmd/devapi      # или make infra
 *   bun scripts/erd.ts [--url postgres://…] [--print]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const argValue = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const url = argValue(
  "--url",
  process.env.DATABASE_URL ?? "postgres://edu:edu@localhost:54330/edu",
);

/**
 * Полиморфные связи: `comments` ссылается на конспект, лабу или пост через
 * пару `target_type`/`target_id` без внешнего ключа, поэтому в каталоге их нет
 * и приходится описывать руками (см. CLAUDE.md, раздел «Соцчасть»).
 */
const LOGICAL: { from: string; to: string; label: string }[] = [
  { from: "notes", to: "comments", label: "target_type=note" },
  { from: "labs", to: "comments", label: "target_type=lab" },
  { from: "posts", to: "comments", label: "target_type=post" },
];

type Column = { table: string; name: string; type: string; nullable: boolean };
type Key = { table: string; column: string };
type ForeignKey = Key & { target: string };

const sql = new Bun.SQL(url);

const columns: Column[] = (
  await sql`
    SELECT c.table_name AS table, c.column_name AS name, c.udt_name AS type,
           c.is_nullable = 'YES' AS nullable
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      AND c.table_name <> 'goose_db_version'
    ORDER BY c.table_name, c.ordinal_position`
).map((r: Column) => ({ ...r, nullable: Boolean(r.nullable) }));

const primary: Key[] = await sql`
  SELECT tc.table_name AS table, kcu.column_name AS column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
  WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'`;

const foreign: ForeignKey[] = await sql`
  SELECT tc.table_name AS table, kcu.column_name AS column, ccu.table_name AS target
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
  WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
  ORDER BY tc.table_name, kcu.column_name`;

await sql.end();

const key = (k: { table: string; column: string }) => `${k.table}.${k.column}`;
const pks = new Set(primary.map(key));
const fks = new Set(foreign.map(key));
const tables = [...new Set(columns.map((c) => c.table))].sort();

/** Mermaid не любит скобки и служебные символы в названиях типов. */
const typeName = (udt: string) =>
  udt.startsWith("_") ? `${udt.slice(1)}_array` : udt;

const lines: string[] = ["erDiagram"];
for (const fk of foreign) {
  lines.push(`    ${fk.target} ||--o{ ${fk.table} : "${fk.column}"`);
}
for (const rel of LOGICAL) {
  lines.push(`    ${rel.from} |o..o{ ${rel.to} : "${rel.label}"`);
}
const relationCount = lines.length - 1;
// Таблицы без внешних ключей иначе не появятся на обзорной схеме: в erDiagram
// сущность рисуется, только если она где-то упомянута.
const linked = new Set([
  ...foreign.flatMap((f) => [f.table, f.target]),
  ...LOGICAL.flatMap((r) => [r.from, r.to]),
]);
const standalone = tables.filter((t) => !linked.has(t));
const overviewExtra = standalone.flatMap((table) => {
  const pk = columns.find(
    (c) => c.table === table && pks.has(key({ table, column: c.name })),
  );
  return [
    `    ${table} {`,
    `        ${typeName(pk?.type ?? "int8")} ${pk?.name ?? "id"} PK`,
    "    }",
  ];
});

for (const table of tables) {
  lines.push(`    ${table} {`);
  for (const c of columns.filter((col) => col.table === table)) {
    const marks = pks.has(key({ table, column: c.name }))
      ? "PK"
      : fks.has(key({ table, column: c.name }))
        ? "FK"
        : "";
    const note = c.nullable ? ' "может быть пустым"' : "";
    lines.push(
      `        ${typeName(c.type)} ${c.name}${marks ? ` ${marks}` : ""}${note}`,
    );
  }
  lines.push("    }");
}

// Две диаграммы: обзорная (кто на кого ссылается) и полная с колонками —
// вторая в README прячется под <details>, иначе занимает пол-экрана.
const overview = [
  "```mermaid",
  ...lines.slice(0, 1 + relationCount),
  ...overviewExtra,
  "```",
].join("\n");
const full = ["```mermaid", ...lines, "```"].join("\n");
const diagram = [
  overview,
  "",
  "<details>",
  "<summary>Та же схема с колонками</summary>",
  "",
  full,
  "",
  "</details>",
].join("\n");
if (args.includes("--print")) {
  console.log(diagram);
  process.exit(0);
}

const readmePath = resolve(root, "README.md");
const readme = readFileSync(readmePath, "utf8");
const start = "<!-- erd:start -->";
const end = "<!-- erd:end -->";
if (!readme.includes(start) || !readme.includes(end)) {
  throw new Error(`README.md: нет маркеров ${start} / ${end}`);
}
const before = readme.slice(0, readme.indexOf(start) + start.length);
const after = readme.slice(readme.indexOf(end));
writeFileSync(readmePath, `${before}\n\n${diagram}\n\n${after}`);
console.log(
  `✓ ${tables.length} таблиц, ${foreign.length} внешних ключей → README.md`,
);
