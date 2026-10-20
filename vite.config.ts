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

/**
 * The production security headers, read from the nginx snippet so preview and
 * QA serve exactly the same policy. Preview always enforces the CSP (never
 * Report-Only), and HSTS is dropped because preview is plain HTTP.
 */
function securityHeaders(): Record<string, string> {
  const conf = readFileSync("ops/nginx/twinsites-security.conf", "utf8");
  const headers: Record<string, string> = {};
  for (const match of conf.matchAll(/^add_header\s+([\w-]+)\s+"([^"]*)"\s+always;/gm)) {
    const [, name, value] = match;
    if (name === "Strict-Transport-Security") continue;
    headers[name === "Content-Security-Policy-Report-Only" ? "Content-Security-Policy" : name] = value;
  }
  if (!headers["Content-Security-Policy"]) throw new Error("ops/nginx/twinsites-security.conf has no CSP");
  return headers;
}

const headers = securityHeaders();

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
  // Dev injects CSS as inline <style> for hot reload, so it gets everything but the CSP.
  server: { headers: Object.fromEntries(Object.entries(headers).filter(([name]) => name !== "Content-Security-Policy")) },
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
      const report = JSON.parse(readFileSync(path.resolve("public/data/report.json"), "utf8")) as {
        total: number;
        topFourShare: number;
        twins: { top1Any: number };
      };
      const total = report.total.toLocaleString("en-GB");
      writeStub(
        html,
        path.resolve("dist/report"),
        `What ${total} AI-built homepages have in common — Twinsites`,
        `Four layouts cover ${report.topFourShare}% of ${total} AI-built homepages, and ${report.twins.top1Any}% have a look-alike in the top 1% of all pairs. Layouts, colours, crowded categories and stock phrases, measured.`,
        "https://twinsites.com/report",
        `What ${total} AI-built homepages have in common`,
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
