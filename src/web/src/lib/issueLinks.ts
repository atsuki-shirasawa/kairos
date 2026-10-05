/**
 * A remark plugin that links `#1234` in summaries to the repository's issue / PR.
 * Summaries often mention PRs by number only, and this lets PRs missing from the outcome list
 * (reviewed or reopened ones) be opened too. GitHub redirects `/issues/<n>` to the PR when it is one.
 */

/** The subset of an mdast node this plugin reads and writes. */
export interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

/** Skips matches preceded by an alphanumeric, `&` or `/` (so `&#123;` and URL fragments aren't picked up). */
const REF_RE = /(?<![\w&/])#(\d+)\b/g;

/** The repository URL if it can be linked. GitHub only for now (other hosts use different URL shapes). */
export function issueBaseUrl(repo: string | null | undefined): string | null {
  if (!repo || !/^github\.com\/[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return `https://${repo}`;
}

/** The plugin. `baseUrl` comes from `issueBaseUrl`; pass the plugin only when it isn't null. */
export function remarkIssueLinks({ baseUrl }: { baseUrl: string }) {
  return (tree: MdNode) => {
    walk(tree, baseUrl);
  };
}

function walk(node: MdNode, baseUrl: string) {
  // Text inside links is already linked, so leave it. Code has no text nodes, so it is skipped naturally
  if (!node.children || node.type === "link" || node.type === "linkReference") return;
  node.children = node.children.flatMap((child) => {
    if (child.type !== "text" || child.value === undefined) {
      walk(child, baseUrl);
      return [child];
    }
    return splitText(child.value, baseUrl);
  });
}

function splitText(text: string, baseUrl: string): MdNode[] {
  const out: MdNode[] = [];
  let last = 0;
  for (const m of text.matchAll(REF_RE)) {
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    out.push({
      type: "link",
      url: `${baseUrl}/issues/${m[1]}`,
      children: [{ type: "text", value: m[0] }],
    });
    last = m.index + m[0].length;
  }
  if (last === 0) return [{ type: "text", value: text }];
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}
