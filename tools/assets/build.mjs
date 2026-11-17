// Builds app/static/assets/hologram.js (+ .gz and .br) from app/static/src/hologram/index.js.
// Run:  cd tools/assets && npm install && npm run build
import { build } from "esbuild";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const out = resolve(root, "app/static/assets/hologram.js");

await build({
  entryPoints: [resolve(root, "app/static/src/hologram/index.js")],
  bundle: true, minify: true, format: "iife", globalName: "HubHolo", target: "es2020", legalComments: "eof",
  outfile: out, logLevel: "info", nodePaths: [resolve(here, "node_modules")],
  banner: { js: "/* Hologram core. Bundles three.js (MIT, https://github.com/mrdoob/three.js). Source: app/static/src/hologram */" },
});
const buf = readFileSync(out);
writeFileSync(out + ".gz", gzipSync(buf, { level: 9 }));
writeFileSync(out + ".br", brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
console.log(`hologram.js ${(statSync(out).size / 1024).toFixed(0)} KB, gzip ${(statSync(out + ".gz").size / 1024).toFixed(0)} KB, brotli ${(statSync(out + ".br").size / 1024).toFixed(0)} KB`);
