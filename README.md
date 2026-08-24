# Pythology Pages Lab

Public, non-production test bed for measuring whether Pythology can move most frontend delivery away from metered hosting.

## Intended lab architecture

- GitHub Pages: static website and application frontends.
- GitHub Actions + committed JSON snapshots: EarthNet, Verry Elleegant and slower-moving Agri intelligence.
- VPS read-only market gateway: optional high-frequency Cerberus snapshots / server-sent events if GitHub Actions refresh is too slow.
- Netlify production remains untouched during testing.

## Safety boundary

Never commit private farm data, API keys, passwords, tokens, paid-provider credentials or production write endpoints to this public repository.

The Cerberus VPS gateway, if enabled, should keep provider credentials server-side and expose only sanitized read-only market/catalyst snapshots over HTTPS with tightly scoped CORS.
