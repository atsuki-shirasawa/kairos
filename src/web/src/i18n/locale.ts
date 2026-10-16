// The supported UI languages and where the choice is saved, without React, so scripts outside the
// app (the screenshot harness) can use them too.

/** A supported UI language. */
export type Locale = "en" | "ja";

/** Languages offered in the "⋯" menu, in display order. */
export const LOCALES: Locale[] = ["en", "ja"];

/** Where the chosen language is saved in the browser (absent means English). */
export const LOCALE_STORAGE_KEY = "kairos.locale";
