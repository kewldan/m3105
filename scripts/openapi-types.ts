#!/usr/bin/env bun
/**
 * Генерирует типы публичного API из OpenAPI-спеки.
 *
 * Зачем свой генератор: openapi-typescript и hey-api строят типы через
 * компилятор TypeScript, а в проекте стоит TypeScript 7 (переписанный на Go),
 * у которого ещё нет `ts.factory` — оба падают на старте. Спека наша и
 * использует десяток конструкций, поэтому дешевле обойти её самому.
 *
 * Скрипт намеренно строгий: на незнакомой конструкции он падает с указанием
 * места, а не выдаёт молча `unknown`.
 *
 *   bun scripts/openapi-types.ts [--spec <path>] [--out <path>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const argValue = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const specPath = resolve(
  root,
  argValue("--spec", "apps/api/internal/api/openapi.yaml"),
);
const outPath = resolve(
  root,
  argValue("--out", "apps/web/lib/api/schema.d.ts"),
);

type Schema = Record<string, unknown>;

const spec = Bun.YAML.parse(readFileSync(specPath, "utf8")) as {
  components?: { schemas?: Record<string, Schema> };
};
const schemas = spec.components?.schemas;
if (!schemas) throw new Error(`${specPath}: нет components.schemas`);

const fail = (where: string, message: string): never => {
  throw new Error(
    `${where}: ${message}. Добавьте поддержку в scripts/openapi-types.ts`,
  );
};

const literal = (value: unknown): string =>
  typeof value === "string" ? JSON.stringify(value) : String(value);

/** Оборачивает объединение в скобки там, где иначе получится неверный тип. */
const wrap = (type: string) => (type.includes("|") ? `(${type})` : type);

function primitive(type: string, where: string): string {
  switch (type) {
    case "string":
      return "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array":
    case "object":
      return type;
    default:
      return fail(where, `неизвестный type: ${type}`);
  }
}

function renderObject(schema: Schema, where: string, indent: string): string {
  const props = (schema.properties ?? {}) as Record<string, Schema>;
  const required = new Set((schema.required as string[] | undefined) ?? []);
  const extra = schema.additionalProperties;

  const entries = Object.entries(props);
  if (entries.length === 0) {
    if (extra && typeof extra === "object") {
      return `Record<string, ${render(extra as Schema, `${where}.additionalProperties`, indent)}>`;
    }
    return "Record<string, never>";
  }

  const inner = `${indent}  `;
  const lines = entries.map(([name, prop]) => {
    const doc =
      typeof prop.description === "string"
        ? `${inner}/** ${prop.description} */\n`
        : "";
    const optional = required.has(name) ? "" : "?";
    const key = /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
    return `${doc}${inner}${key}${optional}: ${render(prop, `${where}.${name}`, inner)};`;
  });
  return `{\n${lines.join("\n")}\n${indent}}`;
}

function render(schema: Schema, where: string, indent = ""): string {
  if (typeof schema !== "object" || schema === null)
    fail(where, "схема не объект");

  if (typeof schema.$ref === "string") {
    const name = schema.$ref.replace("#/components/schemas/", "");
    if (name.includes("/"))
      fail(where, `ссылка вне components.schemas: ${schema.$ref}`);
    return name;
  }
  if (schema.const !== undefined) return literal(schema.const);
  if (Array.isArray(schema.enum)) return schema.enum.map(literal).join(" | ");
  if (Array.isArray(schema.allOf)) {
    return (schema.allOf as Schema[])
      .map((part, i) => wrap(render(part, `${where}.allOf[${i}]`, indent)))
      .join(" & ");
  }
  for (const key of ["oneOf", "anyOf"] as const) {
    if (Array.isArray(schema[key])) {
      return (schema[key] as Schema[])
        .map((part, i) => render(part, `${where}.${key}[${i}]`, indent))
        .join(" | ");
    }
  }

  const type = schema.type;
  if (Array.isArray(type)) {
    // `type: [integer, "null"]` — как раз так в спеке описана обнуляемость.
    return type.map((t) => primitive(String(t), where)).join(" | ");
  }
  if (type === "array") {
    if (!schema.items) fail(where, "у массива нет items");
    return `${wrap(render(schema.items as Schema, `${where}[]`, indent))}[]`;
  }
  if (type === "object" || schema.properties || schema.additionalProperties) {
    return renderObject(schema, where, indent);
  }
  if (typeof type === "string") return primitive(type, where);
  return fail(where, "не удалось определить тип");
}

const header = `// Сгенерировано из ${argValue("--spec", "apps/api/internal/api/openapi.yaml")}.
// Не редактировать руками: правится спека, потом \`bun run codegen\` (в apps/web).
// Генератор — scripts/openapi-types.ts.
`;

const body = Object.entries(schemas)
  .map(([name, schema]) => {
    const doc =
      typeof schema.description === "string"
        ? `/** ${schema.description} */\n`
        : "";
    return `${doc}export type ${name} = ${render(schema, name)};`;
  })
  .join("\n\n");

writeFileSync(outPath, `${header}\n${body}\n`);
console.log(
  `✓ ${Object.keys(schemas).length} типов → ${outPath.replace(`${root}/`, "")}`,
);
