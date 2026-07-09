# learn-slo

An interactive learning tool for **multiwindow, multi-burn-rate (MWMBR) SLO alerting**,
based on [Chapter 5 of the Google SRE Workbook](https://sre.google/workbook/alerting-on-slos/)
("Alerting on SLOs").

**Live site:** https://pegaslee.github.io/learn-slo/ (deployed from `main` via GitHub Pages)

## What it teaches

A guided, scrolling tutorial where every chart is a live simulation you can drive with
sliders, followed by a free-form playground:

1. **SLOs & error budgets** — objectives, and the budget as downtime/failed requests
2. **Why naive alerting fails** — precision/recall/detection/reset trade-offs of "error rate > X%"
3. **Burn rates** — `burn rate = error ratio / (1 − objective)`, budget depletion, the 1/(1−objective) ceiling
4. **Single-window burn-rate alerts** — the detection-time vs precision vs reset-time triangle
5. **Multiwindow** — adding a short window so alerts clear quickly after recovery
6. **Multi-burn-rate** — the workbook's 14.4×/6×/1× page/ticket tiers (Table 5-6)
7. **Limitations** —
   - a 14.4× rule **can never fire** below a ~93.1% objective (max burn rate = 1/(1−objective)),
     even during a total outage
   - low-traffic services turn burn rates into sampling noise (false pages from single failures)
   - slow burns are detected slowly by design
8. **Playground** — pick TPS, traffic shape (steady/diurnal/business-hours/spiky/growing),
   incident scenario (outage/partial/slow burn/blips/bad deploy), objective, SLO window,
   and fully editable alert rules; see burn rates, firing timelines, detection/reset times,
   and budget consumed per rule. Presets showcase great and poor use cases.

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
