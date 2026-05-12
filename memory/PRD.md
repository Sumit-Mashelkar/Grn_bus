# TransitPulse — PRD

## Original Problem Statement
Crowd-sourced bus tracking web app. Users enter start/destination, see available buses on the route with live location, departure/arrival timings, ETA, and stop details. Users can add buses/stops, update live locations, and report delays/cancellations. Community voting validates updates and grows trust scores. Real-time map UI (Leaflet/Google Maps), dark/light mode, mobile-friendly. AI predicts ETA, detects spam, recommends best route.

## Architecture (as built)
- **Backend:** FastAPI (env-locked; Flask isn't possible on this platform's supervisor) + MongoDB (motor) + Emergent Google OAuth + Claude Sonnet 4.5 via `emergentintegrations`.
- **Frontend:** React 19 + react-leaflet + shadcn/ui + Tailwind. Map-centric "Map as Hero" Swiss High-Contrast design with floating glassmorphic panels.
- **Live updates:** 6-second polling (simpler than WS; same UX for MVP).

## User Personas
1. **Commuter** — Searches a route, sees live buses, gets AI-predicted ETA, reports issues.
2. **Contributor** — Adds new buses & stops, updates locations, helps validate community reports.
3. **Trusted user** — Earns trust score by submitting reports that get upvoted.

## Core Requirements
- Route search by stop name (origin + destination)
- Live bus markers on map, custom Swiss-high-contrast divIcons
- Bus detail sheet: timetable, stops, AI ETA prediction button
- Community reports with up/down voting + author trust score
- AI: spam detection on report creation, ETA prediction, best-bus recommendation
- Google OAuth sign-in (Emergent-managed)
- Dark/light mode toggle, mobile-responsive

## What's Been Implemented (2026-02)
- Backend `/api/auth/session|me|logout`, `/api/buses` (list/create/get/location-update), `/api/stops`, `/api/routes/search`, `/api/reports` + voting, `/api/ai/predict-eta`, `/api/ai/recommend-route`
- Seeded NYC demo: 12 stops + 4 buses (M15, B25, M5, Q44)
- React map view, search panel, route results with AI pick card, bus-detail sheet, add-bus / add-stop / report dialogs, user menu with Google sign-in
- 23/23 backend tests passing

## Prioritized Backlog
- **P0:** —
- **P1:** WebSocket-based real-time location push; route polyline based on real road network (OSRM)
- **P2:** Block self-vote on own reports; auth-gate stop/bus creation; rate-limit `/buses/{id}/location`; lifespan migration; split server.py into routers
- **P2:** Push notifications for delays on saved routes; user profile page with submitted reports & trust history
