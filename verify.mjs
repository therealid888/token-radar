// verify.mjs — checks every gate in the spec and prints PASS/FAIL per gate.
// Usage: node verify.mjs [--out <dir>] [--input <snapshot.json>]
// Also re-runs main.ts twice into temp dirs and confirms byte-identical output.
import { readFileSync, existsSync, readdirSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { buildDossier } from "./vendor/makefun-board.ts";

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}
const OUT_DIR = resolve(arg("--out", join(REPO_ROOT, "out")));
const SNAP_PATH = resolve(
  arg("--input", join(REPO_ROOT, "../token-radar-01-kit/input/snapshot.json")),
);

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail: detail || "" });
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
}

function pngSize(buf) {
  if (buf.length < 24) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function jpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}
function walk(dir, base) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = base ? base + "/" + e.name : e.name;
    if (e.isDirectory()) out.push(...walk(join(dir, e.name), p));
    else if (e.isFile()) out.push(p);
  }
  return out.sort();
}
function treeHash(dir) {
  const files = walk(dir, "");
  const map = {};
  for (const f of files) map[f] = readFileSync(join(dir, f)).toString("base64");
  return map;
}
function treesEqual(a, b) {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.join(",") !== kb.join(",")) return false;
  return ka.every((k) => a[k] === b[k]);
}

