#!/bin/bash
set -e

WEB_DIR="/Users/weekendsuperhero/GEMINI_HACKATHON/as400/carddemo-web"

echo "=========================================================="
echo "🚀 CLOUDFLARE WORKERS & PAGES DEPLOYMENT FOR CARDDEMO"
echo "=========================================================="

cd "${WEB_DIR}"

echo "[1/3] Building TypeScript & Vite Static Web Application..."
npm run build

echo "[2/3] Bundling self-contained Cloudflare Pages _worker.js..."
node -e '
import fs from "node:fs";
import path from "node:path";
const snapPath = "./worker-snapshot.json";
const workerPath = "./worker.mjs";
const outWorker = "./dist/_worker.js";
const snapJson = fs.readFileSync(snapPath, "utf8");
let workerSrc = fs.readFileSync(workerPath, "utf8");
const inlined = `const snapshot = ${snapJson};
` + workerSrc.replace("import snapshot from './worker-snapshot.json';", "");
fs.writeFileSync(outWorker, inlined, "utf8");
console.log("  ✓ Bundled dist/_worker.js (" + (inlined.length/1024).toFixed(1) + " KB)");
'

echo "[3/3] Checking Cloudflare Authentication..."
if [ -n "${CLOUDFLARE_API_TOKEN}" ]; then
  echo "  ✓ CLOUDFLARE_API_TOKEN detected in environment."
  echo "Deploying directly to Cloudflare Pages..."
  npx wrangler pages deploy dist --project-name carddemo-sistine
else
  echo ""
  echo "⚠️ Cloudflare Authentication Needed:"
  echo "To deploy to Cloudflare Pages / Workers in 30 seconds:"
  echo "  1) Run: npx wrangler login"
  echo "  2) Run: npx wrangler pages deploy dist --project-name carddemo-sistine"
  echo "     OR:  npx wrangler deploy"
  echo ""
  echo "The production static build and self-contained _worker.js are ready in:"
  echo "  ${WEB_DIR}/dist"
fi
