import { defineConfig } from "vite";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"]
  },
  root: "src/web",
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true
  }
});
