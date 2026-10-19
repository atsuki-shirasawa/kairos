// Turns the repository's Markdown (README, ARCHITECTURE, DESIGN, docs/design) into Starlight
// pages, so those files stay the one source and GitHub keeps rendering them as they are. Which
// file becomes which pages is in ../pages.ts. The output (src/content/docs/{guide,internals},
// src/assets, public/favicon.svg) is generated on every dev and build run and isn't committed.
//
// A link the site can't follow fails the run instead of shipping a 404: a relative link to a
// file that doesn't exist, an anchor no heading has, or an image that is missing.

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import GithubSlugger from "github-slugger";
import { type PageSpec, SIDEBAR, SOURCES, type SourceSpec } from "../pages.ts";
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

/** Screenshots in the dark theme live beside the light ones, under this folder. */
const DARK_DIR = "dark";

/** One generated page: where it goes, its title, and the repository file it came from. */
type Page = { slug: string; title: string; source: string; body: string };

/** Where a source heading's anchor leads on the site: its page, and the page's own anchor. */
type AnchorTarget = { page: Page; hash: string | null };

/** What every page's links resolve against, built once from all the pages. */
type LinkContext = {
  /** The page a bare link to a source file opens: its first page. */
  pagesBySource: Map<string, Page>;
  /** Where each "source#anchor" leads. */
  anchors: Map<string, AnchorTarget>;
};

/** A source heading the site shows, waiting for its page's anchor to be counted. */
type PendingAnchor = { key: string; page: Page; siteText: string | null };

