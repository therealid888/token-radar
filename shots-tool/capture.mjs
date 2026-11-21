// shots-tool/capture.mjs — serves the built /output over localhost and takes
// the three screenshots with the system Chromium (playwright-core).
// Exits non-zero on any console error, failed request, or HTTP >= 400.
import { createServer } from "node:http";
import { readFile, stat, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { chromium } from "playwright-core";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, "..");
const OUT_DIR = process.env.CAPTURE_OUT || resolve(REPO_ROOT, "out");
const SHOTS_DIR = resolve(REPO_ROOT, "screenshots");

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

function chromiumPath() {
  const primary = join(homedir(), ".cache/ms-playwright/chromium-1255/chrome-linux64/chrome");
  if (existsSync(primary)) return primary;
  return "/opt/meta-chromium/chrome";
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      const rel = url === "/" ? "dashboard/index.html" : url.replace(/^\//, "");
      const file = resolve(OUT_DIR, rel);
      if (!file.startsWith(OUT_DIR)) { res.writeHead(403); res.end(); return; }
      const st = await stat(file);
      if (!st.isFile()) { res.writeHead(404); res.end("not found"); return; }
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const port = server.address().port;
  return { server, port };
}

async function main() {
  const board = JSON.parse(await readFile(join(OUT_DIR, "board.json"), "utf8"));
  const top = board.rows[0].slug;
  const scenes = [
    { name: "1-board.jpg", url: "/dashboard/index.html" },
    { name: "2-detail.jpg", url: "/dashboard/index.html?protocol=" + encodeURIComponent(top) },
    { name: "3-filtered.jpg", url: "/dashboard/index.html?filter=watchlist" },
  ];

  await mkdir(SHOTS_DIR, { recursive: true });
  const { server, port } = await serve();
  const errors = [];
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: chromiumPath(),
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push("console: " + msg.text());
    });
    page.on("pageerror", (err) => errors.push("pageerror: " + err.message));
    page.on("requestfailed", (req) => errors.push("requestfailed: " + req.url()));
    page.on("response", (res) => {
      if (res.status() >= 400) errors.push("http " + res.status() + ": " + res.url());
    });

    for (const scene of scenes) {
      await page.goto("http://127.0.0.1:" + port + scene.url, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 15000 });
      await page.waitForTimeout(300);
      const target = join(SHOTS_DIR, scene.name);
      await page.screenshot({ path: target, type: "jpeg", quality: 85 });
      const st = await stat(target);
      console.log(scene.name + ": " + st.size + " bytes (" + scene.url + ")");
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }

  const names = (await readdir(SHOTS_DIR)).filter((n) => !n.startsWith("."));
  console.log("screenshots in repo: " + names.join(", "));
  if (errors.length > 0) {
    console.error("ERRORS (" + errors.length + "):");
    for (const e of errors) console.error("  " + e);
    process.exit(1);
  }
  console.log("capture clean: 0 console errors, 0 failed requests, 0 HTTP >= 400");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
