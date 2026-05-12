# TransitPulse — PRD

## Original Problem Statement
Crowd-sourced bus tracking web app. Users can add buses, assign routes, add stops, update live locations. Other users see updated locations in real time. Search by source/destination, show ETA, route, stops, status.

## Architecture (current MVP, post-refocus)
- **Backend:** Flask 3 + SQLite (`/app/backend/transitpulse.db`) + python-socketio (ASGI mode), wrapped with `asgiref.WsgiToAsgi` and run under the platform's locked uvicorn. SocketIO path `/api/socket.io`. Real-time emits from sync Flask handlers use `asyncio.run_coroutine_threadsafe` against the main loop captured in the lifespan handler.
- **Frontend:** React 19 + react-leaflet + socket.io-client + shadcn/ui + Tailwind. Map-as-hero Swiss high-contrast UI; floating glassmorphic panels.

## Endpoints
- `GET /api/stops`, `POST /api/stops`
- `GET /api/buses`, `POST /api/buses`, `GET /api/buses/<id>`
- `POST /api/buses/<id>/location` → emits SocketIO `bus_location`
- `POST /api/routes/search`
- SocketIO events broadcast to all clients: `bus_location`, `bus_added`

## What's Been Implemented (2026-05)
- 4 demo buses (M15, B25, M5, Q44) + 12 NYC stops seeded automatically on first run
- Full add-stop / add-bus (with ordered stop picker) / update-location flows accessible from the toolbar (no login)
- Real-time bus marker movement via WebSocket — any client posting `/buses/<id>/location` moves the marker on every open browser
- Search by source/destination → ETA, segment stops, status, animated route polyline
- Bus detail sheet: status, departure/arrival, full ordered stop list, live coordinates + "Update live location" CTA
- Dark/light mode toggle (CartoDB Positron / Dark Matter tiles)
- 20/20 backend tests passed (iteration_2)

## Out of Scope (deferred)
- Auth / user accounts
- AI ETA prediction, spam moderation, route recommendation
- Community reports & voting, trust scores, profile pages

## Backlog
- **P1:** Smooth marker interpolation between location pings; constrain `status` to enum on backend; return 201 on creates
- **P2:** Stop search disambiguation (multiple matches), driver-mode auto-broadcast via Geolocation watchPosition
- **P3:** Reintroduce auth, reports/voting, AI features once core flow is validated
