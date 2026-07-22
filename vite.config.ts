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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("recharts") || id.includes("d3-") || id.includes("victory-vendor")) return "charts";
          if (id.includes("framer-motion")) return "motion";
          if (id.includes("@tanstack")) return "tanstack";
          if (id.includes("@tauri-apps")) return "tauri";
          if (id.includes("lucide-react")) return "icons";
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/")
          ) return "react-vendor";
          return undefined;
        },
      },
    },
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
      thresholds: {
        statements: 30,
        branches: 35,
        functions: 20,
        lines: 30,
      },
    },
  },
});
