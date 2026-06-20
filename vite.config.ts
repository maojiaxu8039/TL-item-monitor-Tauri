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
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [resolve(__dirname, "src/test/setup.ts")],
    include: [resolve(__dirname, "src/test/**/*.{test,spec}.{ts,tsx}")],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [resolve(__dirname, "src/lib/**"), resolve(__dirname, "src/utils/**"), resolve(__dirname, "src/components/ui/**")],
      exclude: ["node_modules", "dist"],
    },
  },
});
