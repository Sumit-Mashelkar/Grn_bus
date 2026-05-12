# TransitPulse — PRD

## Original Problem Statement
Crowd-sourced bus tracking web app. Users can add buses with a route of stops, add stops, update live bus locations. Other users see updated locations in real time on a map. Search by source/destination, show ETA, route, stops, status. Mobile-friendly, map-first.

## Architecture
- **Backend:** Flask 3 + SQLite (`/app/backend/transitpulse.db`) + python-socketio (ASGI) wrapped with `asgiref.WsgiToAsgi`; runs under platform-locked uvicorn. SocketIO path `/api/socket.io`. Cross-thread emits use `asyncio.run_coroutine_threadsafe` against the loop captured at lifespan startup.
- **Frontend:** React 19 + react-leaflet + socket.io-client + shadcn/ui + Tailwind. Map-as-hero design with compact floating UI.

## Data Model
- `stops(stop_id, name, lat, lng, created_at)`
- `buses(bus_id, number, name, direction, departure_time, arrival_time, status, current_lat, current_lng, last_update, created_at)`
- `bus_stops(bus_id, stop_id, position)` — ordered route

`status` enum (enforced server-side): `running | delayed | arriving | cancelled`

## Endpoints
- `GET/POST /api/stops`
- `GET/POST /api/buses`, `GET /api/buses/<id>`
- `POST /api/buses/<id>/location` → emits SocketIO `bus_location`
- `POST /api/routes/search`
- SocketIO events: `bus_location`, `bus_added`

## Implemented (2026-05, iteration 3)
- Compact collapsible floating search bar (no more giant left panel) — opens on tap, collapses with a chevron
- Trimmed top toolbar: TransitPulse logo + LIVE dot · `Update` button (opens BusPicker → UpdateLocationDialog) · `Add` dropdown (Bus / Stop) · Theme toggle
- New Add-Bus flow is **stop-based** — Source select, Destination select, ordered Intermediate stops, Direction text, Status enum, optional **Share my live GPS** button (posts initial location via geolocation)
- Update-Location dialog: "Use my current location" geolocation button + manual lat/lng, status enum
- Real-time bus marker updates over WebSocket (every browser sees the move)
- Route polyline auto-generated from selected stops; A/B endpoint markers for the search segment
- ETA penalties: delayed +8 min, cancelled +30 min, arriving 0
- Dark/light mode toggle (CartoDB Positron / Dark Matter)
- 29/29 backend tests passing; both minor findings (duplicate-stop validator, status-enum guard) now fixed in code

## Out of Scope (deferred)
- Auth / user accounts
- AI features (ETA prediction, spam moderation, route recommendation)
- Community reports, voting, trust scores, profile pages

## Backlog
- **P1:** Smooth marker interpolation between location pings
- **P2:** Driver-mode `watchPosition` auto-broadcast every ~10s
- **P2:** Stop search disambiguation (multiple substring matches)
- **P3:** Reintroduce auth → reports/voting → AI
