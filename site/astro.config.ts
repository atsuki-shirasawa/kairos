import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import mermaid from "astro-mermaid";
import { BASE, REPO_URL, SITE } from "./paths.ts";

/** The Starlight site served from GitHub Pages; the sidebar lists the pages scripts/sync.ts writes. */
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
      sidebar: [
        {
          label: "Guide",
          items: [
            "guide/introduction",
            "guide/setup",
            "guide/usage",
            "guide/data",
            "guide/troubleshooting",
            "guide/development",
          ],
        },
        {
          label: "Internals",
          items: [
            "internals/architecture",
            "internals/design",
            "internals/screens",
            "internals/decisions",
          ],
        },
      ],
    }),
  ],
});
