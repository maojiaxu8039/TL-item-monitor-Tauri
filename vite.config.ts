import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  root: "src",
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  base: "./",
  optimizeDeps: {
    include: [
      "@tauri-apps/api",
      "@tauri-apps/api/core",
      "@tauri-apps/api/window",
    ],
  },
  build: {
    outDir: resolve(__dirname, "dist-react"),
    emptyOutDir: true,
    target: "esnext",
    minify: "esbuild",
  },
});
