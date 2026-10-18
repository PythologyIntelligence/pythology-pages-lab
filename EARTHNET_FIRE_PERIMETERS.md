# EarthNet Incident 3D — real US fire perimeter context (stage 1)

## Source

US National Interagency Fire Center (NIFC), WFIGS **Current Interagency Fire Perimeters**, public ArcGIS FeatureServer layer:
https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0

A wildfire's **reported perimeter is not the same as its actively burning flame line, a burn scar, or the currently occupied heat area**. A single perimeter can enclose already burned or unburned islands. The source polygon is a geographically mapped agency perimeter, not proof of fire activity at all points inside.

## First implementation

- For a selected wildfire within the broad US/AK/HI search extent, the viewer queries a 0.4°-high, roughly 40km local envelope centered on the EarthNet event coordinate (width adjusted by latitude).
- Only records explicitly labelled as WFIGS wildfire (`WF`), public and visible, with a valid agency polygon timestamp within the past 35 days are accepted.
- Geometry is validated as bounded GeoJSON polygons, and an additional proximity screen excludes distant data. Up to five nearest reported polygons display.
- Rendered polygons are **translucent gold/amber with a thin golden border**, deliberately NOT the red active-burning / blue burned-ground classes.
- Every overlay is labelled "**nearby · unconfirmed incident identity**". A NASA EONET incident ID is **not automatically** an IRWIN/NIFC incident ID. Spatial proximity alone is not a join key.
- Requests have a 12s timeout and are cancellable on event change. The browser caches each event's result for 10 minutes. Missing data, out-of-area selection and blocked CORS are reported as unavailable rather than fabricated.
- Original EarthNet 3D map layers, desktop/mobile support and synthetic fire playback remain intact.

## Scientific/operational limits

The mapped official perimeter is appropriate context, but users must consult the original agency for operational guidance. It should not be used for evacuation, containment decisions, or firebreak positioning. EarthNet does not verify source identity matches yet, and polygons may be missing where the provider has not reported any or if the browser refuses cross-origin traffic. This prototype is read-only and no private tokens are used.

**Red active burning and blue burned ground** still require independently labelled source products. A promising research source is NASA's experimental **Fire Events Data Suite (FEDS)**: it offers 12-hourly **modelled fire-affected-area footprints** and **active fire *line segments***. Its cumulative area is **not a validated burned-ground polygon**, and its active line is **not an observed flaming-area polygon**. We should add it as a distinct modelled layer (blue research footprint + red front line) with time/source/uncertainty, not overwrite the verified red/blue semantics.

NASA documentation:
https://gis.earthdata.nasa.gov/portal/rest/services/FireTracking/veda_public_eis_fire_lf_fireline_nrt/MapServer/0/iteminfo
https://openveda.cloud/api/features/collections/public.eis_fire_lf_perimeter_nrt
https://openveda.cloud/api/features/collections/public.eis_fire_lf_fireline_nrt

## Browser verification required

After CI and deployment: select a US wildfire. If the official WFIGS feature service returns recent perimeters within the geographic search, expect golden polygons and a clearly labelled list. If none match or the service is unreachable, expect a clear "none/unavailable" indicator, not colored polygons. No red/blue live front/burn scars are invented. Inspect browser Network for `NIFC` FeatureServer query status and CORS, then adjust integration if needed.
