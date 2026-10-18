# EarthNet Incident 3D — GitHub Pages Lab integration

**Development PR only.** This change is not live until reviewed, merged to `main`, and deployed successfully by the existing `.github/workflows/pages.yml`.

This is the **actual GitHub Pages Lab deployment repository** for Pythology's public EarthNet mirror. EarthNet's source/ingest repository `PythologyIntelligence/earthnet_v2` is a separate codebase. Earlier OpenKBS CLI instructions do not apply to deploying this GitHub Pages Lab site.

## How the public site is assembled

- GitHub Actions starts from `pythology-pages-lab/main`, builds `_site`, and deploys it using `actions/deploy-pages@v4`.
- `scripts/build-enviroarc-pages.mjs` stages the GitHub-hosted EarthNet UI from `earthnet2/` and copies current **read-only** EarthNet JSON feeds from `https://earthnet.pythology.co.nz/media/feed/` to `_site/earthnet2/media/feed/`.
- The build runs on `main` pushes and on a scheduled hourly refresh. This is a **snapshot mirror**, not a live minute-by-minute browser connection to the upstream origin.
- This PR adds `earthnet2/incident3d/` and an Explore in 3D link in `earthnet2/app/panel.js`.
- A new stage within the existing workflow installs pinned `@openglobus/og@0.28.7` in the isolated Actions runner, checks version and MIT licence, and copies the **published engine's** JS, CSS, resources and licence into `_site/earthnet2/vendor/openglobus/`. It does not need the disposable Pythology source fork.
- All new paths are **relative** so both the Pages project-prefix URL and any configured custom-domain path can work. Do not switch back to absolute root paths.

Expected GitHub Pages Lab page after deployment:

`https://pythologyintelligence.github.io/pythology-pages-lab/earthnet2/incident3d/index.html`

The `earthnet.pythology.co.nz` origin is an **upstream source for the lab build**. Do not assume that a Pages Lab PR automatically publishes to that origin or changes its DNS. Verify the actual live URL and any custom-domain mapping separately.

## Prometheus publication chain

The independent Windows VPS Prometheus publisher produces source-only, evidence-linked research. It is currently tested as a **dry-run**. It has **not yet been authorised to publish** to any upstream storage bucket.

The Pages builder now optionally copies `/media/feed/incident3d.json` from the *existing* EarthNet upstream origin **if** it is available, correctly attributed, and fresh. If unavailable or stale, it is simply not staged, and the viewer explicitly displays that current Prometheus research is unavailable. Never use a synthetic fixture as fallback.

A later operator-approved VPS publishing task must first confirm the real storage bucket/identity behind the EarthNet upstream origin and the origin's ability to expose the research companion. GitHub Pages does not provide a runtime write API, and our public browser must never hold AWS keys or a GitHub write token. An alternate export-to-Pages-data workflow would require its own scoped, secured deployment.

## Safe deployment checks

1. Review the pull request; let Actions build it through the existing workflow once merged. The `main` workflow is automatic; **do not merge blindly**, because a build failure can delay the existing website refresh.
2. Confirm the Actions step `Stage EarthNet Incident 3D with pinned OpenGlobus` reports success and the full Pages deploy finishes.
3. Open the above Pages Lab URL. Select a **real public EarthNet incident**. The source polygon, provenance and recorded track should match the source feed, without fake radii where the source supplied none.
4. Verify the `Explore in 3D` link on the EarthNet event detail panel and the back link.
5. Verify browser network paths under `.../earthnet2/media/feed/` and `.../earthnet2/vendor/openglobus/`, not `/media/feed/` at the wrong host root.
6. Check desktop/tablet/mobile controls and external terrain tile loading.
7. Confirm the research panel says "unavailable" until a valid upstream Prometheus `incident3d.json` exists. Even when present, it remains source screening, not hazard forecast or proven causal modelling.
8. Compare default Balanced and High detail on an ordinary desktop browser. Third-party OSM and elevation tiles may still be slow; a DNS record for our own page does not remove provider latency.

## Never break the existing site

No changes to public homepage routing, existing scheduled refresh triggers, ARCUS/Nemesis, Atlas, source ingest, GitHub secrets, live API endpoints, or DNS. `earthnet2/index.html` continues to be the primary public global globe; 3D is an opt-in detail view.

**Rollback:** revert only this PR's merge commit on Pages Lab, leaving the existing EarthNet 2D UI intact.
