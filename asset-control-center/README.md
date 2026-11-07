# Asset Command Center

A sci‑fi style (Iron Man JARVIS / Star Trek LCARS) control hub for your assets (yachts, expedition vehicles, houses, aircraft) and the equipment kept on them, with a logistics planner for missions.

It's a standalone app with no build step and no server. Open `index.html` in a browser, or host the folder anywhere that serves static files (GitHub Pages, Netlify, S3).

```bash
cd asset-control-center
python3 -m http.server 8080   # then open http://localhost:8080
```

## Views

| View | What it does |
|------|--------------|
| **Bridge** | Readiness stats, live tactical map, mission queue with T‑minus countdowns, logistics alerts, fleet status |
| **Map** | Full-screen world map with Tactical (dark), Satellite and Street basemaps and an OpenSeaMap sea-marks overlay. Assets and mission targets have pulsing markers, and dashed route lines run from each asset to its mission target (red when there's a conflict). Click a marker for status, equipment count and weather |
| **Assets** | One card per asset: status, fuel/battery/water (or heating/storage) gauges, location, service date, next mission, everything aboard |
| **Equipment** | Searchable manifest: where every item is, its condition, and which mission has it reserved. Move items between assets one at a time or in bulk |
| **Missions** | Plan trips: dates, assets, equipment load-out, crew, route, pre-launch checklist, and a **day-by-day weather forecast at the target** (temperature, gusts, rain, and wave height for yacht missions). Shows conflicts and the transfers you need, and has a one-click "Execute transfers" |
| **Timeline** | Gantt view of every asset for the next 30–180 days. Conflicting missions show in red, service dates as ⚙ |
| **System** | Export/import JSON backups, load demo data, wipe data, and the captain's log (audit trail of every change and transfer) |

## Logistics engine

Alerts are computed automatically:

- **Double-booking**: the same asset or equipment item is assigned to overlapping missions
- **Transfers required**: equipment needed for a mission is currently stowed on a different asset (escalates to critical inside 7 days)
- **Equipment condition**: a mission needs items flagged *needs service* or *damaged*
- **Asset readiness**: an asset in maintenance or offline is assigned to a mission, or its service date falls during one
- **Service due/overdue** and **low fuel/battery/water** (< 25 %)

## Live weather and maps

- **Weather** comes from [Open-Meteo](https://open-meteo.com) (free, no API key): the 16-day forecast plus the marine API for wave height. All assets and mission targets are fetched in one batched request, cached for an hour, and refreshed every 10 minutes when stale. Click the `WX` indicator in the header to force a refresh.
  - Missions further out than 16 days show the date their forecast becomes available.
  - Weather alerts appear in Logistics alerts: gusts ≥ 50 km/h (critical ≥ 75), waves ≥ 2.5 m on yacht missions (critical ≥ 4 m), rain ≥ 20 mm/day, thunderstorms, heat ≥ 40 °C, and cold ≤ −15 °C.
  - Asset cards show current conditions at the asset's location.
- **Setting positions:** in the asset and mission forms, **Locate** geocodes the location (or the last stop of the route) using Open-Meteo geocoding. You can also click or drag the marker on the mini-map.
- **Maps** use [Leaflet](https://leafletjs.com) 1.9.4, bundled in `vendor/leaflet` (BSD-2 licence). Tiles come from CARTO, Esri, OpenStreetMap and OpenSeaMap. Without a network connection the app still runs: the map has no tiles and the weather shows `WX OFFLINE`.

## Command console

Type into the `>_` bar, or press `/` to focus it. `computer,` and `jarvis,` prefixes are accepted.

- `status` gives a summary report
- `red alert` lists critical alerts
- `weather` gives a forecast briefing for every active mission
- `where is starlink` or `find dive` searches equipment, assets and missions
- `go map` or `go timeline` switches views
- `new mission`, `new asset`, `new item` open forms
- `help`

## Data

Data is stored in the browser's `localStorage` (key `asset-command-center.v1`). Use **System → Export JSON** to back up or move to another device. Demo data loads on first run. Use **Wipe all data** to start fresh with your own assets.
