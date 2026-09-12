import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

import type { SubjectColor } from "@/lib/api/types";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

/** Shared Open Graph image renderer (1200×630) used by every opengraph-image route. */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const ACCENT: Record<SubjectColor, string> = {
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  cyan: "#06b6d4",
  teal: "#14b8a6",
  emerald: "#10b981",
  amber: "#f59e0b",
  orange: "#f97316",
  rose: "#f43f5e",
  slate: "#64748b",
};

type Fonts = { name: string; data: ArrayBuffer; weight: 400 | 700 }[];
let fontsPromise: Promise<Fonts> | null = null;

/** Fonts live in public/og so they ship with the standalone build and are readable at runtime. */
async function readFont(file: string): Promise<ArrayBuffer> {
  const buf = await readFile(path.join(process.cwd(), "public", "og", file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function loadFonts(): Promise<Fonts> {
  fontsPromise ??= Promise.all([
    readFont("Inter-400.ttf"),
    readFont("Inter-700.ttf"),
    readFont("Manrope-700.ttf"),
  ]).then(([inter400, inter700, manrope700]) => [
    { name: "Inter", data: inter400, weight: 400 },
    { name: "Inter", data: inter700, weight: 700 },
    { name: "Manrope", data: manrope700, weight: 700 },
  ]);
  return fontsPromise;
}

function clamp(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export type OgProps = {
  /** Small label above the title, e.g. "Конспект · Дискретная математика". */
  eyebrow?: string;
  title: string;
  description?: string;
  color?: SubjectColor;
};

export async function ogImage({
  eyebrow,
  title,
  description,
  color = "blue",
}: OgProps): Promise<ImageResponse> {
  const fonts = await loadFonts();
  const accent = ACCENT[color] ?? ACCENT.blue;
  const heading = clamp(title, 90);
  const titleSize = heading.length > 60 ? 56 : heading.length > 36 ? 66 : 78;
  const host = SITE_URL.replace(/^https?:\/\//, "");

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background:
          "linear-gradient(135deg, #0b0f19 0%, #111827 60%, #0b0f19 100%)",
        color: "#f8fafc",
        fontFamily: "Inter",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -220,
          right: -160,
          width: 640,
          height: 640,
          borderRadius: 9999,
          background: accent,
          opacity: 0.28,
          filter: "blur(120px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 14,
          background: accent,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "#2563eb",
            color: "#fff",
            fontFamily: "Manrope",
            fontWeight: 700,
            fontSize: 30,
          }}
        >
          М
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: -0.5,
          }}
        >
          {SITE_NAME}
        </div>
        {eyebrow ? (
          <div
            style={{
              display: "flex",
              marginLeft: 14,
              padding: "8px 18px",
              borderRadius: 9999,
              border: `2px solid ${accent}`,
              color: "#e2e8f0",
              fontSize: 24,
            }}
          >
            {clamp(eyebrow, 60)}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            display: "flex",
            fontFamily: "Manrope",
            fontWeight: 700,
            fontSize: titleSize,
            lineHeight: 1.08,
            letterSpacing: -1.5,
            maxWidth: 1000,
          }}
        >
          {heading}
        </div>
        {description ? (
          <div
            style={{
              display: "flex",
              fontSize: 30,
              lineHeight: 1.35,
              color: "#94a3b8",
              maxWidth: 980,
            }}
          >
            {clamp(description, 150)}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 24,
          color: "#64748b",
        }}
      >
        <div style={{ display: "flex" }}>{host}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 9999,
              background: accent,
              marginTop: 8,
            }}
          />
          <div style={{ display: "flex" }}>сайт группы</div>
        </div>
      </div>
    </div>,
    { ...OG_SIZE, fonts },
  );
}
