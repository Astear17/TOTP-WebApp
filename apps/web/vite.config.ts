import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

export default defineConfig(({ mode }) => ({
  base: mode === "extension" ? "./" : "/",
  publicDir: mode === "extension" ? "public-extension" : "public",
  build: {
    outDir: mode === "extension" ? nodeEnv?.EXTENSION_OUT_DIR ?? "../../../TOTP-Extension" : "dist",
    emptyOutDir: true
  },
  plugins: [react()],
  server: {
    port: 5173
  }
}));
