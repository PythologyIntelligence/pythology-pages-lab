# Pythology 2026 redesign — Pages Lab integration status

**As of 11 November 2026: STAGED ONLY — NOT PUBLISHED.**
**Release branch:** `site/2026-11-redesign-integration`
**Production source:** `main` (unchanged by the 4 staging commits).

## Completed
- Moved the approved 13-page visual research design from `pythologyintelligence.github.io:design/2026-11-pythology-refresh/site-preview-2026/` into the Pages Lab integration branch.
- Added `assets/theme.css`, `assets/site.js`, and six verified JPEG illustrations.
- Mapped the new Prometheus design to the established `prometheus-research.html` route; retained the `prometheus.html` legacy alias.
- Mapped the redesigned Subterranean page to the established `precursor-research.html` route (the public `/subterranean/` route); also kept `subterranean-lab.html` for preview links.
- Rebased page logo references from `../Logo%20(2).jpeg` to `Logo%20(2).jpeg` for root publication.
- Verified branch versions of the homepage, style/script files and two illustrations. Image blob SHAs matched the source.

## Release blockers — fix before switching Pages
1. **Preserve public live data.** Preview evidence figures are dated static snapshots. Restore validated, freshness-labelled `prometheus-stats.js`, `prometheus-research-cards.js`, NZ daily and triggered research feeds on redesigned pages. Keep unavailability states and scientific caveats.
2. **Retain Weather Lab status.** Existing `weather-lab-live.js` and `weather-observation-list.js` need their `data-weather-live` DOM hosts or a reviewed redesign equivalent.
3. **Update clean route build.** `scripts/build-clean-urls.py` expects `href="site.css"` on Weather Lab and old URL mappings; the new design uses `assets/theme.css`. Preserve `/subterranean/`, `/prometheus/`, `/prometheus-research/`, and all existing clean aliases.
4. **Reconcile legacy QA.** `scripts/test-prometheus-first.mjs`, `scripts/test-website-audit.py`, and `scripts/test-responsive-layout.mjs` assert the former UI structure and will not validate the new one correctly. Replace assertions with equivalent science/evidence, routing, browser and accessibility gates.
5. **Pages cutover without touching original page files in main.** The current `.github/workflows/pages.yml` checks out `main` and builds from it. Introduce a controlled overlay from this branch into the generated `_site` **after** the original production build, with failure/rollback protection, rather than copying redesign files into `main`.
6. **End-to-end verification.** Confirm actual GitHub Pages publication path and custom domain; run browser checks at 390px, 820px and 1440px, keyboard/menu checks, all 13 internal routes and external EarthNet/Atlas links, artwork loads and no horizontal overflow.
7. **SEO and evidence.** Rebuild canonical URLs, sitemaps and discovery metadata after the design overlay; do not imply dated, simulated, research-only results are live or validated predictions.

## Boundary
Do not merge this branch into `main` as a conventional page replacement. Preserve the original files on `main`, the Pages Lab mirror, EarthNet/Agri/VE/Prometheus data mechanisms and their test gates. Do not claim a live deploy until the Pages job succeeds and the published site has been verified.
