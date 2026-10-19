// Which repository Markdown becomes which page, and the order the sidebar lists them. sync.ts
// cuts the pages from the sources by these headings, and astro.config.ts builds the sidebar from
// SIDEBAR, so a page is added in one place.

/** A page cut from one source file. */
export type PageSpec = {
  /** The page's path under src/content/docs, and its URL under BASE. */
  slug: string;
  /** The page title. Defaults to the section's heading for a one-section page, or the H1. */
  title?: string;
  /**
   * The sections the page holds, by their heading text (an H2, or an H3 to cut a page out of
   * its H2). Omitted: the whole file is the page.
   */
  sections?: string[];
  /** Whether the page starts with the text between the H1 and the first section. */
  preamble?: boolean;
};

/** A Markdown file in the repository and the pages it becomes. */
export type SourceSpec = {
  /** Path from the repository root. */
  source: string;
  pages: PageSpec[];
  /** H2 sections the site leaves out. Any other H2 must belong to a page, or sync fails. */
  drop?: string[];
};

/** Every source, in the order a bare link to a split file resolves: its first page. */
export const SOURCES: SourceSpec[] = [
  {
    source: "README.md",
    pages: [
      { slug: "guide/introduction", title: "Introduction", preamble: true, sections: ["Goals"] },
      { slug: "guide/setup", sections: ["Setup"] },
      { slug: "guide/live", sections: ["Running sessions and plan limits"] },
      { slug: "guide/commands", sections: ["Commands"] },
      { slug: "guide/shortcuts", sections: ["Keyboard shortcuts"] },
      { slug: "guide/privacy", sections: ["Privacy and data"] },
      { slug: "guide/troubleshooting", sections: ["Troubleshooting"] },
      { slug: "internals/development", sections: ["Development"] },
    ],
    drop: ["License"],
  },
  {
    source: "ARCHITECTURE.md",
    pages: [
      {
        slug: "internals/architecture/overview",
        title: "Processes and components",
        preamble: true,
        sections: ["1. Overview", "2. Components"],
      },
      { slug: "internals/architecture/ingest", title: "Ingest", sections: ["3. Ingest flow"] },
      {
        slug: "internals/architecture/summaries",
        title: "Summaries",
        sections: ["4. Summary flow"],
      },
      { slug: "internals/architecture/running-sessions", sections: ["4.2 Running sessions"] },
      { slug: "internals/architecture/api", sections: ["5. API"] },
      { slug: "internals/architecture/screen-layout", sections: ["6. Screen layout"] },
      {
        slug: "internals/architecture/code-and-storage",
        title: "Code and storage",
        sections: ["7. Directory layout", "8. Storage locations"],
      },
      {
        slug: "internals/architecture/performance-and-security",
        title: "Performance and security",
        sections: ["9. Performance", "10. Security"],
      },
    ],
  },
  { source: "DESIGN.md", pages: [{ slug: "internals/design", title: "Design system" }] },
  {
    source: "docs/design/screens.md",
    pages: [
      { slug: "internals/screens/today", preamble: true, sections: ["Today (home)"] },
      { slug: "internals/screens/calendar", sections: ["Calendar (month and week)"] },
      { slug: "internals/screens/day", sections: ["Day page (Journal, day)"] },
      { slug: "internals/screens/toolbar", sections: ["Toolbar, search and filters"] },
      { slug: "internals/screens/thread", sections: ["Thread page"] },
      { slug: "internals/screens/drawer", sections: ["Drawer"] },
      { slug: "internals/screens/insights", sections: ["Insights (summary view)"] },
      { slug: "internals/screens/running-sessions", sections: ["Running sessions"] },
    ],
  },
  {
    source: "docs/design/decisions.md",
    pages: [{ slug: "internals/decisions", title: "Design decisions" }],
  },
];

/** A sidebar entry: a page, or a collapsible group of pages. */
export type SidebarItem = string | { label: string; slugs: string[] };

/** The sidebar, top to bottom. Every page in SOURCES appears here once; sync checks it. */
export const SIDEBAR: { label: string; items: SidebarItem[] }[] = [
  {
    label: "Guide",
    items: [
      "guide/introduction",
      "guide/setup",
      "guide/live",
      "guide/commands",
      "guide/shortcuts",
      "guide/privacy",
      "guide/troubleshooting",
    ],
  },
  {
    label: "Internals",
    items: [
      "internals/development",
      { label: "Architecture", slugs: pagesOf("ARCHITECTURE.md") },
      "internals/design",
      { label: "Screens", slugs: pagesOf("docs/design/screens.md") },
      "internals/decisions",
    ],
  },
];

/** The slugs a source becomes, in order, for a sidebar group that lists them all. */
function pagesOf(source: string): string[] {
  return SOURCES.find((s) => s.source === source)?.pages.map((p) => p.slug) ?? [];
}
