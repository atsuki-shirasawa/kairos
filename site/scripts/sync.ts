// Turns the repository's Markdown (README, ARCHITECTURE, DESIGN, docs/design) into Starlight
// pages, so those files stay the one source and GitHub keeps rendering them as they are. The
// output (src/content/docs/{guide,internals}, src/assets, public/favicon.svg) is generated on
// every dev and build run and isn't committed.
//
// A link the site can't follow fails the run instead of shipping a 404: a relative link to a
// file that doesn't exist, an anchor no heading has, or an image that is missing.

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import GithubSlugger from "github-slugger";
import { BASE, REPO_URL } from "../paths.ts";

const SITE_DIR = join(import.meta.dir, "..");
const REPO_DIR = join(SITE_DIR, "..");
const DOCS_DIR = join(SITE_DIR, "src/content/docs");
const ASSETS_DIR = join(SITE_DIR, "src/assets");
const GENERATED = [
  join(DOCS_DIR, "guide"),
  join(DOCS_DIR, "internals"),
  ASSETS_DIR,
  join(SITE_DIR, "public"),
];

/** One generated page: where it goes, its title, and the repository file it came from. */
type Page = { slug: string; title: string; source: string; body: string };

/** What every page's links resolve against, built once from all the pages. */
type LinkContext = {
  /** The page a bare link to a source file opens: README's first page, the others' only one. */
  pagesBySource: Map<string, Page>;
  /** The page holding each "source#anchor". */
  anchors: Map<string, Page>;
};

const README = "README.md";
const INTRODUCTION = "guide/introduction";

/**
 * README's sections, each a page of the guide, in README's order. The text before the first
 * section joins Goals on the introduction; null drops a section (the license is on GitHub).
 */
const README_SECTIONS: Record<string, string | null> = {
  Goals: INTRODUCTION,
  Setup: "guide/setup",
  Usage: "guide/usage",
  "Where data lives": "guide/data",
  Troubleshooting: "guide/troubleshooting",
  Development: "guide/development",
  License: null,
};

/** Titles for README pages; the rest take their section heading. */
const README_TITLES: Record<string, string> = { [INTRODUCTION]: "Introduction" };

/** Files that become one page each, title from their H1. */
const WHOLE_FILES: Record<string, string> = {
  "ARCHITECTURE.md": "internals/architecture",
  "DESIGN.md": "internals/design",
  "docs/design/screens.md": "internals/screens",
  "docs/design/decisions.md": "internals/decisions",
};

const HEADING = /^#{1,6}\s/;
const IMAGE = /!\[((?:[^\]\\]|\\.)*)\]\(([^)\s]+)\)/g;
// A link's text may hold an image (a linked screenshot or badge), which IMAGE has rewritten first
const LINK = /(?<!!)\[((?:[^[\]\\]|\\.|!\[[^\]]*\]\([^)]*\))*)\]\(([^)\s]+)\)/g;

/**
 * Classifies each line as a fence, code inside one, or prose. A fence closes only on the same
 * character at least as long as it opened with, so a ```` block can show ``` lines.
 */
function lineKinds(lines: string[]): ("fence" | "code" | "prose")[] {
  let open: string | null = null;
  return lines.map((line) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (!open) {
      if (!marker?.[1]) return "prose";
      open = marker[1];
      return "fence";
    }
    const closes =
      marker?.[1] &&
      marker[1][0] === open[0] &&
      marker[1].length >= open.length &&
      !marker[2]?.trim();
    if (!closes) return "code";
    open = null;
    return "fence";
  });
}

/** Calls fn on every line outside fenced code blocks, keeping fenced lines untouched. */
function mapProse(markdown: string, fn: (line: string) => string): string {
  const lines = markdown.split("\n");
  const kinds = lineKinds(lines);
  return lines.map((line, i) => (kinds[i] === "prose" ? fn(line) : line)).join("\n");
}

/** Lines outside fenced code blocks, with their index. */
function proseLines(markdown: string): { line: string; index: number }[] {
  const lines = markdown.split("\n");
  const kinds = lineKinds(lines);
  return lines.flatMap((line, index) => (kinds[index] === "prose" ? [{ line, index }] : []));
}

/** Splits YAML frontmatter off the top of a file (DESIGN.md keeps its tokens there). */
function splitFrontmatter(markdown: string): { yaml: string | null; rest: string } {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  return match
    ? { yaml: match[1] ?? "", rest: markdown.slice(match[0].length) }
    : { yaml: null, rest: markdown };
}