function main() {
  const snap = JSON.parse(readFileSync(SNAP_PATH, "utf8"));
  const snapSlugs = new Set(snap.protocols.map((p) => p.slug));
  const watch = new Set(snap.watchlist);

  // ---- board.json
  const boardPath = join(OUT_DIR, "board.json");
  const boardBytes = existsSync(boardPath) ? statSync(boardPath).size : 0;
  const board = existsSync(boardPath) ? JSON.parse(readFileSync(boardPath, "utf8")) : { rows: [] };
  const rows = board.rows || [];
  check("board: 100-4000 rows, <=8 MiB", rows.length >= 100 && rows.length <= 4000 && boardBytes <= 8 * 1024 * 1024,
    rows.length + " rows, " + boardBytes + " bytes");
  check("board: every slug is a snapshot protocol",
    rows.every((r) => snapSlugs.has(r.slug)),
    rows.length + " rows checked");
  const covered = rows.filter((r) => watch.has(r.slug)).length;
  check("board: watchlist fully covered", covered === snap.watchlist.length,
    covered + " / " + snap.watchlist.length);
  const ranksOk = rows.length > 0 && rows.every((r, i) => r.rank === i + 1);
  check("board: ranks exactly 1..N once each", ranksOk, rows.length + " rows");
  let nonRising = true, allEqual = rows.length > 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].implied_value_usd > rows[i - 1].implied_value_usd) nonRising = false;
    if (rows[i].implied_value_usd !== rows[0].implied_value_usd) allEqual = false;
  }
  check("board: implied values non-increasing, not all equal", nonRising && !allEqual,
    "top " + (rows[0] ? rows[0].implied_value_usd : "?") + " -> bottom " + (rows[rows.length - 1] ? rows[rows.length - 1].implied_value_usd : "?"));
  const stepsOk = rows.every((r) =>
    Array.isArray(r.farm_steps) && r.farm_steps.length >= 3 && r.farm_steps.length <= 12 &&
    r.farm_steps.every((s) => { const t = s.trim(); return t.length >= 20 && t.length <= 600; }));
  check("board: farm_steps 3-12 x 20-600 chars", stepsOk, rows.length + " rows checked");
  const wrappedWatch = rows.filter((r) => r.watchlist && r.wrapped_product).length;
  check("board: no watchlist row flagged wrapped", wrappedWatch === 0, wrappedWatch + " flagged");

  // ---- dashboard/
  const dashDir = join(OUT_DIR, "dashboard");
  const dashFiles = existsSync(dashDir) ? walk(dashDir, "") : [];
  const dashBytes = dashFiles.reduce((n, f) => n + statSync(join(dashDir, f)).size, 0);
  const hasHtml = dashFiles.includes("index.html");
  const hasCss = dashFiles.some((f) => f.endsWith(".css"));
  const hasJs = dashFiles.some((f) => f.endsWith(".js"));
  check("dashboard: index.html + >=1 css + >=1 js, <=400 files, <=4 MiB",
    hasHtml && hasCss && hasJs && dashFiles.length <= 400 && dashBytes <= 4 * 1024 * 1024,
    dashFiles.length + " files, " + dashBytes + " bytes");
  let noNet = true;
  const html = hasHtml ? readFileSync(join(dashDir, "index.html"), "utf8") : "";
  if (/(href|src)\s*=\s*["']https?:\/\//i.test(html)) noNet = false;
  for (const f of dashFiles) {
    if (f.endsWith(".css") || f.endsWith(".js")) {
      const txt = readFileSync(join(dashDir, f), "utf8");
      if (/https?:\/\//.test(txt)) noNet = false;
    }
  }
  check("dashboard: no http(s) address in attributes/CSS/JS", noNet);
  const srcBytes = dashFiles
    .filter((f) => /\.(html|css|js)$/.test(f))
    .reduce((n, f) => n + statSync(join(dashDir, f)).size, 0);
  check("dashboard: source (html+css+js) <= 64 KB", srcBytes <= 64 * 1024, srcBytes + " bytes");

  // ---- screenshots/
  const shotsDir = join(OUT_DIR, "screenshots");
  const shotNames = existsSync(shotsDir)
    ? readdirSync(shotsDir).filter((n) => !n.startsWith(".")).sort()
    : [];
  check("screenshots: 3-4 images", shotNames.length >= 3 && shotNames.length <= 4,
    shotNames.join(", "));
  let shotsOk = true;
  const shotDetails = [];
  for (const name of shotNames) {
    const buf = readFileSync(join(shotsDir, name));
    const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50;
    const isJpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const size = isPng ? pngSize(buf) : isJpeg ? jpegSize(buf) : null;
    const ok = (isPng || isJpeg) && buf.length <= 512 * 1024 && size !== null &&
      Math.max(size.w, size.h) <= 1440 && Math.min(size.w, size.h) >= 800;
    if (!ok) shotsOk = false;
    shotDetails.push(name + " " + buf.length + "B " + (size ? size.w + "x" + size.h : "no-size"));
  }
  check("screenshots: each <=512 KiB, whole PNG/JPEG, long<=1440, short>=800", shotsOk,
    shotDetails.join(" | "));

  // ---- dossier.json
  const dossierPath = join(OUT_DIR, "dossier.json");
  const dossierBytes = existsSync(dossierPath) ? statSync(dossierPath).size : 0;
  let dossierMatch = false;
  try {
    const fresh = buildDossier(OUT_DIR, { text_max_bytes: 65536 });
    const onDisk = existsSync(dossierPath) ? readFileSync(dossierPath) : Buffer.alloc(0);
    dossierMatch = Buffer.compare(Buffer.from(fresh), onDisk) === 0;
  } catch (e) {
    dossierMatch = false;
  }
  check("dossier: byte-for-byte fresh buildDossier, <=1.5 MiB",
    dossierMatch && dossierBytes <= 1.5 * 1024 * 1024, dossierBytes + " bytes");

  // ---- determinism: two runs, byte-identical trees
  let detOk = false, detDetail = "";
  try {
    const dirA = mkdtempSync(join(tmpdir(), "radar-a-"));
    const dirB = mkdtempSync(join(tmpdir(), "radar-b-"));
    const env = { ...process.env };
    execFileSync("node", [join(REPO_ROOT, "main.ts"), "--input", SNAP_PATH],
      { env: { ...env, MAKEFUN_OUTPUT_DIR: dirA }, stdio: "pipe" });
    execFileSync("node", [join(REPO_ROOT, "main.ts"), "--input", SNAP_PATH],
      { env: { ...env, MAKEFUN_OUTPUT_DIR: dirB }, stdio: "pipe" });
    detOk = treesEqual(treeHash(dirA), treeHash(dirB));
    detDetail = "two runs into " + dirA + " and " + dirB;
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  } catch (e) {
    detDetail = String(e && e.message ? e.message : e).slice(0, 200);
  }
  check("determinism: two runs byte-identical", detOk, detDetail);

  const failed = results.filter((r) => !r.ok).length;
  console.log(failed === 0 ? "ALL GATES PASS (" + results.length + "/" + results.length + ")"
    : failed + " GATE(S) FAILED of " + results.length);
  process.exit(failed === 0 ? 0 : 1);
}

main();
