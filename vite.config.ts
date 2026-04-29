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
          if (id.includes("node_modules")) {
            if (id.includes("@tanstack")) return "vendor-query";
            if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
            if (id.includes("@radix-ui")) return "vendor-ui";
            if (id.includes("@tauri-apps")) return "vendor-tauri";
            if (id.includes("framer-motion")) return "vendor-motion";
            if (id.includes("dnd-kit")) return "vendor-dnd";
            return "vendor-others";
          }
        },
      },
    },
  },
});