/** A source file's text without its frontmatter, as both the pages and the anchors read it. */
function readSource(source: string): string {
  return splitFrontmatter(readFileSync(join(REPO_DIR, source), "utf8")).rest;
}

/** Takes the H1 off the top of a file as the page title. */
function takeTitle(markdown: string, source: string): { title: string; body: string } {
  const match = markdown.match(/^\s*# (.+)\n/);
  if (!match?.[1]) throw new Error(`${source}: no H1 to take the page title from`);
  // "Kairos Architecture" → "Architecture": the site name already says Kairos on every page.
  const title = match[1].trim().replace(/^Kairos (\w)/, (_, first: string) => first.toUpperCase());
  return { title, body: markdown.slice(match[0].length) };
}

/** README's H2 sections become pages, so their H3s become the pages' H2s. */
function promoteHeadings(markdown: string): string {
  return mapProse(markdown, (line) => (line.startsWith("###") ? line.slice(1) : line));
}

/** The page README's "## heading" section goes to; throws for a section with no entry. */
function readmeSectionSlug(heading: string): string | null {
  if (!(heading in README_SECTIONS)) {
    throw new Error(`${README}: section "${heading}" has no page; add it to README_SECTIONS`);
  }
  return README_SECTIONS[heading] ?? null;
}

/** README as guide pages, one per section in README_SECTIONS. */
function readmePages(): Page[] {
  const lines = readSource(README).split("\n");
  const starts = proseLines(lines.join("\n")).filter(({ line }) => line.startsWith("## "));
  // Skip the H1: its <img> logo is the site's own logo.
  const preamble = lines.slice(1, starts[0]?.index ?? lines.length).join("\n");

  return starts.flatMap(({ line, index }, i) => {
    const heading = line.slice(3).trim();
    const slug = readmeSectionSlug(heading);
    if (!slug) return [];
    const end = starts[i + 1]?.index ?? lines.length;
    if (slug === INTRODUCTION) {
      // The introduction keeps "Goals" as a heading under the preamble
      const body = `${preamble}\n${lines.slice(index, end).join("\n")}`;
      return [{ slug, title: README_TITLES[slug] ?? heading, source: README, body }];
    }
    const body = promoteHeadings(lines.slice(index + 1, end).join("\n"));
    return [{ slug, title: README_TITLES[slug] ?? heading, source: README, body }];
  });
}

/** DESIGN.md's frontmatter holds the design tokens; the page shows them at the end. */
function withTokens(body: string, yaml: string | null): string {
  if (!yaml) return body;
  return `${body.trimEnd()}\n\n## Tokens\n\nThe tokens as DESIGN.md's frontmatter lists them.\n\n\`\`\`yaml\n${yaml}\n\`\`\`\n`;
}

/** The files in WHOLE_FILES, one page each. */
function wholeFilePages(): Page[] {
  return Object.entries(WHOLE_FILES).map(([source, slug]) => {
    const { yaml, rest } = splitFrontmatter(readFileSync(join(REPO_DIR, source), "utf8"));
    const { title, body } = takeTitle(rest, source);
    return { slug, title, source, body: withTokens(body, yaml) };
  });
}

/** Heading text as the anchor Astro gives it: inline code, links and HTML don't reach the id. */
function headingText(line: string): string {
  return line
    .replace(/^#+\s+/, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`/g, "")
    .trim();
}

/**
 * Each heading of a source file, in order, with the page that shows it (null when no page
 * does). Anchors are counted over the whole file as GitHub counts them, so a repeated heading's
 * "-1" suffix matches GitHub even when its sections land on different pages.
 */
function sourceHeadings(source: string): { line: string; slug: string | null }[] {
  const whole = WHOLE_FILES[source];
  let current: string | null = whole ?? INTRODUCTION;
  return proseLines(readSource(source))
    .filter(({ line }) => HEADING.test(line))
    .map(({ line }) => {
      if (!whole && line.startsWith("## ")) current = readmeSectionSlug(line.slice(3).trim());
      return { line, slug: current };
    });
}

/** Every "source#anchor" with the page holding it, so a link into README finds its section. */
function anchorIndex(pages: Page[]): Map<string, Page> {
  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const index = new Map<string, Page>();
  for (const source of [README, ...Object.keys(WHOLE_FILES)]) {
    const slugger = new GithubSlugger();
    for (const { line, slug } of sourceHeadings(source)) {
      const anchor = slugger.slug(headingText(line));
      const page = slug ? bySlug.get(slug) : undefined;
      if (page) index.set(`${source}#${anchor}`, page);
    }
  }
  return index;
}

/** The link context for every page: README's first page answers a bare link to README. */
function linkContext(pages: Page[]): LinkContext {
  const pagesBySource = new Map<string, Page>();
  for (const page of pages)
    if (!pagesBySource.has(page.source)) pagesBySource.set(page.source, page);
  return { pagesBySource, anchors: anchorIndex(pages) };
}

/** A relative link's target as a repository path: "/" is the repository root, %20 a space. */
function repoPathOf(page: Page, path: string): string {
  if (!path) return page.source;
  const decoded = decodeURIComponent(path);
  return decoded.startsWith("/")
    ? posix.normalize(decoded.slice(1))
    : posix.normalize(posix.join(posix.dirname(page.source), decoded));
}

/** Copies an image into src/assets under its repository path and returns the page's link to it. */
function copyImage(page: Page, repoPath: string): string {
  const asset = join(ASSETS_DIR, repoPath);
  mkdirSync(dirname(asset), { recursive: true });
  copyFileSync(join(REPO_DIR, repoPath), asset);
  return relative(dirname(join(DOCS_DIR, `${page.slug}.md`)), asset);
}

/** Rewrites a page's links and images for the site, copying each image into src/assets. */
function rewriteLinks(page: Page, context: LinkContext): string {
  const resolve = (image: boolean, target: string): string => {
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(target)) return target;
    const [path = "", anchor] = target.split("#", 2);
    const repoPath = repoPathOf(page, path);
    const hash = anchor ? `#${anchor}` : "";

    if (!existsSync(join(REPO_DIR, repoPath))) {
      throw new Error(`${page.source}: link to ${target}, but ${repoPath} doesn't exist`);
    }
    if (image) return copyImage(page, repoPath);
    const linked = context.pagesBySource.get(repoPath);
    if (!linked) return `${REPO_URL}/blob/main/${encodeURI(repoPath)}${hash}`;
    if (!anchor) return `${BASE}/${linked.slug}/`;
    const holder = context.anchors.get(`${repoPath}#${anchor}`);
    if (!holder)
      throw new Error(`${page.source}: link to ${target}, but no heading has that anchor`);
    return `${BASE}/${holder.slug}/${hash}`;
  };

  return mapProse(page.body, (line) =>
    line
      .replace(IMAGE, (_, alt: string, target: string) => `![${alt}](${resolve(true, target)})`)
      .replace(LINK, (_, text: string, target: string) => `[${text}](${resolve(false, target)})`),
  );
}

/** The page as a Starlight content file, its edit link pointing at the repository source. */
function render(page: Page, body: string): string {
  const frontmatter = [
    "---",
    `title: ${JSON.stringify(page.title)}`,
    `editUrl: ${JSON.stringify(`${REPO_URL}/edit/main/${page.source}`)}`,
    "---",
  ].join("\n");
  return `${frontmatter}\n\n<!-- Generated from ${page.source} by site/scripts/sync.ts; edit that file instead. -->\n\n${body.trim()}\n`;
}

/** The app's mark is the site's logo and favicon too. */
function copyLogo(): void {
  const logo = join(REPO_DIR, "src/web/public/favicon.svg");
  mkdirSync(join(SITE_DIR, "public"), { recursive: true });
  copyFileSync(logo, join(SITE_DIR, "public/favicon.svg"));
  copyFileSync(logo, join(ASSETS_DIR, "logo.svg"));
}

/** The landing page's screenshot, which no source file brings in through a link. */
function copyLandingImage(): void {
  const image = "docs/images/screen-week.png";
  mkdirSync(dirname(join(ASSETS_DIR, image)), { recursive: true });
  copyFileSync(join(REPO_DIR, image), join(ASSETS_DIR, image));
}

function main(): void {
  for (const dir of GENERATED) rmSync(dir, { recursive: true, force: true });
  mkdirSync(ASSETS_DIR, { recursive: true });

  const pages = [...readmePages(), ...wholeFilePages()];
  const context = linkContext(pages);
  for (const page of pages) {
    const file = join(DOCS_DIR, `${page.slug}.md`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, render(page, rewriteLinks(page, context)));
  }
  copyLogo();
  copyLandingImage();
  console.log(`synced ${pages.length} pages from the repository's Markdown`);
}

main();
