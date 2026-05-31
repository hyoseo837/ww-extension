import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite + React SPA (ADR 0019). Builds static assets to dist/ for Vercel.
export default defineConfig({
  plugins: [react()],
});
