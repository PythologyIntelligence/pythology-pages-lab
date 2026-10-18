# EarthNet Incident 3D — real terrain perspective and wildfire evolution

## 3D versus 2D

The engine **is true 3D**: OpenGlobus draws an elevation mesh with WebGL and a 3D perspective camera. Previously the camera was so high and near-vertical that the terrain looked like a shaded 2D map. The new **3D oblique** default positions the eye away from the selected incident and explicitly looks toward that location. **Terrain approach** gives a still lower view, while **Overhead** is a genuine top-down reference. Both elevation/imagery tiles load from external providers; no building or vegetation meshes are claimed. Real terrain relief is more obvious in mountainous areas than over flat land or the ocean.

If browser validation still shows only a flat overhead scene, inspect the renderer camera configuration; do not relabel top-down screenshots "3D" until checked. GitHub CI cannot verify the visual angle in an actual browser.

## Fire evolution rendering

**Red** is a timestamped **mapped actively burning area**, with a thin bright-red outline and translucent soft-red fill. **Blue** is a separately sourced **mapped burned-ground area**, with a blue outline and blue fill. The blue polygon may grow across recorded frames; it is NOT expanded automatically by assuming the previous red layer is now burned. Corrections may reduce it. Both are draped over actual 3D terrain.

These layers are NOT interchangeable with:
- Generic reported wildfire event polygon (a perimeter may enclose both burned and unburned islands).
- NIFC operational incident perimeter (not necessarily the line of currently active fire).
- FIRMS VIIRS/MODIS heat detection **points** (neither a continuous actively burning area nor a verified burned scar).
- Acreage / fire size in the EarthNet event feed.
- Simulated flame spread (hypothesis) or weather-model projections.

The independently validated `fire3d.json` contract uses `schemaVersion:1`, `producer:Pythology Fire Evolution Geometry v1`, a snapshot publication timestamp and EarthNet exact event IDs with `frames`, `validTime`, and individual `activeBurning` / `burnedArea` GeoJSON polygons. A public polygon **requires** official/observed evidence class, source name, HTTPS source URL and valid time. Frames may have either, both, or neither; empty frames are excluded. Real feed documents older than six hours are suppressed.

No published external producer for this contract exists yet. **Real incidents must show “no verified active-burning or burned-ground geometry” until authoritative providers are connected.** Their general perimeter is never silently repainted red.

To demonstrate intended progression safely, the public UI includes a button for a separate, **synthetic** test scene under `?exercise=fire`. It uses three invented NZ polygons, no real event records and no Prometheus or scientific claims, and displays a warning banner. The demo cannot be loaded through the real `fire3d.json` path.

## Prometheus — current and future

The Pages Lab hourly data assembly now runs the **source-only Prometheus EnviroArc screening module** if no valid upstream screen was published by the Windows VPS. It provides descriptive source-linked event facts under the existing research contract, explicitly labelled as a *GitHub Pages build running Prometheus's deterministic screening code*, not as a VPS inference model or continuous update. The browser refuses stale research. This is valuable provenance, but **does not answer why a fire started or predict which locations will burn next.**

The future analytical pipeline needs source-specific fire perimeter and burned-area products, actual fuel condition, terrain, weather forecasts and observations, historical progression, and validation of predictions against held-out incidents. A real future fire-spread scenario must be versioned, calibrated, time-indexed, confidence-bounded, labelled `modelled` or `hypothetical`, and visually distinct from recorded red/blue wildfire polygons. Firebreak planning must stay an expert-reviewed research overlay rather than instructions.

## How users open the selected event

EarthNet's existing detail card has **↗ Explore in 3D**, using the exact encoded incident ID in the URL. The 3D viewer selects that event, loads its original source facts and moves the perspective camera to the incident. The event picker's current selection also changes the 3D terrain focus.

## Acceptance checklist

- [x] New fire-state contract with strict source identities
- [x] 3 source-snapshot synthetic timeline frames for red/blue animation
- [x] Oblique and low-angle camera presets with real look-at target
- [x] Existing event selection and provenance preserved
- [x] Conditional Prometheus scheduled source screening built in Pages Lab
- [ ] Browser verifies that terrain renders visibly in **actual oblique 3D** and no regression
- [ ] Verify 3D map red/blue layers render and progress in synthetic exercise
- [ ] Authoritative operational wildfire boundary and burned-ground source mapping
- [ ] Prometheus genuinely validated fire/weather causal and scenario models
