# Pythology Pages Lab

Public, non-production test bed for measuring whether Pythology can move most frontend delivery away from metered hosting.

## Current lab layout

- Main Pythology website: mirrored public static frontend.
- EarthNet: operational browser UI plus read-only JSON snapshots.
- Agri: production frontend running against a safe generic Open-Meteo lab snapshot; no real farm data and no write APIs.
- Verry Elleegant: mirrored static frontend with read-only API snapshots.
- Cerberus: deliberately excluded for now. The intended next experiment is a GitHub Pages frontend backed by a small read-only VPS market gateway for faster Bat Signals.
- Netlify production remains untouched during testing.

Expected GitHub Pages paths once Pages is enabled for this repository:

- `/pythology-pages-lab/`
- `/pythology-pages-lab/earthnet-v3.html`
- `/pythology-pages-lab/agri-portal.html`
- `/pythology-pages-lab/verry-elleegant/`

## Safety boundary

Never commit private farm data, API keys, passwords, tokens, paid-provider credentials or production write endpoints to this public repository.

The build fails closed if obvious secret material is detected. The Agri lab uses a generic public test coordinate only and production feedback/application writes are blocked. Cerberus provider credentials must remain server-side when the VPS gateway is added.
