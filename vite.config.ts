import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const headers = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function dropBundledOrtWasm() {
  return {
    name: "drop-bundled-ort-wasm",
    generateBundle(_options: unknown, bundle: Record<string, { fileName?: string }>) {
      for (const [fileName, item] of Object.entries(bundle)) {
        const name = item.fileName ?? fileName;
        if (name.endsWith(".wasm") && name.includes("ort-wasm")) delete bundle[fileName];
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), dropBundledOrtWasm()],
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
  },
  worker: {
    format: "es",
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      input: {
        main: path.resolve("index.html"),
        harness: path.resolve("harness.html"),
      },
    },
  },
  server: { headers },
  preview: { headers },
});
