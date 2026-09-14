import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

import type { SubjectColor } from "@/lib/api/types";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

/** Shared Open Graph image renderer (1200×630) used by the /og/* route. */

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

/** A second hue for the gradient so subjects differ by more than one blob. */
const PARTNER: Record<SubjectColor, string> = {
  blue: "#8b5cf6",
  indigo: "#06b6d4",
  violet: "#f43f5e",
  cyan: "#10b981",
  teal: "#3b82f6",
  emerald: "#14b8a6",
  amber: "#f97316",
  orange: "#f43f5e",
  rose: "#f59e0b",
  slate: "#6366f1",
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

/** Drops Markdown/MDX syntax so summaries read as plain text on the card. */
function plain(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|`+|~~)/g, "")
    .replace(/(^|\s)[*_](?=\S)|(?<=\S)[*_](?=\s|$)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "");
}

function clamp(text: string, max: number): string {
  const flat = plain(text).replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Mixes a hex colour towards black; `amount` 0..1 is how much of the colour survives. */
function dim(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((n >> shift) & 255) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

export type OgKind = "site" | "subject" | "lab" | "note" | "page";

export type OgProps = {
  kind: OgKind;
  /** Small label next to the logo, e.g. "Конспект · Дискретка". */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Short facts rendered as pills under the title: deadline, points, lecture date. */
  chips?: string[];
  color?: SubjectColor;
  /** Big decorative figure for labs (the lab number) or notes (the lecture number). */
  figure?: string | number;
};

const KIND_LABEL: Record<OgKind, string> = {
  site: "сайт группы",
  subject: "предмет",
  lab: "лабораторная",
  note: "конспект",
  page: "страница",
};

/** Kind-specific decoration in the right part of the canvas. */
function Decor({
  kind,
  accent,
  partner,
  figure,
}: {
  kind: OgKind;
  accent: string;
  partner: string;
  figure?: string | number;
}) {
  switch (kind) {
    case "lab":
      return (
        <>
          <div
            style={{
              position: "absolute",
              right: 64,
              top: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 420,
              height: 560,
              fontFamily: "Manrope",
              fontWeight: 700,
              fontSize: 460,
              lineHeight: 1,
              color: accent,
              opacity: 0.16,
            }}
          >
            {String(figure ?? "")}
          </div>
          <div
            style={{
              position: "absolute",
              top: -140,
              right: 260,
              width: 420,
              height: 420,
              borderRadius: 9999,
              background: partner,
              opacity: 0.16,
              filter: "blur(110px)",
            }}
          />
        </>
      );
    case "note":
      return (
        <>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                right: 72,
                top: 128 + i * 44,
                width: [300, 360, 220, 340, 260, 180][i],
                height: 18,
                borderRadius: 9999,
                background: i === 1 ? accent : "#e2e8f0",
                opacity: i === 1 ? 0.55 : 0.1,
              }}
            />
          ))}
          <div
            style={{
              position: "absolute",
              left: -180,
              bottom: -260,
              width: 560,
              height: 560,
              borderRadius: 9999,
              background: partner,
              opacity: 0.18,
              filter: "blur(120px)",
            }}
          />
        </>
      );
    case "subject":
      return (
        <>
          <div
            style={{
              position: "absolute",
              right: -120,
              bottom: -160,
              width: 520,
              height: 520,
              borderRadius: 9999,
              border: `36px solid ${accent}`,
              opacity: 0.35,
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 60,
              bottom: 20,
              width: 220,
              height: 220,
              borderRadius: 9999,
              border: `20px solid ${partner}`,
              opacity: 0.28,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: -220,
              right: -100,
              width: 560,
              height: 560,
              borderRadius: 9999,
              background: accent,
              opacity: 0.22,
              filter: "blur(120px)",
            }}
          />
        </>
      );
    case "page":
      return (
        <>
          <div
            style={{
              position: "absolute",
              right: -260,
              top: -80,
              width: 420,
              height: 900,
              background: accent,
              opacity: 0.12,
              transform: "rotate(24deg)",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: -60,
              top: -80,
              width: 120,
              height: 900,
              background: partner,
              opacity: 0.14,
              transform: "rotate(24deg)",
            }}
          />
        </>
      );
    default:
      return (
        <>
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
              bottom: -300,
              left: 200,
              width: 520,
              height: 520,
              borderRadius: 9999,
              background: partner,
              opacity: 0.16,
              filter: "blur(120px)",
            }}
          />
        </>
      );
  }
}

export async function ogImage({
  kind,
  eyebrow,
  title,
  description,
  chips = [],
  color = "blue",
  figure,
}: OgProps): Promise<ImageResponse> {
  const fonts = await loadFonts();
  const accent = ACCENT[color] ?? ACCENT.blue;
  const partner = PARTNER[color] ?? PARTNER.blue;
  const heading = clamp(title, 90);
  const titleSize = heading.length > 60 ? 54 : heading.length > 36 ? 64 : 76;
  const host = SITE_URL.replace(/^https?:\/\//, "");
  const pills = chips.filter(Boolean).slice(0, 4);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: `linear-gradient(135deg, #0b0f19 0%, ${dim(accent, 0.22)} 55%, #0b0f19 100%)`,
        color: "#f8fafc",
        fontFamily: "Inter",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Decor kind={kind} accent={accent} partner={partner} figure={figure} />
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
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div
          style={{
            display: "flex",
            fontFamily: "Manrope",
            fontWeight: 700,
            fontSize: titleSize,
            lineHeight: 1.08,
            letterSpacing: -1.5,
            maxWidth: kind === "lab" || kind === "note" ? 820 : 1000,
          }}
        >
          {heading}
        </div>
        {description ? (
          <div
            style={{
              display: "flex",
              fontSize: 28,
              lineHeight: 1.35,
              color: "#94a3b8",
              maxWidth: kind === "lab" || kind === "note" ? 780 : 980,
            }}
          >
            {clamp(description, pills.length ? 110 : 150)}
          </div>
        ) : null}
        {pills.length ? (
          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            {pills.map((chip) => (
              <div
                key={chip}
                style={{
                  display: "flex",
                  padding: "8px 16px",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  color: "#e2e8f0",
                  fontSize: 22,
                }}
              >
                {clamp(chip, 32)}
              </div>
            ))}
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
          <div style={{ display: "flex" }}>{KIND_LABEL[kind]}</div>
        </div>
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts,
      headers: {
        "Cache-Control": "public, max-age=600, s-maxage=3600",
      },
    },
  );
}
