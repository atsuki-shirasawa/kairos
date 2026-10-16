import { createCn } from "cn/config";
import { TEXT_SIZES } from "./typeScale.ts";

/**
 * Joins class names and resolves Tailwind conflicts (the later wins), knowing the type scale's
 * own size names.
 */
export const cn = createCn({
  extend: { classGroups: { "font-size": [{ text: [...TEXT_SIZES] }] } },
});
