import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: mode === "extension" ? "./" : "/",
  publicDir: mode === "extension" ? "public-extension" : "public",
  build: {
    outDir: mode === "extension" ? "../../../TOTP-Extension" : "dist",
    emptyOutDir: true
  },
  plugins: [react()],
  server: {
    port: 5173
  }
}));
