"""TransitPulse backend regression tests."""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bustrack-live-20.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]


@pytest.fixture(scope="session")
def auth_token():
    user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    token = f"test_session_{uuid.uuid4().hex}"
    db.users.insert_one({
        "user_id": user_id,
        "email": f"test.{user_id}@example.com",
        "name": "Test User",
        "picture": "",
        "trust_score": 50,
        "reports_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    db.sessions.insert_one({
        "user_id": user_id,
        "session_token": token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    yield {"token": token, "user_id": user_id}
    db.sessions.delete_one({"session_token": token})
    db.users.delete_one({"user_id": user_id})


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token['token']}", "Content-Type": "application/json"}


# --------------------- Stops/Buses (public) ---------------------
class TestPublicEndpoints:
    def test_root(self):
        r = requests.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_list_stops_seeded(self):
        r = requests.get(f"{BASE_URL}/api/stops")
        assert r.status_code == 200
        stops = r.json()
        assert len(stops) >= 12
        names = {s["name"] for s in stops}
        assert {"Central Station", "Times Square", "Wall Street"}.issubset(names)

    def test_list_buses_seeded(self):
        r = requests.get(f"{BASE_URL}/api/buses")
        assert r.status_code == 200
        buses = r.json()
        nums = {b["number"] for b in buses}
        assert {"M15", "B25", "M5", "Q44"}.issubset(nums)

    def test_get_bus_with_stop_details(self):
        buses = requests.get(f"{BASE_URL}/api/buses").json()
        bus_id = next(b["bus_id"] for b in buses if b["number"] == "M15")
        r = requests.get(f"{BASE_URL}/api/buses/{bus_id}")
        assert r.status_code == 200
        data = r.json()
        assert "stop_details" in data
        assert len(data["stop_details"]) == len(data["stops"])
        assert all("name" in s and "lat" in s for s in data["stop_details"])

    def test_get_bus_404(self):
        r = requests.get(f"{BASE_URL}/api/buses/nonexistent")
        assert r.status_code == 404


# --------------------- Route Search ---------------------
class TestRouteSearch:
    def test_route_search_match(self):
        r = requests.post(f"{BASE_URL}/api/routes/search",
                          json={"origin": "Central Station", "destination": "Wall Street"})
        assert r.status_code == 200
        data = r.json()
        assert data["origin_stop"] is not None
        assert data["destination_stop"] is not None
        assert len(data["buses"]) >= 1
        b0 = data["buses"][0]
        assert "eta_min" in b0 and isinstance(b0["eta_min"], int)
        assert "from_stop" in b0 and "to_stop" in b0 and "segment_stops" in b0
        assert len(b0["segment_stops"]) >= 2

    def test_route_search_unknown(self):
        r = requests.post(f"{BASE_URL}/api/routes/search",
                          json={"origin": "Mars Base", "destination": "Jupiter"})
        assert r.status_code == 200
        data = r.json()
        assert data["origin_stop"] is None
        assert data["buses"] == []

    def test_route_search_empty(self):
        r = requests.post(f"{BASE_URL}/api/routes/search", json={"origin": "", "destination": "x"})
        assert r.status_code == 400


# --------------------- Creates ---------------------
class TestCreates:
    def test_create_stop(self):
        payload = {"name": f"TEST_Stop_{uuid.uuid4().hex[:6]}", "lat": 40.5, "lng": -73.5}
        r = requests.post(f"{BASE_URL}/api/stops", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == payload["name"]
        assert "stop_id" in data
        # Cleanup
        db.stops.delete_one({"stop_id": data["stop_id"]})

    def test_create_bus(self):
        stops = requests.get(f"{BASE_URL}/api/stops").json()
        sids = [s["stop_id"] for s in stops[:3]]
        payload = {"number": f"TEST{uuid.uuid4().hex[:4]}", "name": "TEST_Bus",
                   "stops": sids, "departure_time": "07:00", "arrival_time": "21:00",
                   "frequency_min": 10}
        r = requests.post(f"{BASE_URL}/api/buses", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["number"] == payload["number"]
        assert data["stops"] == sids
        db.buses.delete_one({"bus_id": data["bus_id"]})

    def test_update_location(self):
        buses = requests.get(f"{BASE_URL}/api/buses").json()
        bus_id = buses[0]["bus_id"]
        r = requests.post(f"{BASE_URL}/api/buses/{bus_id}/location",
                          json={"lat": 40.1234, "lng": -73.5678})
        assert r.status_code == 200
        data = r.json()
        assert data["current_lat"] == 40.1234
        assert data["current_lng"] == -73.5678
        assert data["last_update"] is not None

    def test_update_location_404(self):
        r = requests.post(f"{BASE_URL}/api/buses/nope/location", json={"lat": 1, "lng": 2})
        assert r.status_code == 404


# --------------------- Auth ---------------------
class TestAuth:
    def test_me_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_with_auth(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["name"] == "Test User"

    def test_logout(self, auth_headers):
        # Create a separate ephemeral session so we don't kill the main fixture
        uid_local = f"user_logout_{uuid.uuid4().hex[:6]}"
        tok = f"test_logout_{uuid.uuid4().hex}"
        db.users.insert_one({"user_id": uid_local, "email": f"{uid_local}@x.com",
                             "name": "x", "trust_score": 50, "reports_count": 0,
                             "created_at": datetime.now(timezone.utc).isoformat()})
        db.sessions.insert_one({"user_id": uid_local, "session_token": tok,
                                "expires_at": (datetime.now(timezone.utc)+timedelta(days=1)).isoformat(),
                                "created_at": datetime.now(timezone.utc).isoformat()})
        r = requests.post(f"{BASE_URL}/api/auth/logout",
                          headers={"Authorization": f"Bearer {tok}"},
                          cookies={"session_token": tok})
        assert r.status_code == 200
        db.users.delete_one({"user_id": uid_local})


# --------------------- Reports ---------------------
class TestReports:
    def test_create_report_unauth(self):
        r = requests.post(f"{BASE_URL}/api/reports",
                          json={"bus_id": "x", "type": "delay", "message": "test"})
        assert r.status_code == 401

    def test_create_report_authed(self, auth_headers):
        buses = requests.get(f"{BASE_URL}/api/buses").json()
        bus_id = buses[0]["bus_id"]
        r = requests.post(f"{BASE_URL}/api/reports", headers=auth_headers,
                          json={"bus_id": bus_id, "type": "delay",
                                "message": "Bus stuck in traffic on 5th Ave, ~15 min late"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "spam_score" in data and isinstance(data["spam_score"], (int, float))
        assert "is_spam" in data and isinstance(data["is_spam"], bool)
        assert data["created_by_name"] == "Test User"
        TestReports.report_id = data["report_id"]
        TestReports.bus_id = bus_id

    def test_create_report_spam(self, auth_headers):
        buses = requests.get(f"{BASE_URL}/api/buses").json()
        bus_id = buses[0]["bus_id"]
        r = requests.post(f"{BASE_URL}/api/reports", headers=auth_headers,
                          json={"bus_id": bus_id, "type": "other",
                                "message": "buy now click here http://spam.com free money xxx"})
        assert r.status_code == 200
        data = r.json()
        assert data["spam_score"] > 0

    def test_vote_report(self, auth_headers, auth_token):
        # Need a fresh voter (cannot vote own per design? Actually code doesn't prevent it; user_id just must not already be in voters)
        # Use a second user
        uid2 = f"user_voter_{uuid.uuid4().hex[:6]}"
        tok2 = f"test_voter_{uuid.uuid4().hex}"
        db.users.insert_one({"user_id": uid2, "email": f"{uid2}@x.com", "name": "Voter",
                             "trust_score": 50, "reports_count": 0,
                             "created_at": datetime.now(timezone.utc).isoformat()})
        db.sessions.insert_one({"user_id": uid2, "session_token": tok2,
                                "expires_at": (datetime.now(timezone.utc)+timedelta(days=1)).isoformat(),
                                "created_at": datetime.now(timezone.utc).isoformat()})
        h = {"Authorization": f"Bearer {tok2}", "Content-Type": "application/json"}
        rid = TestReports.report_id
        r = requests.post(f"{BASE_URL}/api/reports/{rid}/vote", headers=h,
                          json={"direction": "up"})
        assert r.status_code == 200
        data = r.json()
        assert data["upvotes"] == 1
        assert uid2 in data["voters"]
        # Double-vote should fail
        r2 = requests.post(f"{BASE_URL}/api/reports/{rid}/vote", headers=h,
                           json={"direction": "up"})
        assert r2.status_code == 400
        # Trust score updated for author
        author = db.users.find_one({"user_id": auth_token["user_id"]})
        assert author["trust_score"] >= 52
        db.users.delete_one({"user_id": uid2})
        db.sessions.delete_one({"session_token": tok2})

    def test_list_reports(self):
        r = requests.get(f"{BASE_URL}/api/reports")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# --------------------- AI ---------------------
class TestAI:
    def test_predict_eta(self):
        buses = requests.get(f"{BASE_URL}/api/buses").json()
        bus_id = buses[0]["bus_id"]
        r = requests.post(f"{BASE_URL}/api/ai/predict-eta",
                          json={"bus_id": bus_id, "base_eta_min": 12}, timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert "predicted_eta_min" in data
        assert "confidence" in data
        assert "explanation" in data
        assert isinstance(data["predicted_eta_min"], int)

    def test_recommend_route(self):
        buses = requests.get(f"{BASE_URL}/api/buses").json()[:3]
        cand = [{"bus_id": b["bus_id"], "number": b["number"], "name": b["name"],
                 "eta_min": 10 + i, "status": b["status"]} for i, b in enumerate(buses)]
        r = requests.post(f"{BASE_URL}/api/ai/recommend-route",
                          json={"buses": cand}, timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert data["recommendation"] is not None
        assert "bus_id" in data["recommendation"]
        assert "explanation" in data

    def test_recommend_route_empty(self):
        r = requests.post(f"{BASE_URL}/api/ai/recommend-route", json={"buses": []})
        assert r.status_code == 200
        assert r.json()["recommendation"] is None


# Cleanup test-created reports
def teardown_module(module):
    db.reports.delete_many({"created_by_name": "Test User"})
    db.stops.delete_many({"name": {"$regex": "^TEST_"}})
    db.buses.delete_many({"name": "TEST_Bus"})
