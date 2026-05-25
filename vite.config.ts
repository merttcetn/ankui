import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The SPA lives in src/web-ui and is built to dist/web-ui. The Node server
// (compiled separately to dist/web) serves these files at runtime.
export default defineConfig({
  root: "src/web-ui",
  plugins: [react()],
  build: {
    outDir: "../../dist/web-ui",
    emptyOutDir: true
  }
});