const HEADING = /^(#{1,6})\s+(.*)$/;
const SKIP = /<!-- site:skip -->[\s\S]*?<!-- \/site:skip -->/g;
const IMAGE = /!\[((?:[^\]\\]|\\.)*)\]\(([^)\s]+)\)/g;
// A link's text may hold an image (a linked screenshot or badge), which IMAGE has rewritten first
const LINK = /(?<!!)\[((?:[^[\]\\]|\\.|!\[[^\]]*\]\([^)]*\))*)\]\(([^)\s]+)\)/g;
// "(#59)" in prose is an issue; "#31" elsewhere is usually an example in a quote
const ISSUE = /\(#(\d+)\)/g;

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

/** Calls fn on the parts of a line outside inline code spans. */
function mapOutsideCode(line: string, fn: (text: string) => string): string {
  return line
    .split(/(`+[^`]*`+)/)
    .map((part, i) => (i % 2 === 0 ? fn(part) : part))
    .join("");
}

/** Splits YAML frontmatter off the top of a file (DESIGN.md keeps its tokens there). */
function splitFrontmatter(markdown: string): { yaml: string | null; rest: string } {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  return match
    ? { yaml: match[1] ?? "", rest: markdown.slice(match[0].length) }
    : { yaml: null, rest: markdown };
}

/** Heading text as the anchor Astro gives it: inline code, links and HTML don't reach the id. */
function headingText(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`/g, "")
    .trim();
}

/** ARCHITECTURE numbers its sections for references like "§3.1"; a site page needs no number. */
function stripNumber(text: string): string {
  return text.replace(/^\d+(?:\.\d+)*\.?\s+/, "");
}

/** "Kairos Architecture" → "Architecture": the site name already says Kairos on every page. */
function titleFromH1(text: string): string {
  return text.replace(/^Kairos (\w)/, (_, first: string) => first.toUpperCase());
}

/** A source file as sync reads it: its lines, which are prose, and each heading's GitHub anchor. */
type ParsedSource = {
  spec: SourceSpec;
  yaml: string | null;
  lines: string[];
  kinds: ("fence" | "code" | "prose")[];
  /** Line index → heading level, text and the anchor GitHub gives it in this file. */
  headings: Map<number, { level: number; text: string; anchor: string }>;
};

/** The prose headings of a file in order, with their level and text and the line they are on. */
function proseHeadings(lines: string[]): { index: number; level: number; text: string }[] {
  const kinds = lineKinds(lines);
  return lines.flatMap((line, index) => {
    const match = kinds[index] === "prose" ? line.match(HEADING) : null;
    if (!match?.[1] || match[2] === undefined) return [];
    return [{ index, level: match[1].length, text: match[2].trim() }];
  });
}

/** The source lines that start inside a site:skip span of a prose run starting at line first. */
function skippedIn(run: string[], first: number): number[] {
  const text = run.join("\n");
  const spans = [...text.matchAll(SKIP)].map((m) => [m.index, m.index + m[0].length] as const);
  let offset = 0;
  return run.flatMap((line, k) => {
    const start = offset;
    offset += line.length + 1;
    return spans.some(([from, to]) => start > from && start < to) ? [first + k] : [];
  });
}

/**
 * Removes the text between site:skip markers, only outside fenced code, where the markers can be
 * an example. Runs of prose are joined so a marked span can cross lines. Also returns the source
 * lines that went, so their headings can be told apart from kept ones with the same text.
 */
function stripSkipped(lines: string[]): { kept: string[]; skipped: Set<number> } {
  const kinds = lineKinds(lines);
  const kept: string[] = [];
  const skipped = new Set<number>();
  let run: string[] = [];
  let first = 0;
  const flush = () => {
    if (run.length) {
      kept.push(...run.join("\n").replace(SKIP, "").split("\n"));
      for (const i of skippedIn(run, first)) skipped.add(i);
    }
    run = [];
  };
  lines.forEach((line, i) => {
    if (kinds[i] !== "prose") {
      flush();
      kept.push(line);
      return;
    }
    if (!run.length) first = i;
    run.push(line);
  });
  flush();
  return { kept, skipped };
}

/** Reads a source without its frontmatter and the parts marked site:skip. */
function parseSource(spec: SourceSpec): ParsedSource {
  const { yaml, rest } = splitFrontmatter(readFileSync(join(REPO_DIR, spec.source), "utf8"));
  const raw = rest.split("\n");
  // Anchors are counted on the file as GitHub renders it, skipped parts and H1 included, so a
  // repeated heading's "-1" matches GitHub's
  const slugger = new GithubSlugger();
  const github = proseHeadings(raw).map((h) => ({
    ...h,
    anchor: slugger.slug(headingText(h.text)),
  }));

  const { kept: lines, skipped } = stripSkipped(raw);
  // The kept headings are GitHub's in order, minus the skipped ones
  const survivors = github.filter((h) => !skipped.has(h.index));
  const headings = new Map<number, { level: number; text: string; anchor: string }>();
  proseHeadings(lines).forEach(({ index, level, text }, n) => {
    const twin = survivors[n];
    if (twin?.text !== text) throw new Error(`${spec.source}: lost track of heading "${text}"`);
    headings.set(index, { level, text, anchor: twin.anchor });
  });
  return { spec, yaml, lines, kinds: lineKinds(lines), headings };
}

/** A run of lines cut out of a source: a section from its heading, or the preamble. */
type Cut = { heading: { level: number; text: string } | null; start: number; end: number };

/** The source's H1 line, the preamble after it, and its sections by heading text. */
function cutSource(parsed: ParsedSource): {
  h1: number;
  preamble: Cut;
  sections: Map<string, Cut>;
} {
  const { spec, lines, headings } = parsed;
  const h1 = [...headings].find(([, h]) => h.level === 1)?.[0];
  if (h1 === undefined) throw new Error(`${spec.source}: no H1`);
  // H3s are cut points only when a page asks for one, so the rest stay inside their H2
  const asked = new Set(spec.pages.flatMap((p) => p.sections ?? []));
  const starts = [...headings]
    .filter(([i, h]) => i > h1 && (h.level === 2 || (h.level === 3 && asked.has(h.text))))
    .map(([i]) => i);

  const sections = new Map<string, Cut>();
  starts.forEach((start, n) => {
    const heading = headings.get(start) as { level: number; text: string };
    // pages.ts names sections by text, so two alike would leave one off the site unseen
    if (sections.has(heading.text)) {
      throw new Error(`${spec.source}: two sections are called "${heading.text}"; rename one`);
    }
    sections.set(heading.text, { heading, start, end: starts[n + 1] ?? lines.length });
  });
  const preamble = { heading: null, start: h1 + 1, end: starts[0] ?? lines.length };
  return { h1, preamble, sections };
}

/**
 * Fails when an H2, or the text before the first one, belongs to no page, so nothing is left
 * off the site silently.
 */
function checkCovered(parsed: ParsedSource, sections: Map<string, Cut>, preamble: Cut): void {
  const { spec, lines } = parsed;
  if (spec.pages.some((p) => !p.sections)) return;
  const preambleText = lines.slice(preamble.start, preamble.end).join("").trim();
  if (preambleText && !spec.pages.some((p) => p.preamble)) {
    throw new Error(`${spec.source}: the text before the first section has no page; set preamble`);
  }
  const placed = new Set([...spec.pages.flatMap((p) => p.sections ?? []), ...(spec.drop ?? [])]);
  for (const [text, cut] of sections) {
    if (cut.heading?.level === 2 && !placed.has(text)) {
      throw new Error(`${spec.source}: section "${text}" has no page; add it in site/pages.ts`);
    }
  }
}

/** DESIGN.md's frontmatter holds the design tokens; the page shows them folded at the end. */
function withTokens(body: string, yaml: string | null): string {
  if (!yaml) return body;
  return `${body.trimEnd()}\n\n## Tokens\n\nThe tokens as DESIGN.md's frontmatter lists them.\n\n<details>\n<summary>Show the tokens</summary>\n\n\`\`\`yaml\n${yaml}\n\`\`\`\n\n</details>\n`;
}

/**
 * Builds one page from its cuts. A page of one section takes the section's heading as its title
 * and drops it, so the headings under it move up a level; several sections keep their headings.
 * With the preamble first, the section keeps its heading only when the page has its own title.
 */
function buildPage(
  parsed: ParsedSource,
  spec: PageSpec,
  cuts: Cut[],
  pending: PendingAnchor[],
): Page {
  const { lines, headings } = parsed;
  const named = cuts.filter((c) => c.heading);
  const titled = named.length === 1 && (cuts.length === 1 || !spec.title) ? named[0] : undefined;
  const sole = titled?.heading ?? null;
  const sectionLevels = named.flatMap((c) => (c.heading ? [c.heading.level] : []));
  // The shallowest section heading lands on H2; a sole section's heading becomes the title
  const shift = sole ? sole.level - 1 : Math.min(...sectionLevels, 2) - 2;
  const title = spec.title ?? (sole ? stripNumber(sole.text) : null);
  if (!title) throw new Error(`${parsed.spec.source}: page ${spec.slug} needs a title`);

  const page: Page = { slug: spec.slug, title, source: parsed.spec.source, body: "" };
  const out: string[] = [];
  for (const cut of cuts) {
    for (let i = cut.start; i < cut.end; i++) {
      const heading = headings.get(i);
      if (!heading) {
        out.push(lines[i] ?? "");
        continue;
      }
      const key = `${parsed.spec.source}#${heading.anchor}`;
      if (cut === titled && i === cut.start) {
        pending.push({ key, page, siteText: null });
        continue;
      }
      const siteText = stripNumber(heading.text);
      pending.push({ key, page, siteText });
      out.push(`${"#".repeat(Math.max(2, heading.level - shift))} ${siteText}`);
    }
  }
  page.body = out.join("\n");
  return page;
}

/** A whole file as one page, titled by its H1. */
function wholePage(parsed: ParsedSource, spec: PageSpec, h1: number, pending: PendingAnchor[]) {
  const h1Text = parsed.headings.get(h1)?.text ?? "";
  const cut: Cut = { heading: null, start: h1 + 1, end: parsed.lines.length };
  const page = buildPage(
    parsed,
    { ...spec, title: spec.title ?? titleFromH1(h1Text) },
    [cut],
    pending,
  );
  page.body = withTokens(page.body, parsed.yaml);
  return page;
}

/** The pages one source becomes, recording where each of its headings went. */
function sourcePages(spec: SourceSpec, pending: PendingAnchor[]): Page[] {
  const parsed = parseSource(spec);
  const { h1, preamble, sections } = cutSource(parsed);
  checkCovered(parsed, sections, preamble);

  const pages = spec.pages.map((pageSpec) => {
    if (!pageSpec.sections) return wholePage(parsed, pageSpec, h1, pending);
    const cuts = pageSpec.sections.map((text) => {
      const cut = sections.get(text);
      if (!cut) throw new Error(`${spec.source}: no section "${text}" for ${pageSpec.slug}`);
      return cut;
    });
    return buildPage(parsed, pageSpec, pageSpec.preamble ? [preamble, ...cuts] : cuts, pending);
  });
  // The H1 itself is the file: a link to it opens the first page
  const first = pages[0];
  const h1Anchor = parsed.headings.get(h1)?.anchor;
  if (first && h1Anchor)
    pending.push({ key: `${spec.source}#${h1Anchor}`, page: first, siteText: null });
  return pages;
}

/** Counts each page's own anchors in page order, as Astro will, and maps the source's onto them. */
function resolveAnchors(pending: PendingAnchor[]): Map<string, AnchorTarget> {
  const sluggers = new Map<Page, GithubSlugger>();
  const anchors = new Map<string, AnchorTarget>();
  for (const { key, page, siteText } of pending) {
    if (siteText === null) {
      anchors.set(key, { page, hash: null });
      continue;
    }
    const slugger = sluggers.get(page) ?? new GithubSlugger();
    sluggers.set(page, slugger);
    anchors.set(key, { page, hash: slugger.slug(headingText(siteText)) });
  }
  return anchors;
}

/** A URL with a scheme or a protocol-relative one: nothing in the repository to check. */
function isExternal(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:|^\/\//i.test(target);
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

/** The dark-theme twin of a screenshot, when one was taken. */
function darkTwin(repoPath: string): string | null {
  const twin = posix.join(posix.dirname(repoPath), DARK_DIR, posix.basename(repoPath));
  return existsSync(join(REPO_DIR, twin)) ? twin : null;
}

/**
 * An image alone on its line, with a dark twin, becomes both images in blocks the theme shows
 * one of. Markdown inside an HTML block needs the blank lines around it.
 */
function themedImage(page: Page, alt: string, repoPath: string): string | null {
  const twin = darkTwin(repoPath);
  if (!twin) return null;
  const light = copyImage(page, repoPath);
  const dark = copyImage(page, twin);
  return [
    `<div class="light-only">\n\n![${alt}](${light})\n\n</div>`,
    `<div class="dark-only">\n\n![${alt}](${dark})\n\n</div>`,
  ].join("\n");
}

/** Rewrites a page's links and images for the site, copying each image into src/assets. */
function rewriteLinks(page: Page, context: LinkContext): string {
  const check = (target: string, repoPath: string) => {
    if (!existsSync(join(REPO_DIR, repoPath))) {
      throw new Error(`${page.source}: link to ${target}, but ${repoPath} doesn't exist`);
    }
  };

  const resolveLink = (target: string): string => {
    if (isExternal(target)) return target;
    const [path = "", anchor] = target.split("#", 2);
    const repoPath = repoPathOf(page, path);
    check(target, repoPath);
    const linked = context.pagesBySource.get(repoPath);
    const hash = anchor ? `#${anchor}` : "";
    if (!linked) return `${REPO_URL}/blob/main/${encodeURI(repoPath)}${hash}`;
    if (!anchor) return `${BASE}/${linked.slug}/`;
    const found = context.anchors.get(`${repoPath}#${anchor}`);
    if (!found)
      throw new Error(`${page.source}: link to ${target}, but no heading has that anchor`);
    return `${BASE}/${found.page.slug}/${found.hash ? `#${found.hash}` : ""}`;
  };

  const resolveImage = (target: string): string => {
    if (isExternal(target)) return target;
    const repoPath = repoPathOf(page, target);
    check(target, repoPath);
    return copyImage(page, repoPath);
  };

  return mapProse(page.body, (line) => {
    const alone = line.trim().match(/^!\[((?:[^\]\\]|\\.)*)\]\(([^)\s]+)\)$/);
    if (alone?.[2] && !isExternal(alone[2])) {
      const repoPath = repoPathOf(page, alone[2]);
      check(alone[2], repoPath);
      const themed = themedImage(page, alone[1] ?? "", repoPath);
      if (themed) return themed;
    }
    return mapOutsideCode(line, (text) =>
      text
        .replace(IMAGE, (_, alt: string, target: string) => `![${alt}](${resolveImage(target)})`)
        .replace(LINK, (_, label: string, target: string) => `[${label}](${resolveLink(target)})`)
        .replace(ISSUE, (_, n: string) => `([#${n}](${REPO_URL}/issues/${n}))`),
    );
  });
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

/** Fails when a page is missing from the sidebar or listed twice, or the sidebar names no page. */
function checkSidebar(pages: Page[]): void {
  const listed = SIDEBAR.flatMap((g) =>
    g.items.flatMap((i) => (typeof i === "string" ? [i] : i.slugs)),
  );
  const slugs = new Set(pages.map((p) => p.slug));
  const missing = [...slugs].filter((s) => !listed.includes(s));
  const unknown = listed.filter((s) => !slugs.has(s));
  const twice = listed.filter((s, i) => listed.indexOf(s) !== i);
  if (missing.length || unknown.length || twice.length) {
    throw new Error(
      `site/pages.ts SIDEBAR: missing ${missing.join(", ") || "none"}; unknown ${unknown.join(", ") || "none"}; twice ${twice.join(", ") || "none"}`,
    );
  }
}

/** The app's mark is the site's logo and favicon too. */
function copyLogo(): void {
  const logo = join(REPO_DIR, "src/web/public/favicon.svg");
  mkdirSync(join(SITE_DIR, "public"), { recursive: true });
  copyFileSync(logo, join(SITE_DIR, "public/favicon.svg"));
  copyFileSync(logo, join(ASSETS_DIR, "logo.svg"));
}

/** The landing page's screenshot in both themes, which no source file brings in through a link. */
function copyLandingImages(): void {
  for (const image of ["docs/images/screen-week.png", `docs/images/${DARK_DIR}/screen-week.png`]) {
    mkdirSync(dirname(join(ASSETS_DIR, image)), { recursive: true });
    copyFileSync(join(REPO_DIR, image), join(ASSETS_DIR, image));
  }
}

function main(): void {
  for (const dir of GENERATED) rmSync(dir, { recursive: true, force: true });
  mkdirSync(ASSETS_DIR, { recursive: true });

  const pending: PendingAnchor[] = [];
  const pages = SOURCES.flatMap((spec) => sourcePages(spec, pending));
  checkSidebar(pages);
  const pagesBySource = new Map<string, Page>();
  for (const page of pages)
    if (!pagesBySource.has(page.source)) pagesBySource.set(page.source, page);
  const context: LinkContext = { pagesBySource, anchors: resolveAnchors(pending) };

  for (const page of pages) {
    const file = join(DOCS_DIR, `${page.slug}.md`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, render(page, rewriteLinks(page, context)));
  }
  copyLogo();
  copyLandingImages();
  console.log(`synced ${pages.length} pages from the repository's Markdown`);
}

main();
