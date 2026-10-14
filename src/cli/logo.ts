// The Kairos mark drawn in the terminal, and the favicon palette it is drawn in. The help overview
// shows the mark; the summarize status bar fills in its dusk.
import { RESET, type Rgb, rgbBg, rgbFg } from "./style.ts";

/** Logo width in pixels; a terminal cell is about twice as tall as wide, so it holds two pixels. */
const LOGO_PX = 12;
/** The logo's gradient (dawn → dusk → night), as in `src/web/public/favicon.svg`. */
const DAWN: Rgb = [0xc4, 0xd0, 0xea];
/** The logo's middle color; the status bar of `kairos summarize` fills in it too. */
export const DUSK: Rgb = [0xef, 0xc9, 0x8a];
const NIGHT: Rgb = [0x3a, 0x4a, 0x7c];
/** Where along the gradient dusk sits. */
const DUSK_AT = 0.55;

/**
 * The Kairos mark at a point of its 32×32 SVG canvas: the color there, or null outside it.
 * It's drawn from the same geometry as the favicon (a circle cut by a diagonal blade, each half
 * nudged apart), so the terminal and the browser show one logo.
 */
function logoPixel(x: number, y: number): Rgb | null {
  const left = x < 19 - (8 * y) / 32 && (x - 15.2) ** 2 + (y - 16) ** 2 <= 14 ** 2;
  const right = x > 21.6 - (8 * y) / 32 && (x - 16.8) ** 2 + (y - 16) ** 2 <= 14 ** 2;
  if (!left && !right) return null;
  // The SVG gradient runs from (0.3, 0) to (0.7, 1) of the circle's bounding box
  const u = (x - 2) / 28;
  const v = (y - 2) / 28;
  const t = Math.min(1, Math.max(0, ((u - 0.3) * 0.4 + v) / 1.16));
  const [from, to, k] =
    t <= DUSK_AT ? [DAWN, DUSK, t / DUSK_AT] : [DUSK, NIGHT, (t - DUSK_AT) / (1 - DUSK_AT)];
  return from.map((c, j) => Math.round(c + ((to[j] ?? c) - c) * k));
}

/** One terminal cell of the logo: its top and bottom pixel as a half block, in color if allowed. */
function logoCell(top: Rgb | null, bottom: Rgb | null, color: boolean): string {
  if (!color) return top && bottom ? "█" : top ? "▀" : bottom ? "▄" : " ";
  if (top && bottom) return `${rgbFg(top)}${rgbBg(bottom)}▀${RESET}`;
  if (top) return `${rgbFg(top)}▀${RESET}`;
  if (bottom) return `${rgbFg(bottom)}▄${RESET}`;
  return " ";
}

/** The logo as terminal lines, sampling each pixel's center on the SVG canvas. */
export function logoLines(color: boolean): string[] {
  const at = (px: number) => ((px + 0.5) * 32) / LOGO_PX;
  return Array.from({ length: LOGO_PX / 2 }, (_, row) =>
    Array.from({ length: LOGO_PX }, (_, col) =>
      logoCell(logoPixel(at(col), at(row * 2)), logoPixel(at(col), at(row * 2 + 1)), color),
    ).join(""),
  );
}
