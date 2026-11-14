import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    outDir: "src/public/build",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/public/js/app.js",
      output: {
        entryFileNames: "app.js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: (asset) =>
          asset.names?.some((n) => n.endsWith(".css"))
            ? "style.css"
            : "[name]-[hash][extname]",
      },
    },
  },
});
