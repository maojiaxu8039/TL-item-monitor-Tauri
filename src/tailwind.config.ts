import type { Config } from "tailwindcss";

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "app-bg": "#F7F8FB",
        "surface": "#FFFFFF",
        "surface-muted": "#F5F5F5",
        "sidebar": "#2F3B52",
        "sidebar-hover": "#394862",
        "text-strong": "#1F2A3C",
        "text": "#374151",
        "text-muted": "#6B7280",
        "border": "#E5E7EB",
        "primary": "#3B82F6",
        "fire": "#FF9F0D",
        "success": "#10B981",
        "danger": "#EF4444",
        "warning": "#F59E0B",
      },
      borderRadius: {
        "card": "8px",
      },
      boxShadow: {
        "card": "0 10px 30px rgba(31, 42, 60, 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
