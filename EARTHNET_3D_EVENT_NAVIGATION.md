# EarthNet event navigation → terrain investigation

This changes the **public EarthNet 2D globe** to link directly to the selected source incident in the **existing** EarthNet Incident 3D terrain viewer.

## What to expect

- On the Pages Lab EarthNet globe (`/earthnet2/index.html`), **each supported geolocated event row** gets a small, immediate **3D ↗** shortcut. Clicking the row itself still opens the ordinary event detail panel.
- The detail panel has a prominent **◈ Explore this event in 3D ↗** button directly under the event title/severity, not buried beneath imagery and metrics.
- The link contains the exact `?id=<url-encoded EarthNet event ID>&from=pages`. No coordinates, guessed geometry, redirected user-provided URLs, or synthetic data.
- EarthNet 3D recognizes the same supported terrestrial hazard categories as the 2D links (including earthquakes, volcanoes, wildfires, floods, storms and landslides); near-Earth objects are deliberately excluded because orbital positions are not terrestrial map points.
- EarthNet 3D selects that **same** ID, centers the camera, and offers **← EarthNet** back to the same source incident. Source case `from=live` returns to `earthnet.pythology.co.nz/?id=<exact ID>`.
- An event ID missing from the hourly GitHub Pages snapshot produces an explicit warning **without silently substituting a different hazard**. Select another in the viewer or retry after refresh.
- The Pages Lab frontend uses local relative URL `./incident3d/index.html` for navigation. The independent `PythologyIntelligence/earthnet_v2` source code has a companion source-branch PR pointing to this already-public Pages Lab 3D deployment. **Merging Pages Lab does NOT deploy the independent EarthNet origin.**

## Operator verification

1. Open Pages Lab `/earthnet2/index.html`. Click a fire marker on its 2D globe; a detail panel should open with a high-visibility 3D button.
2. Click the button. Verify the selected fire **ID/title**, coordinates, source timestamp and Prometheus observations in 3D match that event; geographic perimeter data may be absent depending on source.
3. Return with `← EarthNet` and verify the same event detail is selected on the globe.
4. Open 3D directly using the event-row `3D ↗` shortcut. Check an earthquake and volcano, not just wildfires.
5. Test a URL with a deliberately unknown `?id=nonexistent-source-event&from=pages`: the viewer must show a **missing event** warning, not a randomly selected fire.
6. On narrow/mobile layouts, check that the shortcut is tappable and the detail-panel launch does not block the close control.
7. Once the separate origin PR is manually deployed to the actual `earthnet.pythology.co.nz` host, repeat there and ensure `from=live` returns to that domain. The origin does **not** use GitHub Pages Lab's publish mechanism.

This feature does not create a wildfire active-front perimeter from an event point. NASA FEDS remains explicitly modelled research; source polygon absence is honestly labelled. No modification to EarthNet ingest, DNS, AWS, weather lab, Atlas, or other Pythology systems.
