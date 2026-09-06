import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        bar: resolve(__dirname, "src/bar/index.html"),
        panel: resolve(__dirname, "src/panel/panel.html"),
        settings: resolve(__dirname, "src/settings/settings.html"),
      },
    },
  },
});
