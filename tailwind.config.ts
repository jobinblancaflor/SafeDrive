import type { Config } from "tailwindcss";

// CSS-variable-backed colors so light/dark can be swapped by toggling the
// `.dark` class on <html> without touching component code. Variables are
// stored as "r g b" triplets so Tailwind's opacity modifiers (bg-primary/10)
// keep working. See app/globals.css for the variable definitions.
function themeColor(variable: string) {
  return `rgb(var(${variable}) / <alpha-value>)`;
}

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Raw brand palette (from the brand guide) — reach for these when a
        // literal brand color is needed regardless of light/dark context.
        brand: {
          red: "#FF594D",
          navy: "#16294A",
          redDark: "#E8453B",
          redSoft: "#FFE8E5",
          white: "#FFFFFF",
          background: "#F8F9FA",
        },
        // Semantic roles — these flip with light/dark automatically.
        primary: {
          DEFAULT: themeColor("--color-primary"),
          on: themeColor("--color-on-primary"),
          container: themeColor("--color-primary-container"),
          onContainer: themeColor("--color-on-primary-container"),
        },
        secondary: {
          DEFAULT: themeColor("--color-secondary"),
          on: themeColor("--color-on-secondary"),
          container: themeColor("--color-secondary-container"),
          onContainer: themeColor("--color-on-secondary-container"),
        },
        tertiary: {
          DEFAULT: themeColor("--color-tertiary"),
          on: themeColor("--color-on-tertiary"),
          container: themeColor("--color-tertiary-container"),
          onContainer: themeColor("--color-on-tertiary-container"),
        },
        background: themeColor("--color-background"),
        surface: {
          DEFAULT: themeColor("--color-surface"),
          variant: themeColor("--color-surface-variant"),
        },
        outline: themeColor("--color-outline"),
        text: {
          primary: themeColor("--color-text-primary"),
          secondary: themeColor("--color-text-secondary"),
        },
        status: {
          success: "#22A06B",
          warning: "#F59E0B",
          emergency: "#FF594D",
          critical: "#D93636",
          info: "#3B82F6",
          neutral: "#64748B",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        sans: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-data)", "monospace"],
      },
      keyframes: {
        "radar-ping": {
          "0%": { transform: "scale(0.4)", opacity: "0.9" },
          "80%": { opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "0" },
        },
        "dash-draw": {
          to: { strokeDashoffset: "0" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        "radar-ping": "radar-ping 2.6s cubic-bezier(0.2,0.6,0.4,1) infinite",
        "dash-draw": "dash-draw 2.4s ease-out forwards",
        "float-slow": "float-slow 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
