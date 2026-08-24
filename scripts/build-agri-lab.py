#!/usr/bin/env python3
"""Build a public, non-client Agri snapshot for the GitHub Pages lab.

This intentionally uses a generic Manawatu test point and Open-Meteo. It must
never contain production farm coordinates, client names, access codes or private
field observations.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

# Generic public lab point only. Not a production farm location.
LAT = -40.35
LON = 175.62
TZ = "Pacific/Auckland"
OUT = Path("_site/data/agri_lab.json")


def finite(value, fallback=None):
    try:
        number = float(value)
        return number if math.isfinite(number) else fallback
    except (TypeError, ValueError):
        return fallback


def round1(value, fallback=None):
    number = finite(value, fallback)
    return round(number, 1) if number is not None else fallback


def fetch_weather():
    params = {
        "latitude": LAT,
        "longitude": LON,
        "timezone": TZ,
        "forecast_days": 4,
        "current": "temperature_2m,apparent_temperature,wind_speed_10m,wind_gusts_10m",
        "hourly": ",".join(
            [
                "temperature_2m",
                "dew_point_2m",
                "precipitation",
                "soil_temperature_0cm",
                "soil_moisture_0_to_1cm",
                "wind_speed_10m",
                "wind_gusts_10m",
                "et0_fao_evapotranspiration",
            ]
        ),
        "daily": "temperature_2m_max,temperature_2m_min",
    }
    url = "https://api.open-meteo.com/v1/forecast?" + urlencode(params)
    request = Request(url, headers={"User-Agent": "Pythology-Pages-Lab/1.0"})
    with urlopen(request, timeout=20) as response:  # nosec - fixed public provider
        return json.load(response)


def build_snapshot(weather):
    current = weather.get("current") or {}
    hourly = weather.get("hourly") or {}
    daily = weather.get("daily") or {}
    times = hourly.get("time") or []

    start = 0
    current_time = str(current.get("time") or "")
    if current_time and times:
        try:
            start = min(range(len(times)), key=lambda i: abs(datetime.fromisoformat(times[i]).timestamp() - datetime.fromisoformat(current_time).timestamp()))
        except Exception:
            start = 0
    end = min(start + 24, len(times))

    def slice_numbers(key):
        values = []
        for value in (hourly.get(key) or [])[start:end]:
            number = finite(value)
            if number is not None:
                values.append(number)
        return values

    precipitation = [finite(v, 0.0) or 0.0 for v in (hourly.get("precipitation") or [])[start:end]]
    winds = slice_numbers("wind_speed_10m")
    gusts = slice_numbers("wind_gusts_10m")
    soil_m = slice_numbers("soil_moisture_0_to_1cm")
    soil_t = slice_numbers("soil_temperature_0cm")
    et = slice_numbers("et0_fao_evapotranspiration")
    temps = slice_numbers("temperature_2m")
    dew = slice_numbers("dew_point_2m")

    rain_total = round(sum(precipitation), 1)
    max_wind = round(max(winds), 1) if winds else round1(current.get("wind_speed_10m"), 0)
    max_gust = round(max(gusts), 1) if gusts else round1(current.get("wind_gusts_10m"), 0)
    soil_pct = round((soil_m[0] if soil_m else 0.34) * 100, 1)
    soil_temp = round(sum(soil_t) / len(soil_t), 1) if soil_t else None
    et_total = round(sum(et), 2) if et else 0
    moisture_balance = round(rain_total - et_total, 1)
    temp_now = round1(current.get("temperature_2m"), temps[0] if temps else 12)
    feels = round1(current.get("apparent_temperature"), temp_now)
    dew_now = dew[0] if dew else (temp_now - 3 if temp_now is not None else 8)
    dew_spread = round((temp_now or 0) - dew_now, 1)
    spray = "Good" if max_wind < 16 and rain_total < 1 and dew_spread > 2 else "Fair" if max_wind < 24 and rain_total < 5 else "Poor"
    pugging = "HIGH" if soil_pct > 45 and rain_total > 8 else "Moderate" if soil_pct > 38 and rain_total > 4 else "Low"
    growth = round(max(5, 12 + max((temp_now or 10) - 10, 0) * 1.4), 1)

    low0 = finite((daily.get("temperature_2m_min") or [None])[0], None)
    frost_severity = "None"
    frost_min = None
    if low0 is not None and low0 < 2:
        frost_min = round(low0, 1)
        frost_severity = "SEVERE" if low0 < -2 else "Hard" if low0 < 0 else "Light"

    planner = []
    for day_index in range(3):
        s = min(start + day_index * 24, len(times))
        e = min(s + 24, len(times))
        day_rain = [finite(v, 0.0) or 0.0 for v in (hourly.get("precipitation") or [])[s:e]]
        day_wind = [finite(v) for v in (hourly.get("wind_speed_10m") or [])[s:e]]
        day_wind = [v for v in day_wind if v is not None]
        total_rain = round(sum(day_rain), 1)
        wind = round(max(day_wind), 0) if day_wind else None
        high = finite((daily.get("temperature_2m_max") or [None] * 4)[day_index], None)
        low = finite((daily.get("temperature_2m_min") or [None] * 4)[day_index], None)
        planner.append(
            {
                "day": ["Today", "Tomorrow", "Day 3"][day_index],
                "date": str((daily.get("time") or ["", "", ""])[day_index])[-5:],
                "rain": total_rain,
                "wind": wind,
                "spray": "✅" if (wind is not None and wind < 16 and total_rain < 0.2) else "❌",
                "graze": "✅" if total_rain < 4 else "⚠️" if total_rain < 8 else "❌",
                "pugging": "⚠️" if total_rain > 8 else "✅",
                "high": high,
                "low": low,
            }
        )

    map_state = "hold" if rain_total >= 30 or max_gust >= 65 else "caution" if frost_severity != "None" or rain_total >= 10 or max_gust >= 35 else "go"
    priority = "today" if map_state != "go" else "monitor"
    action = (
        "Use the lab forecast conservatively; current conditions cross a caution threshold."
        if map_state != "go"
        else "No lab weather hold is indicated at this generic test point."
    )

    generated = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    block = {
        "farm_id": "pages-lab-demo",
        "block_name": "Public Lab Block",
        "lat": LAT,
        "lon": LON,
        "weather_provider": "Open-Meteo",
        "data_quality": "public_lab",
        "temp_now": temp_now,
        "feels_like": feels,
        "high": finite((daily.get("temperature_2m_max") or [None])[0], None),
        "low": low0,
        "spray_adhesion": spray,
        "dew_spread": dew_spread,
        "frost_severity": frost_severity,
        "frost_min": frost_min,
        "frost_start": None,
        "frost_end": None,
        "rain_total_24h": rain_total,
        "rain_arrival": None,
        "rain_end": None,
        "peak_mm": round(max(precipitation), 1) if precipitation else 0,
        "max_wind": max_wind,
        "max_gust": max_gust,
        "soil_m": soil_pct,
        "soil_t": soil_temp,
        "est_growth": growth,
        "revenue": None,
        "moisture_balance": moisture_balance,
        "pugging_risk": pugging,
        "effluent_ok": True,
        "effluent_note": "Public lab demo only.",
        "planner": planner,
    }

    # A deliberately generic polygon around the public lab point. It is not a
    # copied or inferred production paddock boundary.
    d = 0.004
    paddocks = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"name": "Demo paddock", "block": "pages-lab-demo"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [LON - d, LAT - d],
                        [LON + d, LAT - d],
                        [LON + d, LAT + d],
                        [LON - d, LAT + d],
                        [LON - d, LAT - d],
                    ]],
                },
            }
        ],
    }

    return {
        "client": {
            "id": "pages-lab-demo",
            "name": "Pythology Public Agri Lab",
            "contact_name": "Demo operator",
            "region": "Manawatu-Whanganui (generic test point)",
            "role": "lab",
            "access_mode": "public_lab",
        },
        "data": {
            "client": {
                "name": "Pythology Public Agri Lab",
                "contact_name": "Demo operator",
                "region": "Manawatu-Whanganui (generic test point)",
            },
            "generated": generated,
            "generated_display": generated,
            "weather_provider": "Open-Meteo",
            "data_quality": "public_lab_non_client",
            "payout_kgms": None,
            "blocks": [block],
            "decision_intelligence": {
                "profile_context": {
                    "farm_type": "Public hosting lab — not a real farm",
                    "effective_hectares": None,
                    "farms": [],
                },
                "action_board": [
                    {
                        "id": "pages-lab-weather",
                        "priority": priority,
                        "category": "weather",
                        "block_id": "pages-lab-demo",
                        "block_name": "Public Lab Block",
                        "action": action,
                        "why": "Generated from Open-Meteo at a generic public test coordinate solely to exercise the Pages architecture.",
                        "evidence": [
                            f"24h rain: {rain_total} mm",
                            f"Maximum gust: {max_gust} km/h",
                            f"Soil moisture model: {soil_pct}%",
                        ],
                        "verification": None,
                    }
                ],
                "paddock_decisions": [
                    {
                        "block_id": "pages-lab-demo",
                        "block_name": "Public Lab Block",
                        "map_state": map_state,
                        "primary_action": action,
                        "reason": "Public lab forecast only; no client field observations are present.",
                        "decisions": {"graze": "GO" if map_state == "go" else "CAUTION", "spray": "LAB", "effluent": "N/A", "pugging": pugging},
                    }
                ],
                "value_tracking": {
                    "recommendations_this_cycle": 1,
                    "high_priority_actions": 1 if priority == "today" else 0,
                    "modelled_pasture_value_nzd_per_ha_day": None,
                    "configured_value_at_risk_nzd": None,
                    "verified_value_nzd": None,
                    "note": "Public Pages lab only. No commercial or client value claims are calculated here.",
                },
            },
        },
        "paddocks": paddocks,
    }


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    try:
        weather = fetch_weather()
        snapshot = build_snapshot(weather)
    except Exception as error:
        # Fail soft for the hosting experiment: a provider hiccup should not
        # prevent the rest of the site from deploying.
        generated = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        snapshot = {
            "client": {"id": "pages-lab-demo", "name": "Pythology Public Agri Lab", "contact_name": "Demo operator", "region": "Generic NZ test point", "role": "lab", "access_mode": "public_lab"},
            "data": {
                "client": {"name": "Pythology Public Agri Lab", "region": "Generic NZ test point"},
                "generated": generated,
                "generated_display": generated,
                "weather_provider": "Open-Meteo unavailable during build",
                "data_quality": "public_lab_provider_unavailable",
                "payout_kgms": None,
                "blocks": [],
                "decision_intelligence": {"profile_context": {"farm_type": "Public hosting lab", "effective_hectares": None, "farms": []}, "action_board": [], "paddock_decisions": [], "value_tracking": {"note": f"Lab weather build failed: {error}"}},
            },
            "paddocks": {"type": "FeatureCollection", "features": []},
        }
    OUT.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote safe public Agri snapshot to {OUT}")


if __name__ == "__main__":
    main()
