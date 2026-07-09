# learn-slo

An interactive learning tool for **multiwindow, multi-burn-rate (MWMBR) SLO alerting**,
based on [Chapter 5 of the Google SRE Workbook](https://sre.google/workbook/alerting-on-slos/)
("Alerting on SLOs").

**Live site:** https://pegaslee.github.io/learn-slo/ (deployed from `main` via GitHub Pages)

## What it teaches

Five hash-routed pages; every chart is a live, seeded simulation you can drive with sliders.

**Learn** — the guided MWMBR tutorial:

1. **SLOs & error budgets** — objectives, and the budget as downtime/failed requests
2. **Why naive alerting fails** — precision/recall/detection/reset trade-offs of "error rate > X%"
3. **Burn rates** — `burn rate = error ratio / (1 − objective)`, budget depletion, the 1/(1−objective) ceiling
4. **Single-window burn-rate alerts** — the detection-time vs precision vs reset-time triangle
5. **Multiwindow** — adding a short window so alerts clear quickly after recovery
6. **Multi-burn-rate** — the workbook's 14.4×/6×/1× page/ticket tiers (Table 5-6)
7. **Limitations** — a 14.4× rule **can never fire** below a ~93.1% objective, even during a
   total outage; low traffic turns burn rates into sampling noise; slow burns detect slowly by design

**SLIs & Queries** — the ratio underneath the alerts: good/valid event discipline and its
gotchas (health checks, 4xx, retries, bots); "same outage, three monitors" (server-side metrics
never page during a total crash — LB logs and probes do); latency SLIs as slow-requests-counted-bad
instead of p99 alerts; and the actual PromQL recording/alert rules plus real-world detection-time
taxes (scrape intervals, `for:`, notification pipeline).

**Cookbook** — recommended policies per workload, each with a live demo: high-volume APIs
(defaults work), multi-region (the dilution trap: a dead region at 5% traffic share may never
page a global SLO), batch/freshness SLOs (time-based, lumpy, binary burn), low-traffic services
(synthetic probes demonstrably eliminating false pages), and hard third-party dependencies
(feasibility formula; chronic tickets when a dependency eats the budget).

**Playground** — free-form simulator: TPS, traffic shape, incident scenario, objective, SLO
window, fully editable alert rules; burn-rate charts, firing timelines, detection/reset stats.

**Report Card** — scores your rule set against 60 simulated days of randomized incidents and
quiet time: page precision, recall, median detection, false pages/month, slow-burn coverage,
plus verdicts like "this rule is dead code at this objective."

## How it works

- **Simulation engine** (`src/engine/`): pure TypeScript, no UI dependencies.
  Traffic is Poisson-sampled per minute from a shape × TPS; failures are binomially
  sampled from the scenario's target error rate; burn rates are computed over sliding
  windows via prefix sums; MWMBR rules fire when **both** the long and short window
  exceed the threshold. Seeded RNG makes every simulation reproducible.
- **UI** (`src/components/`, `src/sections/`): React + hand-rolled SVG charts
  (crosshair tooltips, threshold lines, alert-firing bands, log scale), KaTeX for formulas,
  light/dark via `prefers-color-scheme`.

## Development

```bash
npm install
npm run dev      # dev server
npm test         # engine unit tests (vitest)
npm run build    # type-check + production build
```

## Deployment

Pushes to `main` build and publish to GitHub Pages via `.github/workflows/deploy.yml`.
One-time setup: repository **Settings → Pages → Source: GitHub Actions**.
