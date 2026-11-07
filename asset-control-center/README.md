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
| **Bridge** | Readiness stats, tactical map of asset and mission positions, mission queue with T‑minus countdowns, logistics alerts, fleet status |
| **Assets** | One card per asset: status, fuel/battery/water (or heating/storage) gauges, location, service date, next mission, everything aboard |
| **Equipment** | Searchable manifest: where every item is, its condition, and which mission has it reserved. Move items between assets one at a time or in bulk |
| **Missions** | Plan trips: dates, assets, equipment load-out, crew, route, pre-launch checklist. Shows conflicts and the transfers you need, and has a one-click "Execute transfers" |
| **Timeline** | Gantt view of every asset for the next 30–180 days. Conflicting missions show in red, service dates as ⚙ |
| **System** | Export/import JSON backups, load demo data, wipe data, and the captain's log (audit trail of every change and transfer) |

## Logistics engine

Alerts are computed automatically:

- **Double-booking**: the same asset or equipment item is assigned to overlapping missions
- **Transfers required**: equipment needed for a mission is currently stowed on a different asset (escalates to critical inside 7 days)
- **Equipment condition**: a mission needs items flagged *needs service* or *damaged*
- **Asset readiness**: an asset in maintenance or offline is assigned to a mission, or its service date falls during one
- **Service due/overdue** and **low fuel/battery/water** (< 25 %)

## Command console

Type into the `>_` bar, or press `/` to focus it. `computer,` and `jarvis,` prefixes are accepted.

- `status` gives a summary report
- `red alert` lists critical alerts
- `where is starlink` or `find dive` searches equipment, assets and missions
- `go timeline` switches views
- `new mission`, `new asset`, `new item` open forms
- `help`

## Data

Data is stored in the browser's `localStorage` (key `asset-command-center.v1`). Use **System → Export JSON** to back up or move to another device. Demo data loads on first run. Use **Wipe all data** to start fresh with your own assets.
