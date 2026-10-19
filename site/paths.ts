// Where the site is served. GitHub Pages serves a project site under the repository's name, so
// every absolute link the sync script writes starts with BASE. The landing page links
// relatively, so it follows BASE without repeating it.

/** The GitHub repository the docs are built from; source links and edit links point into it. */
export const REPO_URL = "https://github.com/atsuki-shirasawa/kairos";

/** The origin GitHub Pages serves the site from. */
export const SITE = "https://atsuki-shirasawa.github.io";

/** The path the site lives under on SITE. */
export const BASE = "/kairos";
