// How the end-to-end tests name Kairos's own controls, so each test reads as what a person sees.
import { expect } from "bun:test";
import { calendarMessages } from "../../src/web/src/i18n/messages/calendar.ts";
import { drawerMessages } from "../../src/web/src/i18n/messages/drawer.ts";
import type { Control, NameMatch, Page } from "./page.ts";

/**
 * How a block's name starts: its heading, as the app's own label puts it (the project, day and
 * times follow).
 */
function blockPrefix(heading: string): string {
  const cut = "\u0000";
  return calendarMessages().blockAria(heading, cut, cut, cut).split(cut)[0] ?? heading;
}

/** A calendar block by its heading. */
export const block =
  (heading: string): NameMatch =>
  (name) =>
    name.startsWith(blockPrefix(heading));

/**
 * Matches the name of the block with `heading`, for `expect(…).toEqual`. Typed as the string it
 * stands in for, so it fits in a list of names.
 */
export function blockNamed(heading: string): string {
  const prefix = blockPrefix(heading).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return expect.stringMatching(new RegExp(`^${prefix}`)) as unknown as string;
}

/** The blocks on screen: the toggle buttons in the main area, one per block. */
export async function blocks(page: Page): Promise<Control[]> {
  return (await page.all("button", undefined, "main")).filter((b) => b.pressed !== undefined);
}

/** The names of the blocks shown as selected (pressed). */
export async function selectedBlocks(page: Page): Promise<string[]> {
  return (await blocks(page)).filter((b) => b.pressed).map((b) => b.name);
}

/** Whether the session drawer is open. */
export async function drawerOpen(page: Page): Promise<boolean> {
  return (await page.all("complementary", drawerMessages().ariaDetail)).length > 0;
}
