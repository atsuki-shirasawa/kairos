// How a commit or PR is referred to in the UI: the parts of a PR link, a short ref for one line,
// and which kind of node a summary's outcome earns. Shared by the drawer and the calendar.
import type { Artifact } from "@shared/api.ts";
import { prNumber } from "@shared/artifacts.ts";

/** The parts of a PR shown in its link: the number from the URL, and the repository when no title was captured. */
export function prLinkParts(a: Artifact): { num: string | undefined; repo: string | undefined } {
  return {
    num: prNumber(a.ref),
    // PRs whose title could not be captured (e.g. created with `--fill`) are stored as "#number repository"
    repo: /^#\d+\s+(.+)$/.exec(a.title ?? "")?.[1],
  };
}

/**
 * How a commit or PR is referred to in a short line: "#123" for a PR, the short SHA for a commit,
 * or null when neither is known.
 */
export function artifactRef(a: Artifact): string | null {
  if (a.kind === "pr") {
    const { num } = prLinkParts(a);
    return num ? `#${num}` : null;
  }
  return shortSha(a);
}

/** The short SHA of a commit, or null for commits known only by their subject. */
export function shortSha(a: Artifact): string | null {
  return a.ref.startsWith("subject:") ? null : a.ref.slice(0, 7);
}

/**
 * The node to set beside a summary's Outcome: a PR when it names one of the section's PRs by
 * number, a commit when it names one of its commits by SHA, otherwise none. Only outcomes the
 * section really has count, so a "#12" meaning an issue doesn't grow a node.
 */
export function outcomeNode(outcome: string, here: Artifact[]): "pr" | "commit" | null {
  const numbers = new Set(outcome.match(/#\d+/g) ?? []);
  if (here.some((a) => a.kind === "pr" && numbers.has(artifactRef(a) ?? ""))) return "pr";
  const hexes = outcome.match(/\b[0-9a-f]{7,40}\b/g) ?? [];
  // Either may be the longer one: the ref is often git's short SHA, the summary may quote a full one
  const named = (a: Artifact) =>
    shortSha(a) !== null && hexes.some((h) => a.ref.startsWith(h) || h.startsWith(a.ref));
  return here.some((a) => a.kind === "commit" && named(a)) ? "commit" : null;
}
