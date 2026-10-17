#!/usr/bin/env python3
"""Publish a narrow, public-safe Weather V5 screening summary (no raw events).

Runs outside the website from the Pythology VPS, after V5 writes latest_v5.json.
Default mode only previews the sanitized payload. --publish sends the safe
projection to the existing GitHub Pages data path. It does not start detectors,
create tasks, send Slack alerts, or expose VPS file paths or credentials.
"""
from __future__ import annotations

import argparse
import base64
from datetime import UTC, datetime, timedelta
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

SCHEMA = "pythology.weather-public-screening.v1"
DEFAULT_SOURCE = Path(r"C:\Pythology\prometheus-mdra\runtime\weather-research-v3\latest_v5.json")
PUBLIC_PATH = "data/prometheus_weather_research.json"
ALLOWED_STATUSES = {
    "screening_only", "observational_context", "insufficient_history",
    "insufficient_contemporaneous_history", "degraded", "unavailable",
}


def _nonnegative(value: object) -> int | None:
    if type(value) is bool:
        return None
    try:
        n = int(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return n if 0 <= n <= 10_000_000 else None


def _status(value: object) -> str:
    text = str(value or "unavailable").strip().lower()
    return text if text in ALLOWED_STATUSES else "unavailable"


def _timestamp(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("Source generated_at must be a timestamp")
    try:
        date = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Invalid generated_at timestamp") from exc
    if date.tzinfo is None:
        raise ValueError("generated_at must include a timezone")
    age = datetime.now(UTC) - date.astimezone(UTC)
    if age < -timedelta(minutes=10) or age > timedelta(hours=24):
        raise ValueError("Source snapshot is stale or future-dated; refusing to publish")
    return date.astimezone(UTC).isoformat(timespec="seconds")


def sanitize(source: dict) -> dict:
    if not isinstance(source, dict):
        raise ValueError("Weather report is not a JSON object")
    global_state = source.get("global") if isinstance(source.get("global"), dict) else {}
    nz_state = source.get("new_zealand") if isinstance(source.get("new_zealand"), dict) else {}
    if not global_state and not nz_state:
        raise ValueError("Missing V5 global and NZ fields")
    return {
        "schema": SCHEMA,
        "generated_at": _timestamp(source.get("generated_at")),
        "global": {
            "status": _status(global_state.get("status")),
            "source_event_rows": _nonnegative(global_state.get("source_event_rows")),
            "matched_rows": _nonnegative(global_state.get("matched_rows")),
            "unique_signals": _nonnegative(global_state.get("unique_signals")),
            "possible_upstream_truncation": (
                global_state.get("possible_upstream_truncation")
                if type(global_state.get("possible_upstream_truncation")) is bool else None
            ),
        },
        "new_zealand": {
            "status": _status(nz_state.get("status")),
            "existing_atlas_watch_count": _nonnegative(nz_state.get("existing_atlas_watch_count")),
            "exploratory_context_count": _nonnegative(nz_state.get("exploratory_context_count")),
        },
        "claim_boundary": (
            "Public-safe research screening; candidate patterns are not "
            "validated event predictions or official weather warnings."
        ),
    }


def _github(url: str, token: str, *, method: str = "GET", payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(url, data=data, method=method, headers={
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "PythologyWeatherResearchPublisher/1.0",
    })
    try:
        with urlopen(request, timeout=35) as reply:
            return json.loads(reply.read().decode("utf-8"))
    except HTTPError as exc:
        raise RuntimeError("GitHub publication failed with HTTP " + str(exc.code)) from exc


def _load_token(env_file: Path | None) -> str:
    token = os.getenv("WEBSITE_PUBLISH_TOKEN", "").strip()
    if token or env_file is None or not env_file.is_file():
        return token
    for line in env_file.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() == "WEBSITE_PUBLISH_TOKEN":
            return value.strip().strip('"').strip("'")
    return ""


def publish(summary: dict, *, token: str, repo: str, branch: str) -> str:
    url = ("https://api.github.com/repos/" + repo + "/contents/" +
           PUBLIC_PATH + "?ref=" + quote(branch, safe=""))
    old = _github(url, token)
    if not isinstance(old.get("sha"), str):
        raise RuntimeError("Existing public V5 projection SHA was not returned")
    current = old.get("content", "").replace("\n", "")
    if old.get("encoding") == "base64":
        try:
            data = json.loads(base64.b64decode(current).decode("utf-8"))
            if data == summary:
                return "unchanged"
        except (ValueError, UnicodeDecodeError):
            pass
    payload = json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    _github("https://api.github.com/repos/" + repo + "/contents/" + PUBLIC_PATH,
            token, method="PUT", payload={
                "message": "Weather V5 sanitized research snapshot",
                "branch": branch, "sha": old["sha"],
                "content": base64.b64encode(payload.encode("utf-8")).decode("ascii"),
            })
    return "published"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, help="Optionally save sanitized JSON locally")
    parser.add_argument("--publish", action="store_true", help="Commit to the Pages Lab public data path")
    parser.add_argument("--env-file", type=Path, default=Path(r"C:\ProgramData\Pythology\earthnet-secrets.env"))
    parser.add_argument("--repository", default="PythologyIntelligence/pythology-pages-lab")
    parser.add_argument("--branch", default="main")
    args = parser.parse_args()

    summary = sanitize(json.loads(args.source.read_text(encoding="utf-8-sig")))
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    if not args.publish:
        print(json.dumps(summary, indent=2))
        print("DRY RUN ONLY: no website update, no Slack message.")
        return 0
    token = _load_token(args.env_file)
    if not token:
        raise RuntimeError("WEBSITE_PUBLISH_TOKEN missing; no publication attempted")
    if args.repository != "PythologyIntelligence/pythology-pages-lab":
        raise ValueError("Publication restricted to the configured Pythology Pages Lab repository")
    print("Weather V5 public projection:", publish(summary, token=token, repo=args.repository, branch=args.branch))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
