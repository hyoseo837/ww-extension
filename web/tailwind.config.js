import forms from "@tailwindcss/forms";
import containerQueries from "@tailwindcss/container-queries";

/** @type {import('tailwindcss').Config} */
// Theme ported from the Stitch "Warm Editorial" export (web/design). ADR 0023.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "page-bg": "#FAF9F5",
        surface: "#FFFFFF",
        "surface-bright": "#fff8f0",
        "surface-alt": "#FBFAF6",
        "surface-dim": "#e0d9ce",
        "surface-container-low": "#faf3e7",
        "surface-container": "#f4ede2",
        "surface-container-high": "#efe7dc",
        "surface-container-highest": "#e9e2d7",
        background: "#fff8f0",
        border: "#E8E5DC",
        outline: "#87736d",
        "outline-variant": "#d9c1ba",
        "on-surface": "#1e1b15",
        "on-surface-variant": "#54433e",
        "text-secondary": "#6E6A5F",
        "text-muted": "#9A958A",
        primary: "#8f4830",
        "on-primary": "#ffffff",
        "primary-container": "#ad5f46",
        "accent-hover": "#B5644B",
        "accent-soft": "#F4E8E1",
        secondary: "#655d58",
        "secondary-container": "#ece0d9",
        "on-secondary-container": "#6b635d",
        tertiary: "#00685d",
        positive: "#5E7C5A",
        negative: "#B5544A",
        error: "#ba1a1a",
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px",
      },
      spacing: {
        base: "4px",
        xs: "8px",
        sm: "12px",
        md: "16px",
        lg: "24px",
        xl: "32px",
        xxl: "48px",
        gutter: "24px",
        "max-width": "960px",
      },
      fontFamily: {
        "display-lg": ["Source Serif 4", "serif"],
        "display-lg-mobile": ["Source Serif 4", "serif"],
        "headline-lg": ["Source Serif 4", "serif"],
        "headline-md": ["Source Serif 4", "serif"],
        "body-lg": ["Inter", "sans-serif"],
        "body-md": ["Inter", "sans-serif"],
        "label-md": ["Inter", "sans-serif"],
        "label-sm": ["Inter", "sans-serif"],
      },
      // Type scale tuned down ~75-80% at v6.8 (the Stitch export ran large on
      // real screens; headings hit hardest). Single source — every page uses
      // these tokens. Original Stitch sizes are in web/design/.../DESIGN.md.
      fontSize: {
        "display-lg": ["34px", { lineHeight: "42px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "display-lg-mobile": ["26px", { lineHeight: "32px", fontWeight: "600" }],
        "headline-lg": ["24px", { lineHeight: "30px", fontWeight: "600" }],
        "headline-md": ["19px", { lineHeight: "26px", fontWeight: "500" }],
        "body-lg": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "body-md": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "label-md": ["13px", { lineHeight: "18px", letterSpacing: "0.02em", fontWeight: "500" }],
        "label-sm": ["11px", { lineHeight: "14px", letterSpacing: "0.04em", fontWeight: "600" }],
      },
      maxWidth: { "max-width": "960px" },
    },
  },
  plugins: [forms, containerQueries],
};
