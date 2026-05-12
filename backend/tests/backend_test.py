"""TransitPulse backend tests — Flask + SQLite + python-socketio.

Covers:
- REST endpoints: stops, buses, location updates, route search
- Validation: missing/invalid payloads, <2 stops, unknown stop_id, unknown bus
- SocketIO real-time events: bus_location, bus_added on /api/socket.io
"""
from __future__ import annotations

import asyncio
import os
import pytest
import requests
import socketio

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.strip().split("=", 1)[1]
BASE_URL = (BASE_URL or "").rstrip("/")


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def stops(api):
    r = api.get(f"{BASE_URL}/api/stops", timeout=10)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def buses(api):
    r = api.get(f"{BASE_URL}/api/buses", timeout=10)
    assert r.status_code == 200
    return r.json()


# ---------- Health ----------
class TestHealth:
    def test_root(self, api):
        r = api.get(f"{BASE_URL}/api/", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data.get("app") == "TransitPulse"
        assert data.get("status") == "ok"


# ---------- Stops ----------
class TestStops:
    def test_list_seeded_stops(self, stops):
        assert isinstance(stops, list)
        assert len(stops) >= 12
        names = [s["name"] for s in stops]
        assert names == sorted(names), "stops must be ordered by name"
        for s in stops:
            assert {"stop_id", "name", "lat", "lng"} <= set(s.keys())
            assert isinstance(s["lat"], (int, float))
            assert isinstance(s["lng"], (int, float))

    def test_create_stop_success(self, api):
        payload = {"name": "TEST_QA_Stop", "lat": 40.7000, "lng": -74.0000}
        r = api.post(f"{BASE_URL}/api/stops", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "TEST_QA_Stop"
        assert data["lat"] == 40.7
        assert data["lng"] == -74.0
        assert data["stop_id"].startswith("stop_")
        listed = api.get(f"{BASE_URL}/api/stops", timeout=10).json()
        assert any(s["stop_id"] == data["stop_id"] for s in listed)

    def test_create_stop_missing_fields(self, api):
        r = api.post(f"{BASE_URL}/api/stops", json={"name": "Only Name"}, timeout=10)
        assert r.status_code == 400


# ---------- Buses ----------
class TestBuses:
    def test_seeded_buses(self, buses):
        # Iteration 3: status default is 'running' (not 'on_time'); direction defaults to null
        assert isinstance(buses, list)
        numbers = [b["number"] for b in buses]
        assert numbers == sorted(numbers), "buses must be ordered by number"
        seed_numbers = {"M15", "B25", "M5", "Q44"}
        assert seed_numbers <= set(numbers)
        # Only validate seed buses (DB may also contain TEST_* leftovers from previous runs)
        for b in buses:
            if b["number"] not in seed_numbers:
                continue
            assert b["current_lat"] is not None
            assert b["current_lng"] is not None
            # Old 'on_time' status MUST NOT appear in seeded data anymore
            assert b["status"] != "on_time", f"Seed bus {b['number']} still has legacy status 'on_time'"
            assert b["status"] == "running", f"Seed bus {b['number']} expected status='running', got {b['status']}"
            assert "direction" in b, "GET /api/buses must include 'direction' field"
            assert b["direction"] is None, f"Seed bus {b['number']} direction should default to null"

    def test_get_bus_includes_ordered_stops(self, api, buses):
        m15 = next(b for b in buses if b["number"] == "M15")
        r = api.get(f"{BASE_URL}/api/buses/{m15['bus_id']}", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "stops" in data and isinstance(data["stops"], list)
        expected = ["Central Station", "Times Square", "Empire State", "Union Square", "Wall Street"]
        actual_names = [s["name"] for s in data["stops"]]
        assert actual_names == expected, f"Expected {expected}, got {actual_names}"

    def test_get_unknown_bus_404(self, api):
        r = api.get(f"{BASE_URL}/api/buses/bus_doesnotexist", timeout=10)
        assert r.status_code == 404

    def test_create_bus_success(self, api, stops):
        sids = [s["stop_id"] for s in stops[:3]]
        payload = {
            "number": "TEST_X1",
            "name": "TEST Express",
            "direction": "Northbound",
            "stops": sids,
            "departure_time": "07:00",
            "arrival_time": "21:00",
            "status": "running",
        }
        r = api.post(f"{BASE_URL}/api/buses", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["number"] == "TEST_X1"
        assert data["name"] == "TEST Express"
        assert data["direction"] == "Northbound"
        assert data["status"] == "running"
        assert data["departure_time"] == "07:00"
        assert data["arrival_time"] == "21:00"
        assert "stops" in data and len(data["stops"]) == 3
        assert [s["stop_id"] for s in data["stops"]] == sids
        g = api.get(f"{BASE_URL}/api/buses/{data['bus_id']}", timeout=10).json()
        assert g["number"] == "TEST_X1"
        assert g["direction"] == "Northbound"

    def test_create_bus_direction_omitted_defaults_to_null(self, api, stops):
        # Iteration 3: optional 'direction' field; omitted -> null
        sids = [s["stop_id"] for s in stops[3:5]]
        payload = {"number": "TEST_DIR_NULL", "name": "No Dir Bus", "stops": sids}
        r = api.post(f"{BASE_URL}/api/buses", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["direction"] is None
        g = api.get(f"{BASE_URL}/api/buses/{data['bus_id']}", timeout=10).json()
        assert "direction" in g and g["direction"] is None

    def test_create_bus_empty_direction_stored_as_null(self, api, stops):
        # Iteration 3: empty-string direction should be normalized to null
        sids = [s["stop_id"] for s in stops[5:7]]
        payload = {"number": "TEST_DIR_EMPTY", "name": "Empty Dir", "direction": "   ", "stops": sids}
        r = api.post(f"{BASE_URL}/api/buses", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["direction"] is None

    @pytest.mark.parametrize("status_val", ["running", "delayed", "arriving", "cancelled"])
    def test_create_bus_accepts_new_status_enum(self, api, stops, status_val):
        # Iteration 3: new status enum running|delayed|arriving|cancelled
        sids = [s["stop_id"] for s in stops[:2]]
        payload = {
            "number": f"TEST_ST_{status_val}",
            "name": f"Status {status_val}",
            "stops": sids,
            "status": status_val,
        }
        r = api.post(f"{BASE_URL}/api/buses", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == status_val
        # Verify persistence
        g = api.get(f"{BASE_URL}/api/buses/{r.json()['bus_id']}", timeout=10).json()
        assert g["status"] == status_val

    def test_create_bus_same_source_dest_stops_documented_behaviour(self, api, stops):
        # Iteration 3 question: is stops=[A,A] accepted?
        # Observed behaviour: backend REJECTS with 400 "one or more stops not found"
        # because validation does `SELECT ... WHERE stop_id IN (?,?)` and compares
        # len(found) (deduped to 1 row) against len(stops)=2. This is a subtle
        # validator bug — duplicated stop_ids are misreported as "not found".
        sid = stops[0]["stop_id"]
        payload = {"number": "TEST_SAME_SD", "name": "Same SD", "stops": [sid, sid]}
        r = api.post(f"{BASE_URL}/api/buses", json=payload, timeout=10)
        assert r.status_code == 400
        assert "not found" in r.json().get("detail", "").lower()

    def test_create_bus_lt_2_stops_returns_400(self, api, stops):
        payload = {"number": "TEST_BAD1", "name": "Bad", "stops": [stops[0]["stop_id"]]}
        r = api.post(f"{BASE_URL}/api/buses", json=payload, timeout=10)
        assert r.status_code == 400

    def test_create_bus_unknown_stop_returns_400(self, api, stops):
        payload = {
            "number": "TEST_BAD2",
            "name": "Bad2",
            "stops": [stops[0]["stop_id"], "stop_does_not_exist"],
        }
        r = api.post(f"{BASE_URL}/api/buses", json=payload, timeout=10)
        assert r.status_code == 400

    def test_create_bus_missing_fields(self, api, stops):
        r = api.post(
            f"{BASE_URL}/api/buses",
            json={"stops": [stops[0]["stop_id"], stops[1]["stop_id"]]},
            timeout=10,
        )
        assert r.status_code == 400


# ---------- Location updates ----------
class TestLocationUpdate:
    def test_update_location_success(self, api, buses):
        bus = next(b for b in buses if b["number"] == "M15")
        payload = {"lat": 40.7600, "lng": -73.9800, "status": "running"}
        r = api.post(
            f"{BASE_URL}/api/buses/{bus['bus_id']}/location", json=payload, timeout=10
        )
        assert r.status_code == 200
        data = r.json()
        assert data["bus_id"] == bus["bus_id"]
        assert data["lat"] == 40.76
        assert data["lng"] == -73.98
        assert data["status"] == "running"
        assert "last_update" in data and data["last_update"]
        g = api.get(f"{BASE_URL}/api/buses/{bus['bus_id']}", timeout=10).json()
        assert g["current_lat"] == 40.76
        assert g["current_lng"] == -73.98

    def test_update_location_arriving_status_persists(self, api, buses):
        # Iteration 3: new 'arriving' enum value via location update persists
        bus = next(b for b in buses if b["number"] == "Q44")
        r = api.post(
            f"{BASE_URL}/api/buses/{bus['bus_id']}/location",
            json={"lat": 40.7550, "lng": -73.9840, "status": "arriving"},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "arriving"
        g = api.get(f"{BASE_URL}/api/buses/{bus['bus_id']}", timeout=10).json()
        assert g["status"] == "arriving"
        # Restore to running so other tests aren't affected
        api.post(
            f"{BASE_URL}/api/buses/{bus['bus_id']}/location",
            json={"lat": 40.7536, "lng": -73.9832, "status": "running"},
            timeout=10,
        )

    def test_update_location_unknown_bus_404(self, api):
        r = api.post(
            f"{BASE_URL}/api/buses/bus_nope/location",
            json={"lat": 1.0, "lng": 2.0},
            timeout=10,
        )
        assert r.status_code == 404

    def test_update_location_missing_coords(self, api, buses):
        bus = buses[0]
        r = api.post(
            f"{BASE_URL}/api/buses/{bus['bus_id']}/location", json={}, timeout=10
        )
        assert r.status_code == 400


# ---------- Route search ----------
class TestRouteSearch:
    def test_search_valid(self, api):
        r = api.post(
            f"{BASE_URL}/api/routes/search",
            json={"origin": "central", "destination": "wall"},
            timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["origin_stop"] is not None
        assert data["destination_stop"] is not None
        assert "Central" in data["origin_stop"]["name"]
        assert "Wall" in data["destination_stop"]["name"]
        assert isinstance(data["buses"], list) and len(data["buses"]) >= 1
        numbers = [b["number"] for b in data["buses"]]
        assert "M15" in numbers
        for b in data["buses"]:
            assert "eta_min" in b and isinstance(b["eta_min"], int) and b["eta_min"] > 0
            assert "from_stop" in b and "to_stop" in b
            assert "segment_stops" in b and len(b["segment_stops"]) >= 2
            assert b["segment_stops"][0]["name"] == b["from_stop"]["name"]
            assert b["segment_stops"][-1]["name"] == b["to_stop"]["name"]
        etas = [b["eta_min"] for b in data["buses"]]
        assert etas == sorted(etas), "results must be sorted ascending by eta_min"

    def test_search_reverse_direction_excludes_bus(self, api):
        r = api.post(
            f"{BASE_URL}/api/routes/search",
            json={"origin": "wall", "destination": "central"},
            timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        numbers = [b["number"] for b in data["buses"]]
        assert "M15" not in numbers, "Reverse-direction bus must be excluded"

    def test_search_unknown_origin(self, api):
        r = api.post(
            f"{BASE_URL}/api/routes/search",
            json={"origin": "zzz_nope_xyz", "destination": "wall"},
            timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["origin_stop"] is None
        assert data["buses"] == []

    def test_search_missing_fields(self, api):
        r = api.post(f"{BASE_URL}/api/routes/search", json={"origin": "central"}, timeout=10)
        assert r.status_code == 400


# ---------- ETA penalty by status (Iteration 3) ----------
class TestEtaPenalty:
    """Verify status-based ETA boost: delayed +8, cancelled +30, arriving 0 (vs running base)."""

    def _make_bus(self, api, stops, status_val: str) -> str:
        # Build a bus with the same fixed route (Central -> Wall) so distances match
        names_order = ["Central Station", "Times Square", "Empire State", "Union Square", "Wall Street"]
        by_name = {s["name"]: s for s in stops}
        sids = [by_name[n]["stop_id"] for n in names_order]
        payload = {
            "number": f"TEST_ETA_{status_val}",
            "name": f"ETA {status_val}",
            "stops": sids,
            "status": status_val,
        }
        r = api.post(f"{BASE_URL}/api/buses", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        return r.json()["bus_id"]

    def test_status_eta_boost(self, api, stops):
        # Create 4 buses with identical route, varying status
        ids = {sv: self._make_bus(api, stops, sv) for sv in ["running", "delayed", "arriving", "cancelled"]}
        r = api.post(
            f"{BASE_URL}/api/routes/search",
            json={"origin": "central", "destination": "wall"},
            timeout=10,
        )
        assert r.status_code == 200
        buses = {b["bus_id"]: b for b in r.json()["buses"] if b["bus_id"] in ids.values()}
        # All 4 test buses should be in the result
        assert set(buses.keys()) == set(ids.values()), f"Expected all 4 test buses in search; got {list(buses.keys())}"

        eta_running = buses[ids["running"]]["eta_min"]
        eta_delayed = buses[ids["delayed"]]["eta_min"]
        eta_arriving = buses[ids["arriving"]]["eta_min"]
        eta_cancelled = buses[ids["cancelled"]]["eta_min"]

        # delayed = running + 8
        assert eta_delayed - eta_running == 8, f"delayed should add +8 (got delta={eta_delayed - eta_running})"
        # cancelled = running + 30
        assert eta_cancelled - eta_running == 30, f"cancelled should add +30 (got delta={eta_cancelled - eta_running})"
        # arriving = running (no boost)
        assert eta_arriving == eta_running, f"arriving should have no boost (got delta={eta_arriving - eta_running})"


# ---------- SocketIO real-time ----------
async def _connect_and_collect(events_to_wait, trigger_coro, timeout=12.0):
    client = socketio.AsyncClient(reconnection=False)
    loop = asyncio.get_event_loop()
    received = {name: loop.create_future() for name in events_to_wait}

    for name in events_to_wait:
        def make_handler(n):
            async def handler(data):
                if not received[n].done():
                    received[n].set_result(data)
            return handler
        client.on(name, make_handler(name))

    await client.connect(BASE_URL, socketio_path="/api/socket.io", transports=["websocket"])
    await asyncio.sleep(0.5)

    await trigger_coro()

    try:
        await asyncio.wait_for(asyncio.gather(*received.values()), timeout=timeout)
    finally:
        await client.disconnect()
    return {name: fut.result() for name, fut in received.items()}


class TestSocketIO:
    def test_bus_location_event(self, buses):
        bus = next(b for b in buses if b["number"] == "B25")

        async def trigger():
            def _post():
                requests.post(
                    f"{BASE_URL}/api/buses/{bus['bus_id']}/location",
                    json={"lat": 40.7100, "lng": -74.0100, "status": "running"},
                    timeout=10,
                )
            await asyncio.get_event_loop().run_in_executor(None, _post)

        async def run():
            return await _connect_and_collect(["bus_location"], trigger)

        results = asyncio.run(run())
        payload = results["bus_location"]
        assert payload["bus_id"] == bus["bus_id"]
        assert payload["lat"] == 40.71
        assert payload["lng"] == -74.01
        assert payload["status"] == "running"
        assert "last_update" in payload and payload["last_update"]

    def test_bus_added_event(self, stops):
        sids = [s["stop_id"] for s in stops[:2]]

        async def trigger():
            def _post():
                requests.post(
                    f"{BASE_URL}/api/buses",
                    json={"number": "TEST_SOCK1", "name": "TEST Socket Bus", "stops": sids},
                    timeout=10,
                )
            await asyncio.get_event_loop().run_in_executor(None, _post)

        async def run():
            return await _connect_and_collect(["bus_added"], trigger)

        results = asyncio.run(run())
        bus = results["bus_added"]
        assert bus["number"] == "TEST_SOCK1"
        assert "stops" in bus and len(bus["stops"]) == 2
