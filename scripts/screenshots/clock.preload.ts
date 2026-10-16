// Preloaded into the capture's server (`bun --preload`), so it runs on the capture's stopped clock.
import { FROZEN_NOW_ENV, freezeDate } from "./clock.ts";

const now = Number(process.env[FROZEN_NOW_ENV]);
if (!Number.isFinite(now)) throw new Error(`${FROZEN_NOW_ENV} must be a time in ms`);
freezeDate(now);
