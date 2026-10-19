import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import mermaid from "astro-mermaid";
import { SIDEBAR } from "./pages.ts";
import { BASE, REPO_URL, SITE } from "./paths.ts";

/** pages.ts's sidebar in Starlight's shape: a group of pages collapses under its label. */
const sidebar = SIDEBAR.map((group) => ({
  label: group.label,
  items: group.items.map((item) =>
    typeof item === "string" ? item : { label: item.label, collapsed: true, items: item.slugs },
  ),
}));

/** The Starlight site served from GitHub Pages; the pages come from scripts/sync.ts. */
export default defineConfig({
  site: SITE,
  base: BASE,
  integrations: [
    // ARCHITECTURE.md draws its flows in Mermaid; it must come before Starlight to see the blocks
    mermaid({ autoTheme: true }),
    starlight({
      title: "Kairos",
      description:
        "A personal web app for looking back on your Claude Code session history as a calendar of what you did",
      logo: { src: "./src/assets/logo.svg" },
      favicon: "/favicon.svg",
      social: [{ icon: "github", label: "GitHub", href: REPO_URL }],
      customCss: ["./src/styles/custom.css"],
      lastUpdated: false,
      // Code blocks sit on the app's surfaces (custom.css) instead of the theme's own navy
      expressiveCode: {
        styleOverrides: {
          borderRadius: "0.5rem",
          borderColor: "var(--sl-color-hairline)",
          codeBackground: "var(--kairos-code-bg)",
          frames: {
            editorTabBarBackground: "var(--kairos-code-bg)",
            terminalTitlebarBackground: "var(--kairos-code-bg)",
            terminalBackground: "var(--kairos-code-bg)",
          },
        },
      },
      sidebar,
    }),
  ],
});
