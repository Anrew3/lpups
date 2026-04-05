/**
 * render.ts
 *
 * Generates 72×72 PNG key images using @napi-rs/canvas.
 * Stream Deck hardware keys require real PNG bitmaps — SVG data URIs
 * are silently ignored by the Stream Deck software for physical keys.
 *
 * @napi-rs/canvas uses N-API (stable ABI) so the same binary works with
 * any Node.js version, including the one bundled inside Stream Deck.
 */

import { createCanvas } from "@napi-rs/canvas";

export interface Line {
  text:   string | number;
  y:      number;
  size?:  number;
  color?: string;
  bold?:  boolean;
}

// ─── Colour palette ──────────────────────────────────────────────────────────
export const C = {
  GREEN:  "#0d6e0d",
  YELLOW: "#7a5a00",
  ORANGE: "#8a3d00",
  RED:    "#7a0d0d",
  BLUE:   "#0d3d7a",
  TEAL:   "#0d5a5a",
  PURPLE: "#4a0d7a",
  GRAY:   "#2a2a2a",
  DKGRAY: "#1a1a1a",
} as const;

/** Build a 72×72 PNG button and return a base64 data URI. */
export async function makeButton(bg: string, lines: Line[]): Promise<string> {
  const S = 72, R = 6;
  const canvas = createCanvas(S, S);
  const ctx    = canvas.getContext("2d");

  // Rounded-rectangle background
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(R, 0);
  ctx.lineTo(S - R, 0); ctx.arcTo(S, 0,  S,  R,   R);
  ctx.lineTo(S, S - R); ctx.arcTo(S, S,  S - R, S, R);
  ctx.lineTo(R, S);     ctx.arcTo(0, S,  0,  S - R, R);
  ctx.lineTo(0, R);     ctx.arcTo(0, 0,  R,  0,   R);
  ctx.closePath();
  ctx.fill();

  // Text lines
  ctx.textAlign    = "center";
  ctx.textBaseline = "alphabetic";
  for (const l of lines) {
    ctx.font      = `${l.bold !== false ? "bold" : "normal"} ${l.size ?? 13}px Arial`;
    ctx.fillStyle = l.color ?? "#ffffff";
    ctx.fillText(String(l.text), 36, l.y);
  }

  const buf = await canvas.encode("png");
  return `data:image/png;base64,${buf.toString("base64")}`;
}

/** Progress bar  ████░░░ */
export function pctBar(pct: number, width = 7): string {
  const n = Math.round(Math.min(100, Math.max(0, pct)) / 100 * width);
  return "\u2588".repeat(n) + "\u2591".repeat(width - n);
}

/** Background colour for a battery percentage. */
export function battColor(pct: number): string {
  if (pct >= 50) return C.GREEN;
  if (pct >= 25) return C.YELLOW;
  if (pct >= 10) return C.ORANGE;
  return C.RED;
}

/** Dim "no serial data" button. */
export async function noDataButton(label: string): Promise<string> {
  return makeButton(C.DKGRAY, [
    { text: label,     y: 28, size: 13 },
    { text: "NO DATA", y: 50, size: 11, color: "#ff8888" },
  ]);
}
