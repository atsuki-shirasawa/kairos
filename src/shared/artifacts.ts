// How PRs are referred to in text. Shared by the server's prompts, the CLI and the web app, so a PR
// reads the same everywhere.

/** The PR number in a GitHub PR URL, or undefined when the reference isn't one. */
export function prNumber(ref: string): string | undefined {
  return /\/pull\/(\d+)/.exec(ref)?.[1];
}

/** `#123` for a GitHub PR URL; otherwise the reference itself. */
export function prShortRef(ref: string): string {
  const num = prNumber(ref);
  return num ? `#${num}` : ref;
}

/** A PR as the Markdown link `[#123](url)`, or the bare reference when it has no number. */
export function prMarkdownLink(ref: string): string {
  const num = prNumber(ref);
  return num ? `[#${num}](${ref})` : ref;
}
