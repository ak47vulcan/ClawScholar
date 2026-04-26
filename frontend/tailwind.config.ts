import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        "surface-1": "var(--surface-1)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        primary: "var(--primary)",
        "primary-glow": "var(--primary-glow)",
        secondary: "var(--secondary)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        muted: "var(--muted)",
        text: "var(--text)",
        "text-dim": "var(--text-dim)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "12px",
        badge: "6px",
      },
      backdropBlur: {
        card: "12px",
        modal: "24px",
      },
      animation: {
        "pulse-green": "pulse-green 2s ease-in-out infinite",
        "pulse-amber": "pulse-amber 2s ease-in-out infinite",
        "pulse-red": "pulse-red 2s ease-in-out infinite",
        "slide-in": "slide-in 0.2s ease-out",
        "fade-in": "fade-in 0.15s ease-out",
      },
      keyframes: {
        "pulse-green": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(34, 197, 94, 0.6)" },
          "50%": { boxShadow: "0 0 0 6px rgba(34, 197, 94, 0)" },
        },
        "pulse-amber": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(245, 158, 11, 0.6)" },
          "50%": { boxShadow: "0 0 0 6px rgba(245, 158, 11, 0)" },
        },
        "pulse-red": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(239, 68, 68, 0.6)" },
          "50%": { boxShadow: "0 0 0 6px rgba(239, 68, 68, 0)" },
        },
        "slide-in": {
          from: { transform: "translateY(8px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
