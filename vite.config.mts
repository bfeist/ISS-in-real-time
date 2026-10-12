import { defineConfig, loadEnv } from "vite";
import EnvironmentPlugin from "vite-plugin-environment";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import cesium from "vite-plugin-cesium";
import sirv from "sirv";

// https://vitejs.dev/config/
export default defineConfig({
  root: "./src",
  envDir: "../",
  plugins: [
    react(),
    cesium(),
    EnvironmentPlugin("all", { prefix: "VITE_" }),
    {
      name: "local-web-assets",
      configureServer(server) {
        const { WEB_ASSETS_FOLDER } = loadEnv(server.config.mode, __dirname, "WEB_ASSETS_FOLDER");
        if (!WEB_ASSETS_FOLDER) return;

        const serveAssets = sirv(path.resolve(__dirname, WEB_ASSETS_FOLDER), { dev: true });
        server.middlewares.use("/ISSiRT_assets", (req, res) => {
          serveAssets(req, res, () => {
            res.statusCode = 404;
            res.end("Local asset not found");
          });
        });
      },
    },
  ],
  resolve: {
    alias: {
      api: path.resolve(__dirname, "./src/api"),
      components: path.resolve(__dirname, "./src/components"),
      context: path.resolve(__dirname, "./src/context"),
      utils: path.resolve(__dirname, "./src/utils"),
      styles: path.resolve(__dirname, "./src/styles"),
      pages: path.resolve(__dirname, "./src/pages"),
      store: path.resolve(__dirname, "./src/store"),
      hooks: path.resolve(__dirname, "./src/hooks"),
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
          router: ["react-router-dom"],
          map: ["ol", "satellite.js", "tle.js"],
          data: ["@tanstack/react-query", "zustand"],
          vendor: ["paper", "react-youtube", "resium"],
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "@tanstack/react-query",
      "zustand",
      "ol",
      "satellite.js",
      "tle.js",
      "paper",
      "react-youtube",
      "resium",
    ],
  },
});
