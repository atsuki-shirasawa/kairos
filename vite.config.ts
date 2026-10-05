import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { HOST, PORT } from "./src/shared/constants.ts";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r("./src/web"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": r("./src/web/src"),
      "@shared": r("./src/shared"),
    },
  },
  server: {
    host: HOST,
    proxy: { "/api": `http://${HOST}:${PORT}` },
  },
  build: {
    outDir: r("./dist/web"),
    emptyOutDir: true,
    // Served only locally, so a single bundle is fine (about 200KB gzipped)
    chunkSizeWarningLimit: 800,
  },
});
