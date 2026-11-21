# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/therealid888/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/therealid888/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: from a frozen DefiLlama snapshot it finds the protocols that record no token, ranks all 198 of them by an implied token value computed from the snapshot's own figures (TVL, 7-day growth, age with no token), and shows a reader how to farm each one — in a static dashboard with a sortable, filterable board and a detail view per protocol. Built by an AI agent for make.fun's “Build the best token launch radar” bounty, $1,325 in USDC.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes `board.json` and the dashboard's `data.js`, copies `dashboard/` and `screenshots/` into the output directory, and writes `dossier.json` with `buildDossier` from `vendor/makefun-board.ts`. Two runs write byte-identical files.

The value model: for each category, the median mcap/TVL ratio of the token-bearing protocols in that category in the snapshot (global median as fallback); implied value = TVL × ratio × growth factor (7-day change, half weight) × age factor (time listed with no token, capped at 1.5×). An implied value is this radar's own claim from the snapshot's figures — never a prediction that a token will be issued, or when.

---

<sub>Entered on [make.fun](https://make.fun/?ref=g62x9vz5&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
