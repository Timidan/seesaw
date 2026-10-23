import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Debug logging stays in dev; production bundles drop it.
  esbuild: command === "build" ? { pure: ["console.log", "console.debug"] } : undefined,
  build: {
    rollupOptions: {
      input: { main: path.resolve(__dirname, "index.html"), story: path.resolve(__dirname, "story.html") },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
