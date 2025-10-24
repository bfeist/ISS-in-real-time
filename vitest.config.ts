/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/tests/vitest.setup.ts"],
    globalSetup: ["./src/tests/vitest.global.ts"],
    css: true,
    coverage: {
      reporter: ["text", "lcov", "cobertura"],
      include: ["src/**/*.{js,jsx,ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/tests/**", "src/**/__mocks__/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      components: path.resolve(__dirname, "./src/components"),
      pages: path.resolve(__dirname, "./src/pages"),
      public: path.resolve(__dirname, "./src/public"),
      store: path.resolve(__dirname, "./src/store"),
      api: path.resolve(__dirname, "./src/api"),
      utils: path.resolve(__dirname, "./src/utils"),
      styles: path.resolve(__dirname, "./src/styles"),
      typings: path.resolve(__dirname, "./src/typings"),
    },
  },
});
