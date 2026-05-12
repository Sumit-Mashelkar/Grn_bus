"""TransitPulse — Flask + SQLite + python-socketio (ASGI).

Platform note: supervisor runs `uvicorn server:app`. We expose `app` as a
`socketio.ASGIApp` wrapping a WSGI Flask app via `asgiref.WsgiToAsgi`, so we
get real Flask routes + real-time SocketIO under the locked uvicorn process.
"""
from __future__ import annotations

import asyncio
import os
import sqlite3
import uuid
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from flask import Flask, jsonify, request, g
from flask_cors import CORS
from asgiref.wsgi import WsgiToAsgi
import socketio
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

DB_PATH = ROOT_DIR / "transitpulse.db"

# ---------- Flask app ----------
flask_app = Flask(__name__)
CORS(flask_app, supports_credentials=True, resources={r"/api/*": {"origins": "*"}})


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ---------- DB helpers ----------
def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH, check_same_thread=False)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@flask_app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS stops (
            stop_id TEXT PRIMARY KEY,
            name    TEXT NOT NULL,
            lat     REAL NOT NULL,
            lng     REAL NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS buses (
            bus_id        TEXT PRIMARY KEY,
            number        TEXT NOT NULL,
            name          TEXT NOT NULL,
            direction     TEXT,
            departure_time TEXT NOT NULL DEFAULT '06:00',
            arrival_time   TEXT NOT NULL DEFAULT '22:00',
            status        TEXT NOT NULL DEFAULT 'running',
            current_lat   REAL,
            current_lng   REAL,
            last_update   TEXT,
            created_at    TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS bus_stops (
            bus_id    TEXT NOT NULL,
            stop_id   TEXT NOT NULL,
            position  INTEGER NOT NULL,
            PRIMARY KEY (bus_id, position),
            FOREIGN KEY (bus_id) REFERENCES buses(bus_id) ON DELETE CASCADE,
            FOREIGN KEY (stop_id) REFERENCES stops(stop_id)
        );
        """
    )
    conn.commit()
    # Seed once if empty
    cur.execute("SELECT COUNT(*) FROM stops")
    if cur.fetchone()[0] == 0:
        seed = [
            ("Central Station", 40.7527, -73.9772),
            ("Times Square", 40.7580, -73.9855),
            ("Union Square", 40.7359, -73.9911),
            ("Wall Street", 40.7074, -74.0113),
            ("Brooklyn Bridge", 40.7061, -73.9969),
            ("Empire State", 40.7484, -73.9857),
            ("Columbus Circle", 40.7681, -73.9819),
            ("Lincoln Center", 40.7725, -73.9835),
            ("Penn Station", 40.7506, -73.9935),
            ("Bryant Park", 40.7536, -73.9832),
            ("Harlem Plaza", 40.8116, -73.9465),
            ("Grand Central", 40.7527, -73.9772),
        ]
        stop_ids = {}
        for name, lat, lng in seed:
            sid = uid("stop")
            stop_ids[name] = sid
            cur.execute(
                "INSERT INTO stops (stop_id, name, lat, lng, created_at) VALUES (?,?,?,?,?)",
                (sid, name, lat, lng, now_iso()),
            )
        demo_buses = [
            ("M15", "Downtown Express",
             ["Central Station", "Times Square", "Empire State", "Union Square", "Wall Street"],
             40.7580, -73.9855),
            ("B25", "Brooklyn Loop",
             ["Wall Street", "Brooklyn Bridge", "Union Square", "Bryant Park"],
             40.7074, -74.0113),
            ("M5", "Uptown Cruiser",
             ["Penn Station", "Bryant Park", "Grand Central", "Columbus Circle", "Lincoln Center", "Harlem Plaza"],
             40.7681, -73.9819),
            ("Q44", "Midtown Shuttle",
             ["Times Square", "Bryant Park", "Grand Central", "Empire State"],
             40.7536, -73.9832),
        ]
        for number, bname, stops, lat, lng in demo_buses:
            bid = uid("bus")
            cur.execute(
                "INSERT INTO buses (bus_id, number, name, current_lat, current_lng, last_update, created_at)"
                " VALUES (?,?,?,?,?,?,?)",
                (bid, number, bname, lat, lng, now_iso(), now_iso()),
            )
            for pos, sname in enumerate(stops):
                cur.execute(
                    "INSERT INTO bus_stops (bus_id, stop_id, position) VALUES (?,?,?)",
                    (bid, stop_ids[sname], pos),
                )
        conn.commit()
    conn.close()


init_db()


# ---------- Serializers ----------
def stop_row(r: sqlite3.Row) -> dict:
    return {"stop_id": r["stop_id"], "name": r["name"], "lat": r["lat"], "lng": r["lng"]}


def bus_row(r: sqlite3.Row, db: sqlite3.Connection, with_stops: bool = False) -> dict:
    out = {
        "bus_id": r["bus_id"],
        "number": r["number"],
        "name": r["name"],
        "direction": r["direction"] if "direction" in r.keys() else None,
        "departure_time": r["departure_time"],
        "arrival_time": r["arrival_time"],
        "status": r["status"],
        "current_lat": r["current_lat"],
        "current_lng": r["current_lng"],
        "last_update": r["last_update"],
    }
    if with_stops:
        rows = db.execute(
            "SELECT s.stop_id, s.name, s.lat, s.lng FROM bus_stops bs "
            "JOIN stops s ON s.stop_id = bs.stop_id WHERE bs.bus_id = ? "
            "ORDER BY bs.position",
            (r["bus_id"],),
        ).fetchall()
        out["stops"] = [stop_row(x) for x in rows]
    return out


def haversine(lat1, lng1, lat2, lng2) -> float:
    R = 6371.0
    dl = math.radians(lat2 - lat1)
    dlg = math.radians(lng2 - lng1)
    a = (math.sin(dl / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlg / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


VALID_STATUSES = {"running", "delayed", "arriving", "cancelled"}


# ---------- Routes ----------
@flask_app.get("/api/")
def root():
    return jsonify({"app": "TransitPulse", "status": "ok"})


@flask_app.get("/api/stops")
def list_stops():
    rows = get_db().execute("SELECT * FROM stops ORDER BY name").fetchall()
    return jsonify([stop_row(r) for r in rows])


@flask_app.post("/api/stops")
def create_stop():
    body = request.get_json(force=True, silent=True) or {}
    name, lat, lng = body.get("name"), body.get("lat"), body.get("lng")
    if not name or lat is None or lng is None:
        return jsonify({"detail": "name, lat, lng required"}), 400
    sid = uid("stop")
    db = get_db()
    db.execute(
        "INSERT INTO stops (stop_id, name, lat, lng, created_at) VALUES (?,?,?,?,?)",
        (sid, name.strip(), float(lat), float(lng), now_iso()),
    )
    db.commit()
    return jsonify({"stop_id": sid, "name": name, "lat": float(lat), "lng": float(lng)})


@flask_app.get("/api/buses")
def list_buses():
    db = get_db()
    rows = db.execute("SELECT * FROM buses ORDER BY number").fetchall()
    return jsonify([bus_row(r, db) for r in rows])


@flask_app.get("/api/buses/<bus_id>")
def get_bus(bus_id):
    db = get_db()
    r = db.execute("SELECT * FROM buses WHERE bus_id = ?", (bus_id,)).fetchone()
    if not r:
        return jsonify({"detail": "Bus not found"}), 404
    return jsonify(bus_row(r, db, with_stops=True))


@flask_app.post("/api/buses")
def create_bus():
    body = request.get_json(force=True, silent=True) or {}
    number = (body.get("number") or "").strip()
    name = (body.get("name") or "").strip()
    stops = body.get("stops") or []
    if not number or not name or len(stops) < 2:
        return jsonify({"detail": "number, name, and at least 2 stops required"}), 400
    db = get_db()
    # validate stops exist (use set comparison so duplicates aren't falsely flagged)
    placeholders = ",".join("?" * len(stops))
    found_ids = {r["stop_id"] for r in db.execute(
        f"SELECT stop_id FROM stops WHERE stop_id IN ({placeholders})", stops
    ).fetchall()}
    missing = set(stops) - found_ids
    if missing:
        return jsonify({"detail": f"unknown stops: {sorted(missing)}"}), 400

    status = body.get("status", "running")
    if status not in VALID_STATUSES:
        return jsonify({"detail": f"status must be one of {sorted(VALID_STATUSES)}"}), 400

    bid = uid("bus")
    db.execute(
        "INSERT INTO buses (bus_id, number, name, direction, departure_time, arrival_time, status, created_at)"
        " VALUES (?,?,?,?,?,?,?,?)",
        (bid, number, name,
         (body.get("direction") or "").strip() or None,
         body.get("departure_time", "06:00"),
         body.get("arrival_time", "22:00"),
         status,
         now_iso()),
    )
    for pos, sid in enumerate(stops):
        db.execute("INSERT INTO bus_stops (bus_id, stop_id, position) VALUES (?,?,?)", (bid, sid, pos))
    db.commit()
    r = db.execute("SELECT * FROM buses WHERE bus_id = ?", (bid,)).fetchone()
    new_bus = bus_row(r, db, with_stops=True)
    # broadcast new bus to all clients
    broadcast("bus_added", new_bus)
    return jsonify(new_bus)


@flask_app.post("/api/buses/<bus_id>/location")
def update_location(bus_id):
    body = request.get_json(force=True, silent=True) or {}
    lat, lng = body.get("lat"), body.get("lng")
    status = body.get("status")  # optional
    if lat is None or lng is None:
        return jsonify({"detail": "lat and lng required"}), 400
    if status is not None and status not in VALID_STATUSES:
        return jsonify({"detail": f"status must be one of {sorted(VALID_STATUSES)}"}), 400
    db = get_db()
    r = db.execute("SELECT * FROM buses WHERE bus_id = ?", (bus_id,)).fetchone()
    if not r:
        return jsonify({"detail": "Bus not found"}), 404
    ts = now_iso()
    if status:
        db.execute(
            "UPDATE buses SET current_lat=?, current_lng=?, last_update=?, status=? WHERE bus_id=?",
            (float(lat), float(lng), ts, status, bus_id),
        )
    else:
        db.execute(
            "UPDATE buses SET current_lat=?, current_lng=?, last_update=? WHERE bus_id=?",
            (float(lat), float(lng), ts, bus_id),
        )
    db.commit()
    payload = {
        "bus_id": bus_id,
        "number": r["number"],
        "name": r["name"],
        "lat": float(lat),
        "lng": float(lng),
        "status": status or r["status"],
        "last_update": ts,
    }
    # Broadcast in real time to all connected clients
    broadcast("bus_location", payload)
    return jsonify(payload)


@flask_app.post("/api/routes/search")
def search_routes():
    body = request.get_json(force=True, silent=True) or {}
    origin = (body.get("origin") or "").strip().lower()
    dest = (body.get("destination") or "").strip().lower()
    if not origin or not dest:
        return jsonify({"detail": "origin and destination required"}), 400
    db = get_db()
    stops = {r["stop_id"]: dict(r) for r in db.execute("SELECT * FROM stops").fetchall()}

    def match(query: str) -> Optional[dict]:
        for s in stops.values():
            if query in s["name"].lower():
                return s
        return None

    o_stop = match(origin)
    d_stop = match(dest)
    if not o_stop or not d_stop:
        return jsonify({
            "origin_stop": stop_row(o_stop) if o_stop else None,
            "destination_stop": stop_row(d_stop) if d_stop else None,
            "buses": [],
        })

    bus_rows = db.execute("SELECT * FROM buses").fetchall()
    results = []
    for b in bus_rows:
        ordered = db.execute(
            "SELECT stop_id FROM bus_stops WHERE bus_id=? ORDER BY position",
            (b["bus_id"],),
        ).fetchall()
        ids = [r["stop_id"] for r in ordered]
        if o_stop["stop_id"] not in ids or d_stop["stop_id"] not in ids:
            continue
        oi = ids.index(o_stop["stop_id"])
        di = ids.index(d_stop["stop_id"])
        if oi >= di:
            continue
        segment = [stops[ids[i]] for i in range(oi, di + 1)]
        dist = sum(
            haversine(segment[i]["lat"], segment[i]["lng"], segment[i + 1]["lat"], segment[i + 1]["lng"])
            for i in range(len(segment) - 1)
        )
        eta_min = max(1, int(dist / 25 * 60) + 2)  # 25 km/h avg
        if b["status"] == "delayed":
            eta_min += 8
        elif b["status"] == "cancelled":
            eta_min += 30
        bus = bus_row(b, db)
        bus["eta_min"] = eta_min
        bus["from_stop"] = stop_row(o_stop)
        bus["to_stop"] = stop_row(d_stop)
        bus["segment_stops"] = [stop_row(s) for s in segment]
        results.append(bus)
    results.sort(key=lambda x: x["eta_min"])
    return jsonify({
        "origin_stop": stop_row(o_stop),
        "destination_stop": stop_row(d_stop),
        "buses": results,
    })


# ---------- SocketIO (ASGI) ----------
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

# Captured at lifespan startup so sync Flask handlers (running in worker threads
# via WsgiToAsgi) can schedule emits on the main asyncio loop.
_main_loop: Optional[asyncio.AbstractEventLoop] = None


@sio.event
async def connect(sid, _environ):
    print(f"[socketio] client connected: {sid}")


@sio.event
async def disconnect(sid):
    print(f"[socketio] client disconnected: {sid}")


def broadcast(event: str, payload: dict) -> None:
    """Thread-safe broadcast from sync Flask handlers."""
    if _main_loop is None:
        return
    asyncio.run_coroutine_threadsafe(sio.emit(event, payload), _main_loop)


# Build the ASGI app: socketio routes /api/socket.io/*, Flask handles the rest.
# Lifespan handler captures the running event loop so we can emit from threads.
_socketio_asgi = socketio.ASGIApp(
    sio, other_asgi_app=WsgiToAsgi(flask_app), socketio_path="/api/socket.io"
)


async def app(scope, receive, send):
    if scope["type"] == "lifespan":
        global _main_loop
        while True:
            message = await receive()
            if message["type"] == "lifespan.startup":
                _main_loop = asyncio.get_running_loop()
                await send({"type": "lifespan.startup.complete"})
            elif message["type"] == "lifespan.shutdown":
                await send({"type": "lifespan.shutdown.complete"})
                return
    else:
        await _socketio_asgi(scope, receive, send)
