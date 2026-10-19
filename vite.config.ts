import { createHash } from "node:crypto";
import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { zoneSentence, type ZoneRecord } from "./src/lib/zones";

/** Changes when the shipped ONNX runtime bytes change, so /ort/?v= is a new cache key. */
function ortBuildHash(): string {
  const hash = createHash("sha256");
  for (const file of ["public/ort/ort-wasm-simd-threaded.jsep.wasm", "public/ort/ort-wasm-simd-threaded.jsep.mjs"]) {
    hash.update(readFileSync(file));
  }
  return hash.digest("hex").slice(0, 12);
}

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
  define: {
    __ORT_BUILD__: JSON.stringify(ortBuildHash()),
  },
  plugins: [react(), dropBundledOrtWasm(), zoneStubs()],
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

function zoneStubs(): Plugin {
  return {
    name: "zone-stubs",
    apply: "build",
    closeBundle() {
      const distIndex = path.resolve("dist/index.html");
      const explorePath = path.resolve("public/data/explore.json");
      const html = readFileSync(distIndex, "utf8");
      const explore = JSON.parse(readFileSync(explorePath, "utf8")) as { zones: ZoneRecord[] };
      for (const zone of explore.zones) {
        const sentence = zoneSentence(zone, "en");
        const url = `https://twinsites.com/zone/${zone.slug}`;
        writeStub(html, path.resolve("dist/zone", zone.slug), `${zone.labelEn} — Twinsites`, sentence, url, zone.labelEn);
      }
      writeStub(
        html,
        path.resolve("dist/zones"),
        "Zones — Twinsites",
        `${explore.zones.length} zones of AI-built homepages.`,
        "https://twinsites.com/zones",
        "Zones",
      );
    },
  };
}

function writeStub(html: string, dir: string, title: string, description: string, url: string, heading: string): void {
  let page = html;
  page = page.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  page = page.replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${esc(description)}$2`);
  page = page.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
  page = page.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`);
  page = page.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`);
  page = page.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(description)}$2`);
  page = page.replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(title)}$2`);
  page = page.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(description)}$2`);
  page = page.replace(
    /<div id="root">[\s\S]*?<\/div>/,
    `<div id="root"><h1>${esc(heading)}</h1><p>${esc(description)}</p></div>`,
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.html"), page);
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
