import { defineConfig } from "vite";
import EnvironmentPlugin from "vite-plugin-environment";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import cesium from "vite-plugin-cesium";

// https://vitejs.dev/config/
export default defineConfig({
  root: "./src",
  envDir: "../",
  plugins: [react(), cesium(), EnvironmentPlugin("all", { prefix: "VITE_" })],
  resolve: {
    alias: {
      components: path.resolve(__dirname, "./src/components"),
      utils: path.resolve(__dirname, "./src/utils"),
      styles: path.resolve(__dirname, "./src/styles"),
      pages: path.resolve(__dirname, "./src/pages"),
    },
  },
  server: {
    host: "0.0.0.0", // all hosts
    port: 8000,
  },
  build: {
    outDir: "../.local/vite/dist",
    assetsDir: "assets",
    sourcemap: true,
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
