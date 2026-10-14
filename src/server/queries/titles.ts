// What a session or a section is called: the title rules shared by the calendar, the drawer,
// search and the live page.

/** The columns a session's title is made from. */
export interface TitleSource {
  custom_title: string | null;
  agent_name: string | null;
  ai_title: string | null;
  first_prompt: string | null;
}

/**
 * Title: `/rename` name > agent name > Claude Code's automatic title > first line of the first
 * prompt, or null when there is none of these.
 */
export function knownTitle(r: TitleSource): string | null {
  const first = r.first_prompt?.trim().split("\n")[0]?.slice(0, 120);
  return r.custom_title || r.agent_name || r.ai_title || first || null;
}

/** The title, or a placeholder where something must be shown. */
export function title(r: TitleSource): string {
  return knownTitle(r) ?? "(Untitled session)";
}

/** A section's headline: its summary's, else the block's own title, else the session's. */
export function sectionHeadline(
  g: { headline: string | null; fallback_title: string | null },
  sessionTitle: string,
): string {
  return g.headline ?? g.fallback_title ?? sessionTitle;
}

/** A section's summary body, or null when it has none yet. */
export function summaryBody(g: { body: string | null }): string | null {
  // A headline-only section has an empty body; treat it as not summarized yet
  return g.body || null;
}

/**
 * The branch as the calendar shows it: a detached checkout records "HEAD", which names no branch.
 */
export function displayBranch(branch: string | null): string | null {
  return branch === "HEAD" ? null : branch;
}
