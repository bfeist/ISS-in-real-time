import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import serveStatic from "serve-static";
import serveIndex from "serve-index";

// https://vitejs.dev/config/
export default defineConfig({
  root: "./src",
  base: "./",
  envDir: "../",
  plugins: [
    react(),
    {
      name: "serve-mock-s3",
      configureServer(server) {
        server.middlewares.use(
          "/mock_s3",
          serveStatic("F:/ISSiRT_assets/iss_irt_s3", {
            index: false, // Disable default index file serving
            fallthrough: false, // Do not fall through to the next middleware
          })
        );
        server.middlewares.use(
          "/mock_s3",
          serveIndex("F:/ISSiRT_assets/iss_irt_s3", { icons: true }) // Enable directory listings
        );
      },
    },
  ],
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
