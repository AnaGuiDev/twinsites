import { createHash } from "node:crypto";
import path from "node:path";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { zoneSentence, type ZoneRecord } from "./src/lib/zones";

/** Changes when the shipped ONNX runtime bytes change, so /ort/?v= is a new cache key. */
function ortBuildHash(): string {
  const hash = createHash("sha256");
  for (const file of ["public/ort/ort-wasm-simd-threaded.wasm", "public/ort/ort-wasm-simd-threaded.mjs"]) {
    hash.update(readFileSync(file));
  }
  return hash.digest("hex").slice(0, 12);
}

/**
 * The production security headers, read from the nginx snippet so preview and
 * QA serve exactly the same policy. A Report-Only header name is still served
 * here as Content-Security-Policy, and HSTS is dropped because preview is plain HTTP.
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

/** Files worth a .gz twin: text and binaries that compress; images and .gz files do not. */
const COMPRESSIBLE = /\.(js|mjs|css|html|json|svg|wasm|onnx|bin|txt)$/;
const TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".onnx": "application/octet-stream",
  ".bin": "application/octet-stream",
  ".txt": "text/plain",
};

/**
 * Writes file.gz next to every compressible file in dist/ that gzip shrinks by
 * at least a tenth. nginx serves them with `gzip_static on;`, so the server
 * compresses nothing at request time.
 */
function precompress(): Plugin {
  return {
    name: "precompress",
    apply: "build",
    closeBundle: {
      sequential: true,
      order: "post",
      handler() {
        const walk = (dir: string): string[] =>
          readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
            entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
          );
        for (const file of walk(path.resolve("dist"))) {
          if (!COMPRESSIBLE.test(file)) continue;
          const raw = readFileSync(file);
          if (raw.length < 1024) continue;
          const gz = gzipSync(raw, { level: 9 });
          if (gz.length <= raw.length * 0.9) writeFileSync(`${file}.gz`, gz);
        }
      },
    },
  };
}

/** `vite preview` answering like nginx with gzip_static: the .gz twin, when the browser accepts gzip. */
function previewGzipStatic(): Plugin {
  return {
    name: "preview-gzip-static",
    configurePreviewServer(server) {
      const dist = path.resolve("dist");
      server.middlewares.use((req, res, next) => {
        if (!/\bgzip\b/.test(String(req.headers["accept-encoding"] ?? "")) || (req.method !== "GET" && req.method !== "HEAD")) return next();
        const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://preview").pathname);
        const file = path.join(dist, pathname);
        if (!file.startsWith(dist + path.sep) || !existsSync(`${file}.gz`) || !statSync(file).isFile()) return next();
        const body = readFileSync(`${file}.gz`);
        for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
        res.setHeader("Content-Type", TYPES[path.extname(file)] ?? "application/octet-stream");
        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("Vary", "Accept-Encoding");
        res.setHeader("Content-Length", String(body.length));
        res.end(req.method === "HEAD" ? undefined : body);
      });
    },
  };
}

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
    __DATA_BYTES__: JSON.stringify(["catalog.json", "embeddings.f16.bin", "calibration.json"].map((file) => statSync(`public/data/${file}`).size)),
  },
  plugins: [react(), dropBundledOrtWasm(), zoneStubs(), precompress(), previewGzipStatic()],
  resolve: {
    // Inference is CPU WebAssembly on one thread. The default entry carries the
    // WebGPU layer and asks for a runtime twice the size; this one does not.
    alias: [{ find: /^onnxruntime-web$/, replacement: "onnxruntime-web/wasm" }],
  },
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
        // A 1200×630 image for link previews, when public/og-report.png exists.
        existsSync(path.resolve("public/og-report.png"))
          ? { url: "https://twinsites.com/og-report.png", alt: `Four layouts cover ${report.topFourShare}% of ${total} AI-built homepages.` }
          : undefined,
      );
    },
  };
}

function writeStub(
  html: string,
  dir: string,
  title: string,
  description: string,
  url: string,
  heading: string,
  image?: { url: string; alt: string },
): void {
  let page = html;
  if (image) {
    page = page.replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${image.url}$2`);
    page = page.replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${image.url}$2`);
    page = page.replace(/(<meta property="og:image:alt" content=")[^"]*(")/, `$1${esc(image.alt)}$2`);
    page = page.replace(/(<meta name="twitter:image:alt" content=")[^"]*(")/, `$1${esc(image.alt)}$2`);
  }
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
