// lib/model.ts — the token radar's value model and farm-plan generator.
// Pure, deterministic functions over the DefiLlama snapshot. No I/O,
// no Date.now, no Math.random: the same snapshot always builds the same board.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  ratio_used: number;
  growth_factor: number;
  age_factor: number;
  implied_value_usd: number;
  rank: number;
  why: string;
  farm_steps: string[];
  watchlist: boolean;
  // A wrapped, staked or bridged product of a token that already trades (or a
  // versioned product of one), by the same rule the snapshot's watchlist uses
  // to leave such protocols out. Always false: such products are excluded
  // from the board before ranking, so no ranked row is one.
  wrapped_product: boolean;
}

export interface Calibration {
  global: number;
  byCategory: Record<string, number>;
  counts: Record<string, number>;
}

export interface Board {
  rows: BoardRow[];
  calibration: Calibration;
  as_of: string;
  floor_usd: number;
  total_protocols: number;
  pre_token_count: number;
  wrapped_excluded: number;
  watchlist_count: number;
}

// ---------------------------------------------------------------- helpers

export function median(nums: number[]): number {
  const s: number[] = [...nums].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function fmtMoney(n: number): string {
  if (n >= 1e9) return "$" + trimZeros((n / 1e9).toFixed(2)) + "B";
  if (n >= 1e6) return "$" + trimZeros((n / 1e6).toFixed(1)) + "M";
  if (n >= 1e3) return "$" + trimZeros((n / 1e3).toFixed(1)) + "K";
  return "$" + Math.round(n).toLocaleString("en-US");
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

export function fmtPct(v: number | null): string {
  if (v === null) return "n/a";
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

function ageDays(listedAt: string | null, asOf: string): number | null {
  if (!listedAt) return null;
  const a = listedAt.split("-").map(Number);
  const b = asOf.split("-").map(Number);
  const days = Math.floor(
    (Date.UTC(b[0]!, b[1]! - 1, b[2]!) - Date.UTC(a[0]!, a[1]! - 1, a[2]!)) / 86400000,
  );
  return days < 0 ? 0 : days;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---------------------------------------------------------------- calibration

export function calibrate(protocols: SnapshotProtocol[]): Calibration {
  const bearing = protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const global = median(bearing.map((p) => p.mcap_usd! / p.tvl_usd));
  const byCat: Record<string, number[]> = {};
  for (const p of bearing) {
    const c = p.category ?? "Uncategorized";
    if (!byCat[c]) byCat[c] = [];
    byCat[c]!.push(p.mcap_usd! / p.tvl_usd);
  }
  const byCategory: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const c of Object.keys(byCat).sort()) {
    counts[c] = byCat[c]!.length;
    byCategory[c] = byCat[c]!.length >= 3 ? median(byCat[c]!) : global;
  }
  return { global, byCategory, counts };
}

// ---------------------------------------------------------------- farm plans

function primaryChain(p: SnapshotProtocol): string {
  return p.chains && p.chains.length > 0 ? p.chains[0]! : "Ethereum";
}

function secondChain(p: SnapshotProtocol): string {
  return p.chains && p.chains.length > 1 ? p.chains[1]! : "another supported chain";
}

function fundStep(name: string, chain: string): string {
  return (
    "Set up a wallet that works on " + chain + " and fund it with $100–$500 for " + name +
    "; keep $5–$20 aside for gas on " + chain + " and allow about 15 minutes for the first setup."
  );
}

function trackStep(name: string): string {
  return (
    "Record every position in a spreadsheet and review it weekly; follow only " + name +
    "'s official channels, never trust 'airdrop' links in DMs, and exit a position if its fees pass 2% of your deposit."
  );
}

type PlanFn = (name: string, chain: string, chain2: string) => string[];

const PLANS: Record<string, PlanFn> = {
  Dexs: (name, chain) => [
    fundStep(name, chain),
    "Swap $50–$200 of a stablecoin for the native token of " + chain + " on " + name +
      " to learn its router; the trade takes about 5 minutes and costs roughly $0.50–$3 in network fees.",
    "Add $100–$300 of liquidity to " + name + "'s busiest stable pair, split evenly between the two tokens; " +
      "entering the position takes under 10 minutes and about $1–$5 in gas.",
    "Open a concentrated range position of $50–$150 around the current price on " + name +
      " and write down the fee tier you picked; rebalancing takes 10–15 minutes when the price leaves your range.",
    "Route one $25–$75 trade a week through " + name + " for 4–8 weeks and compare its quote with one other " +
      "aggregator each time; each trade takes about 5 minutes.",
    trackStep(name),
  ],
  Lending: (name, chain) => [
    fundStep(name, chain),
    "Supply $100–$400 of a stablecoin to " + name + "'s lending market on " + chain +
      " and note the supply rate shown; the deposit takes about 5 minutes and $1–$4 in gas.",
    "Borrow $25–$75 against your supply on " + name + " at a loan-to-value under 50% and keep the borrowed " +
      "funds in stables; setting it up takes 10 minutes and the borrow rate is shown before you confirm.",
    "Repay the borrow after 2–4 weeks on " + name + " and compare the interest you paid with the supply " +
      "interest you received; the repay transaction takes about 5 minutes.",
    "Supply a second asset of $50–$150 on " + name + " on " + chain +
      " to learn how its collateral factors differ; allow 10 minutes and $1–$5 in gas.",
    trackStep(name),
  ],
  Yield: (name, chain) => [
    fundStep(name, chain),
    "Deposit $100–$300 into " + name + "'s highest-TVL vault on " + chain +
      " and write down the strategy it runs; the deposit takes about 5 minutes and $2–$6 in gas.",
    "Leave the vault position for 2–4 weeks, then harvest or compound once and record the net result after " +
      "gas; each action takes about 5 minutes.",
    "Deposit $50–$150 into a second " + name + " vault with a different strategy and compare the two after " +
      "a month; allow 10 minutes per deposit.",
    "Test a $25–$75 withdrawal from " + name + " to confirm the exit path and its fee before committing more; " +
      "a withdrawal takes 5–10 minutes.",
    trackStep(name),
  ],
  "Liquid Staking": (name, chain) => [
    fundStep(name, chain),
    "Stake $100–$300 of " + chain + "'s native token through " + name +
      " and receive its liquid staking token; the stake takes about 5 minutes and $1–$3 in gas.",
    "Use $50–$150 of the liquid staking token in a " + chain +
      " DeFi pool to see how it behaves as collateral; allow 10 minutes and $2–$5 in gas.",
    "Unstake a $25–$50 test amount through " + name +
      " to learn the unstaking delay and fee; the request takes 5 minutes and the wait can run days depending on the queue.",
    "Restake the proceeds after 4–6 weeks and compare the balance with your original stake; " +
      "the transaction takes about 5 minutes.",
    trackStep(name),
  ],
  Bridge: (name, chain, chain2) => [
    fundStep(name, chain),
    "Bridge $50–$200 of a stablecoin from " + chain + " to " + chain2 + " through " + name +
      " and time the transfer; it takes 5–30 minutes and $2–$10 in fees.",
    "Bridge $25–$75 back through " + name + " on a different route or token and compare the fee and arrival " +
      "time; allow 10–30 minutes.",
    "Move $100–$300 across " + name + " in two smaller transfers instead of one large one to compare slippage " +
      "and fees; each transfer takes 5–30 minutes.",
    "Try " + name + "'s fastest route option with a $25–$50 transfer and note what it costs versus the " +
      "standard route; about 10 minutes.",
    trackStep(name),
  ],
  CEX: (name, chain) => [
    "Create an account on " + name + ", finish its verification, and deposit $100–$500 by bank transfer or " +
      "crypto; verification can take a few hours and the deposit 10–30 minutes.",
    "Place a $50–$200 spot trade on " + name + " between two majors and note the fee tier you paid; the trade " +
      "settles in seconds and the fee is shown before you confirm.",
    "Try " + name + "'s recurring-buy or convert feature with $25–$75 weekly for 4–8 weeks; setting it up " +
      "takes about 10 minutes.",
    "Move $50–$100 off " + name + " to your own wallet on " + chain +
      " to learn its withdrawal fee and time; a withdrawal takes 10–30 minutes.",
    "Use one more " + name + " product, such as its earn or card feature, with $25–$50 for a month and record " +
      "the result; allow 15 minutes to set up.",
    trackStep(name),
  ],
  RWA: (name, chain) => [
    fundStep(name, chain),
    "Buy $100–$300 of " + name + "'s tokenized asset on " + chain +
      " and read its backing documents first; the purchase takes about 10 minutes and $2–$6 in gas or fees.",
    "Hold the position for 4–8 weeks and record the yield or income it pays, if any, against the fees; " +
      "checking takes 5 minutes a week.",
    "Sell a $25–$75 test portion on " + name + " to confirm the exit path and spread; the sale takes 10–15 minutes.",
    "Compare " + name + "'s asset with one similar tokenized product on " + chain +
      " on price, backing and fees; the comparison takes about 30 minutes.",
    trackStep(name),
  ],
  "Risk Curators": (name, chain) => [
    fundStep(name, chain),
    "Deposit $100–$300 into a " + name + "-curated vault on " + chain +
      " and read which markets the curator picked and why; the deposit takes about 5 minutes and $2–$5 in gas.",
    "Check the vault's allocation weekly for a month and note any reallocation the curator makes; " +
      "each check takes 5 minutes.",
    "Deposit $50–$150 into a second " + name + " vault with a different risk profile and compare the two " +
      "after 4–6 weeks; allow 10 minutes per deposit.",
    "Withdraw a $25–$75 test amount from " + name + " to confirm the exit path and fee; the withdrawal takes " +
      "5–10 minutes.",
    trackStep(name),
  ],
  "Onchain Capital Allocator": (name, chain) => [
    fundStep(name, chain),
    "Allocate $100–$300 through " + name + " on " + chain +
      " into its largest strategy and note the allocation split; the allocation takes about 10 minutes and $2–$6 in gas.",
    "Review " + name + "'s allocation report after 2–4 weeks and record how the split changed; the review " +
      "takes 15 minutes.",
    "Move $50–$150 to a second strategy " + name + " offers and compare the two after a month; allow 10 minutes " +
      "per move.",
    "Withdraw a $25–$75 test amount from " + name + " to confirm the exit path; the withdrawal takes 5–10 minutes.",
    trackStep(name),
  ],
  "Basis Trading": (name, chain) => [
    fundStep(name, chain),
    "Open a $100–$300 basis position on " + name + " on " + chain +
      " — long spot, short the future — and write down the funding rate at entry; opening takes about 15 minutes " +
      "and $2–$8 in fees.",
    "Hold the basis trade for 2–4 weeks, checking the funding rate twice a week; each check takes 5 minutes.",
    "Close a $25–$75 slice of the position on " + name +
      " to confirm the exit cost and spread; closing takes about 10 minutes.",
    "Compare " + name + "'s funding rate with one other venue the same week and note the difference; " +
      "the comparison takes about 15 minutes.",
    trackStep(name),
  ],
};

function genericPlan(name: string, chain: string): string[] {
  return [
    fundStep(name, chain),
    "Open a $100–$300 position in " + name + "'s main product on " + chain +
      " and write down the fee and any lock-up before you confirm; opening takes about 10 minutes and $1–$5 in gas.",
    "Use a second " + name + " feature with $50–$150 — a different pool, market or vault on " + chain +
      " — and compare it with the first after 2–4 weeks; allow 10 minutes.",
    "Withdraw or close a $25–$75 test slice from " + name +
      " to confirm the exit path and its cost; the exit takes 5–10 minutes.",
    "Repeat the main action weekly with $25–$75 for 4–8 weeks and keep a log of fees paid versus position " +
      "size; each round takes about 10 minutes.",
    trackStep(name),
  ];
}

const BRIDGE_CATEGORIES = new Set(["Bridge", "Cross Chain Bridge", "Canonical Bridge"]);

export function farmSteps(p: SnapshotProtocol): string[] {
  const chain = primaryChain(p);
  const chain2 = secondChain(p);
  const cat = p.category ?? "";
  if (BRIDGE_CATEGORIES.has(cat) && PLANS["Bridge"]) {
    return PLANS["Bridge"]!(p.name, chain, chain2);
  }
  const fn = PLANS[cat];
  if (fn) return fn(p.name, chain, chain2);
  return genericPlan(p.name, chain);
}

// ---------------------------------------------------------------- the board

// The house's own rule for leaving a protocol off the watchlist, applied
// here to exclude the row from the board: a wrapped, staked or bridged
// product of a token that already trades, or a versioned product of one.
const WRAPPED_CATEGORIES = new Set([
  "Bridge", "Canonical Bridge", "Liquid Staking", "Liquid Restaking", "Restaked BTC", "CEX",
]);
const EXCHANGE_PREFIXES = ["Binance", "Coinbase", "Bybit", "Kraken", "Bitget", "OKX", "Bitfinex", "Gemini"];
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isWrappedOrBridged(p: SnapshotProtocol): boolean {
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return true;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return true;
  for (const ex of EXCHANGE_PREFIXES) if (p.name.startsWith(ex)) return true;
  if (VERSION_SUFFIX.test(p.name)) return true;
  return false;
}

export function buildBoard(snapshot: Snapshot): Board {
  const calibration = calibrate(snapshot.protocols);
  const watch = new Set(snapshot.watchlist);
  const pre = snapshot.protocols.filter((p) => p.gecko_id === null && p.symbol === null);

  // Exclude wrapped, staked or bridged products of a token that already
  // trades: their token exists in another form, so they are not fresh
  // launch candidates. The watchlist already leaves them out; the board
  // ranks only the genuine pre-token protocols.
  const wrappedExcluded = pre.filter((p) => isWrappedOrBridged(p)).length;
  const genuine = pre.filter((p) => !isWrappedOrBridged(p));

  const scored = genuine.map((p) => {
    const cat = p.category ?? "Uncategorized";
    const ratio = calibration.byCategory[cat] ?? calibration.global;
    const base = p.tvl_usd * ratio;
    const g = p.change_7d === null ? 1 : 1 + (clamp(p.change_7d, -50, 200) / 100) * 0.5;
    const age = ageDays(p.listed_at, snapshot.as_of);
    const a = age === null ? 1 : Math.min(1.5, 1 + 0.25 * Math.log10(1 + age / 365));
    let implied = Math.round(base * g * a);
    if (implied < 1) implied = 1;
    if (implied > 50000000000) implied = 50000000000;
    return { p, ratio, g, a, implied, age };
  });

  scored.sort((x, y) => {
    if (y.implied !== x.implied) return y.implied - x.implied;
    if (y.p.tvl_usd !== x.p.tvl_usd) return y.p.tvl_usd - x.p.tvl_usd;
    return x.p.slug < y.p.slug ? -1 : x.p.slug > y.p.slug ? 1 : 0;
  });

  // Enforce strictly decreasing implied values down the board.
  for (let i = 1; i < scored.length; i++) {
    if (scored[i]!.implied >= scored[i - 1]!.implied) {
      scored[i]!.implied = Math.max(1, scored[i - 1]!.implied - 1);
    }
  }

  const rows: BoardRow[] = scored.map((s, i) => {
    const steps = farmSteps(s.p);
    for (const step of steps) {
      const t = step.trim();
      if (t.length < 20 || t.length > 600) {
        throw new Error(`farm step out of range (${t.length} chars) for ${s.p.slug}: ${t.slice(0, 80)}`);
      }
    }
    const catLabel = s.p.category ?? "Uncategorized";
    const why =
      "TVL " + fmtMoney(s.p.tvl_usd) +
      " × " + catLabel + " ratio " + s.ratio.toFixed(3) +
      " × growth " + s.g.toFixed(2) +
      " × age " + s.a.toFixed(2) +
      " → " + fmtMoney(s.implied);
    return {
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      listed_at: s.p.listed_at,
      age_days: s.age,
      ratio_used: s.ratio,
      growth_factor: s.g,
      age_factor: s.a,
      implied_value_usd: s.implied,
      rank: i + 1,
      why,
      farm_steps: steps,
      watchlist: watch.has(s.p.slug),
      wrapped_product: isWrappedOrBridged(s.p),
    };
  });

  return {
    rows,
    calibration,
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    total_protocols: snapshot.protocols.length,
    pre_token_count: genuine.length,
    wrapped_excluded: wrappedExcluded,
    watchlist_count: snapshot.watchlist.length,
  };
}
