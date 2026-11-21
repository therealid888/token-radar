// main.ts — token radar entrypoint (Node 22, standard library only).
// Reads /input/snapshot.json, writes /output/board.json, /output/data.js,
// copies dashboard/ and screenshots/ to /output, and writes
// /output/dossier.json with buildDossier from vendor/makefun-board.ts.
// Deterministic: no Date.now, no Math.random, fixed input ordering.

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-board.ts";
import { buildBoard } from "./lib/model.ts";
import type { Snapshot } from "./lib/model.ts";

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv: string[]): { input: string | null } {
  let input: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input" && i + 1 < argv.length) input = argv[i + 1]!;
  }
  return { input };
}

function defaultInput(): string {
  const near = resolve(REPO_ROOT, "../input/snapshot.json");
  if (existsSync(near)) return near;
  return resolve(REPO_ROOT, "../token-radar-01-kit/input/snapshot.json");
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.input
    ? resolve(args.input)
    : process.env.MAKEFUN_INPUT
      ? resolve(process.env.MAKEFUN_INPUT)
      : defaultInput();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR
    ? resolve(process.env.MAKEFUN_OUTPUT_DIR)
    : resolve(REPO_ROOT, "out");

  const snapshot: Snapshot = JSON.parse(readFileSync(inputPath, "utf8"));
  const board = buildBoard(snapshot);

  // Fail loudly before writing anything if the board misses a watchlist slug.
  const covered = board.rows.filter((r) => r.watchlist).length;
  if (covered !== board.watchlist_count) {
    throw new Error(`watchlist coverage ${covered} / ${board.watchlist_count}: refusing to write`);
  }

  mkdirSync(outDir, { recursive: true });

  // board.json: the rows object.
  const boardJson = JSON.stringify({ rows: board.rows }, null, 2) + "\n";
  writeFileSync(join(outDir, "board.json"), boardJson, "utf8");

  // data.js: the dashboard's data, beside the page.
  const payload = {
    as_of: board.as_of,
    floor_usd: board.floor_usd,
    total_protocols: board.total_protocols,
    pre_token_count: board.pre_token_count,
    wrapped_excluded: board.wrapped_excluded,
    watchlist_count: board.watchlist_count,
    calibration: board.calibration,
    rows: board.rows,
  };
  const dataJs = "window.TOKEN_RADAR = " + JSON.stringify(payload, null, 2) + ";\n";
  writeFileSync(join(outDir, "data.js"), dataJs, "utf8");

  // dashboard/ and screenshots/ copied to /output.
  cpSync(join(REPO_ROOT, "dashboard"), join(outDir, "dashboard"), { recursive: true });
  const shotsDir = join(REPO_ROOT, "screenshots");
  if (existsSync(shotsDir)) {
    cpSync(shotsDir, join(outDir, "screenshots"), { recursive: true });
  }

  // dossier.json: byte-for-byte what buildDossier writes.
  const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
  writeFileSync(join(outDir, "dossier.json"), dossier);

  console.log(`board rows: ${board.rows.length}`);
  console.log(`watchlist covered: ${covered} / ${board.watchlist_count}`);
  console.log(`wrapped/bridged excluded: ${board.wrapped_excluded}`);
  console.log(`board.json bytes: ${boardJson.length}`);
  console.log(`data.js bytes: ${dataJs.length}`);
  console.log(`dossier.json bytes: ${dossier.length}`);
  console.log(`output: ${outDir}`);
}

main();
