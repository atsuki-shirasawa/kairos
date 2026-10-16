// Pixel comparison of two PNGs, done in the capture's own Chrome so the visual baseline needs no
// image library: the page decodes both, counts the pixels that differ and draws where they are.
import type { HeadlessChrome } from "./cdp.ts";

/** How two shots differ: pixels that are not identical, out of all, and an image of where. */
export interface ImageDiff {
  differing: number;
  total: number;
  /** The new shot faded, with differing pixels in magenta; null when nothing differs. */
  image: Buffer | null;
}

/**
 * Runs in the page with the two images as base64: decodes both, compares them pixel by pixel (a size
 * change counts every pixel of the larger one) and returns the count and, when any differ, the diff
 * image as base64. Kept as source text: the server's type check has no DOM types.
 */
const DIFF_IN_PAGE = `async (a, b) => {
  const load = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = "data:image/png;base64," + src;
  });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const w = Math.max(ia.width, ib.width);
  const h = Math.max(ia.height, ib.height);
  const pixels = (img) => {
    const ctx = new OffscreenCanvas(w, h).getContext("2d");
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, w, h).data;
  };
  const pa = pixels(ia);
  const pb = pixels(ib);
  const resized = ia.width !== ib.width || ia.height !== ib.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  const out = ctx.createImageData(w, h);
  let differing = 0;
  for (let i = 0; i < pa.length; i += 4) {
    const same = !resized && pa[i] === pb[i] && pa[i + 1] === pb[i + 1] &&
      pa[i + 2] === pb[i + 2] && pa[i + 3] === pb[i + 3];
    if (same) {
      const grey = 255 - (255 - (pb[i] + pb[i + 1] + pb[i + 2]) / 3) * 0.25;
      out.data.set([grey, grey, grey, 255], i);
    } else {
      differing += 1;
      out.data.set([255, 0, 255, 255], i);
    }
  }
  if (differing === 0) return { differing, total: w * h, image: null };
  ctx.putImageData(out, 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const url = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
  return { differing, total: w * h, image: url.slice(url.indexOf(",") + 1) };
}`;

/** Compares a baseline with a new shot in `chrome`'s page, which this leaves on about:blank. */
export async function diffImages(
  chrome: HeadlessChrome,
  baseline: Buffer,
  current: Buffer,
): Promise<ImageDiff> {
  if (baseline.equals(current)) return { differing: 0, total: 0, image: null };
  await chrome.open("about:blank", 0);
  const expression = `(${DIFF_IN_PAGE})(${JSON.stringify(baseline.toString("base64"))}, ${JSON.stringify(current.toString("base64"))})`;
  const { result, exceptionDetails } = await chrome.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) throw new Error(`comparing images: ${JSON.stringify(exceptionDetails)}`);
  const value = (result as { value: { differing: number; total: number; image: string | null } })
    .value;
  return { ...value, image: value.image ? Buffer.from(value.image, "base64") : null };
}
