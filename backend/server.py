"""TransitPulse - Crowd-sourced bus tracking backend.

FastAPI + MongoDB + Emergent Google OAuth + Claude Sonnet 4.5 (via emergentintegrations).
NOTE: Platform supervisor is locked to FastAPI/uvicorn, so Flask is not feasible here.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Cookie
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, uuid, logging, math, json, asyncio
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

app = FastAPI(title="TransitPulse API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("transitpulse")


# --------------------- Models ---------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = ""
    trust_score: int = 50
    reports_count: int = 0
    created_at: datetime = Field(default_factory=now_utc)


class BusStop(BaseModel):
    model_config = ConfigDict(extra="ignore")
    stop_id: str = Field(default_factory=lambda: uid("stop"))
    name: str
    lat: float
    lng: float
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


class StopCreate(BaseModel):
    name: str
    lat: float
    lng: float


class Bus(BaseModel):
    model_config = ConfigDict(extra="ignore")
    bus_id: str = Field(default_factory=lambda: uid("bus"))
    number: str  # e.g. "42A"
    name: str  # route name
    stops: List[str] = []  # ordered list of stop_ids
    departure_time: str = "06:00"
    arrival_time: str = "22:00"
    frequency_min: int = 15
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None
    last_update: Optional[datetime] = None
    status: Literal["on_time", "delayed", "cancelled"] = "on_time"
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


class BusCreate(BaseModel):
    number: str
    name: str
    stops: List[str]
    departure_time: str = "06:00"
    arrival_time: str = "22:00"
    frequency_min: int = 15


class LocationUpdate(BaseModel):
    lat: float
    lng: float


class Report(BaseModel):
    model_config = ConfigDict(extra="ignore")
    report_id: str = Field(default_factory=lambda: uid("rep"))
    bus_id: str
    type: Literal["delay", "cancellation", "crowded", "on_time", "other"]
    message: str
    upvotes: int = 0
    downvotes: int = 0
    spam_score: float = 0.0
    is_spam: bool = False
    voters: List[str] = []
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


class ReportCreate(BaseModel):
    bus_id: str
    type: Literal["delay", "cancellation", "crowded", "on_time", "other"]
    message: str


class VoteRequest(BaseModel):
    direction: Literal["up", "down"]


class SessionRequest(BaseModel):
    session_id: str


class RouteSearchRequest(BaseModel):
    origin: str
    destination: str


# --------------------- Helpers ---------------------
def doc_to_model(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    for k, v in list(doc.items()):
        if isinstance(v, datetime) and v.tzinfo is None:
            doc[k] = v.replace(tzinfo=timezone.utc)
    return doc


async def get_current_user(request: Request) -> Optional[User]:
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        return None
    sess = await db.sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        return None
    exp = sess["expires_at"]
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now_utc():
        return None
    user_doc = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    if not user_doc:
        return None
    return User(**doc_to_model(user_doc))


async def require_user(request: Request) -> User:
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def haversine(lat1, lng1, lat2, lng2) -> float:
    R = 6371.0
    dl = math.radians(lat2 - lat1)
    dlg = math.radians(lng2 - lng1)
    a = math.sin(dl / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlg / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# --------------------- Auth ---------------------
@api.post("/auth/session")
async def create_session(payload: SessionRequest, response: Response):
    """Exchange session_id from Emergent OAuth for a session_token."""
    async with httpx.AsyncClient(timeout=10) as cx:
        r = await cx.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": payload.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = r.json()
    email = data["email"]
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data["name"], "picture": data.get("picture", "")}},
        )
    else:
        user_id = uid("user")
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data["name"],
            "picture": data.get("picture", ""),
            "trust_score": 50,
            "reports_count": 0,
            "created_at": now_utc().isoformat(),
        })
    session_token = data["session_token"]
    expires_at = now_utc() + timedelta(days=7)
    await db.sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "expires_at": expires_at.isoformat(),
        "created_at": now_utc().isoformat(),
    })
    response.set_cookie(
        "session_token", session_token,
        httponly=True, secure=True, samesite="none",
        max_age=7 * 24 * 60 * 60, path="/",
    )
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": doc_to_model(user_doc)}


@api.get("/auth/me")
async def auth_me(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user.model_dump()


@api.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# --------------------- Stops ---------------------
@api.get("/stops")
async def list_stops():
    docs = await db.stops.find({}, {"_id": 0}).to_list(2000)
    return [doc_to_model(d) for d in docs]


@api.post("/stops")
async def create_stop(payload: StopCreate, request: Request):
    user = await get_current_user(request)
    stop = BusStop(**payload.model_dump(), created_by=user.user_id if user else None)
    d = stop.model_dump()
    d["created_at"] = d["created_at"].isoformat()
    await db.stops.insert_one(d)
    return doc_to_model(d)


# --------------------- Buses ---------------------
@api.get("/buses")
async def list_buses():
    docs = await db.buses.find({}, {"_id": 0}).to_list(2000)
    return [doc_to_model(d) for d in docs]


@api.get("/buses/{bus_id}")
async def get_bus(bus_id: str):
    doc = await db.buses.find_one({"bus_id": bus_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Bus not found")
    stops_docs = await db.stops.find({"stop_id": {"$in": doc.get("stops", [])}}, {"_id": 0}).to_list(200)
    stops_map = {s["stop_id"]: doc_to_model(s) for s in stops_docs}
    doc["stop_details"] = [stops_map[s] for s in doc.get("stops", []) if s in stops_map]
    return doc_to_model(doc)


@api.post("/buses")
async def create_bus(payload: BusCreate, request: Request):
    user = await get_current_user(request)
    bus = Bus(**payload.model_dump(), created_by=user.user_id if user else None)
    d = bus.model_dump()
    d["created_at"] = d["created_at"].isoformat()
    await db.buses.insert_one(d)
    return doc_to_model(d)


@api.post("/buses/{bus_id}/location")
async def update_location(bus_id: str, payload: LocationUpdate):
    res = await db.buses.update_one(
        {"bus_id": bus_id},
        {"$set": {"current_lat": payload.lat, "current_lng": payload.lng,
                  "last_update": now_utc().isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Bus not found")
    doc = await db.buses.find_one({"bus_id": bus_id}, {"_id": 0})
    return doc_to_model(doc)


# --------------------- Reports ---------------------
@api.get("/reports")
async def list_reports(bus_id: Optional[str] = None):
    q = {"is_spam": False}
    if bus_id:
        q["bus_id"] = bus_id
    docs = await db.reports.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [doc_to_model(d) for d in docs]


@api.post("/reports")
async def create_report(payload: ReportCreate, request: Request):
    user = await require_user(request)
    # AI spam check
    spam_score, is_spam = await ai_spam_check(payload.message, payload.type)
    rep = Report(
        bus_id=payload.bus_id,
        type=payload.type,
        message=payload.message,
        spam_score=spam_score,
        is_spam=is_spam,
        created_by=user.user_id,
        created_by_name=user.name,
    )
    d = rep.model_dump()
    d["created_at"] = d["created_at"].isoformat()
    await db.reports.insert_one(d)
    await db.users.update_one({"user_id": user.user_id}, {"$inc": {"reports_count": 1}})
    # Auto-update bus status for non-spam delay/cancel
    if not is_spam and payload.type in ("delay", "cancellation"):
        await db.buses.update_one(
            {"bus_id": payload.bus_id},
            {"$set": {"status": "delayed" if payload.type == "delay" else "cancelled"}},
        )
    return doc_to_model(d)


@api.post("/reports/{report_id}/vote")
async def vote_report(report_id: str, payload: VoteRequest, request: Request):
    user = await require_user(request)
    rep = await db.reports.find_one({"report_id": report_id}, {"_id": 0})
    if not rep:
        raise HTTPException(404, "Report not found")
    if user.user_id in rep.get("voters", []):
        raise HTTPException(400, "Already voted")
    inc = {"upvotes": 1} if payload.direction == "up" else {"downvotes": 1}
    await db.reports.update_one(
        {"report_id": report_id},
        {"$inc": inc, "$push": {"voters": user.user_id}},
    )
    # Update trust score of report author based on votes
    trust_delta = 2 if payload.direction == "up" else -2
    if rep.get("created_by"):
        await db.users.update_one(
            {"user_id": rep["created_by"]},
            {"$inc": {"trust_score": trust_delta}},
        )
    updated = await db.reports.find_one({"report_id": report_id}, {"_id": 0})
    return doc_to_model(updated)


# --------------------- Route Search ---------------------
@api.post("/routes/search")
async def search_routes(payload: RouteSearchRequest):
    origin = payload.origin.strip().lower()
    dest = payload.destination.strip().lower()
    if not origin or not dest:
        raise HTTPException(400, "Both origin and destination required")
    stops = await db.stops.find({}, {"_id": 0}).to_list(2000)
    stop_map = {s["stop_id"]: s for s in stops}

    def match_stop(query: str):
        for s in stops:
            if query in s["name"].lower():
                return s
        return None

    o_stop = match_stop(origin)
    d_stop = match_stop(dest)

    buses = await db.buses.find({}, {"_id": 0}).to_list(2000)
    results = []
    for b in buses:
        ids = b.get("stops", [])
        if not o_stop or not d_stop:
            continue
        if o_stop["stop_id"] in ids and d_stop["stop_id"] in ids:
            oi = ids.index(o_stop["stop_id"])
            di = ids.index(d_stop["stop_id"])
            if oi < di:
                # estimate ETA via haversine
                dist = sum(
                    haversine(
                        stop_map[ids[i]]["lat"], stop_map[ids[i]]["lng"],
                        stop_map[ids[i + 1]]["lat"], stop_map[ids[i + 1]]["lng"],
                    )
                    for i in range(oi, di)
                )
                eta_min = int(dist / 25 * 60) + 2  # 25 km/h avg
                if b.get("status") == "delayed":
                    eta_min += 8
                bus_out = doc_to_model({**b})
                bus_out["eta_min"] = eta_min
                bus_out["from_stop"] = doc_to_model({**o_stop})
                bus_out["to_stop"] = doc_to_model({**d_stop})
                bus_out["segment_stops"] = [doc_to_model({**stop_map[ids[i]]}) for i in range(oi, di + 1)]
                results.append(bus_out)
    results.sort(key=lambda x: x["eta_min"])
    return {
        "origin_stop": doc_to_model({**o_stop}) if o_stop else None,
        "destination_stop": doc_to_model({**d_stop}) if d_stop else None,
        "buses": results,
    }


# --------------------- AI ---------------------
async def llm_chat(system: str, user_text: str) -> str:
    """Send a one-shot chat to Claude Sonnet 4.5 via Emergent LLM."""
    if not EMERGENT_LLM_KEY:
        return ""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"transitpulse-{uuid.uuid4().hex[:8]}",
            system_message=system,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        resp = await chat.send_message(UserMessage(text=user_text))
        return str(resp)
    except Exception as e:
        log.warning(f"LLM error: {e}")
        return ""


async def ai_spam_check(message: str, rtype: str) -> tuple[float, bool]:
    """Return (spam_score 0..1, is_spam bool)."""
    text = message.strip()
    if not text:
        return 1.0, True
    # Quick heuristics
    score = 0.0
    if len(text) < 3:
        score += 0.5
    lower = text.lower()
    for bad in ("http://", "https://", "buy now", "click here", "free money", "xxx"):
        if bad in lower:
            score += 0.4
    if len(set(text)) <= 2:
        score += 0.4
    # LLM check (best-effort)
    sys = ("You are a transit-report moderator. Decide if the user's bus delay/issue report is spam, "
           "abusive, or clearly off-topic. Respond strictly with a JSON object: "
           '{"spam_score": <float 0..1>, "is_spam": <true|false>, "reason": "..."}.')
    user = f"Report type: {rtype}\nMessage: {text}"
    raw = await llm_chat(sys, user)
    if raw:
        try:
            start = raw.find("{"); end = raw.rfind("}")
            obj = json.loads(raw[start:end + 1]) if start >= 0 else {}
            score = max(score, float(obj.get("spam_score", score)))
            if obj.get("is_spam"):
                return min(score + 0.3, 1.0), True
        except Exception:
            pass
    return min(score, 1.0), score >= 0.7


@api.post("/ai/predict-eta")
async def predict_eta(payload: dict):
    """Predict refined ETA using current conditions + base ETA via LLM."""
    bus_id = payload.get("bus_id")
    base_eta = int(payload.get("base_eta_min", 10))
    bus = await db.buses.find_one({"bus_id": bus_id}, {"_id": 0}) if bus_id else None
    recent = await db.reports.find({"bus_id": bus_id, "is_spam": False}, {"_id": 0}).sort("created_at", -1).to_list(10) if bus_id else []
    summary = {
        "status": bus.get("status") if bus else "unknown",
        "recent_reports": [{"type": r["type"], "msg": r["message"], "up": r.get("upvotes", 0), "down": r.get("downvotes", 0)} for r in recent],
        "base_eta_min": base_eta,
        "hour": now_utc().hour,
    }
    sys = ("You predict ETA for a city bus using crowd-sourced reports and base ETA. "
           'Reply strictly as JSON: {"predicted_eta_min": <int>, "confidence": <0..1>, "explanation": "..."}.')
    raw = await llm_chat(sys, json.dumps(summary))
    out = {"predicted_eta_min": base_eta, "confidence": 0.5, "explanation": "Fallback estimate from base ETA."}
    if raw:
        try:
            start = raw.find("{"); end = raw.rfind("}")
            obj = json.loads(raw[start:end + 1])
            out["predicted_eta_min"] = int(obj.get("predicted_eta_min", base_eta))
            out["confidence"] = float(obj.get("confidence", 0.5))
            out["explanation"] = str(obj.get("explanation", out["explanation"]))
        except Exception:
            pass
    return out


@api.post("/ai/recommend-route")
async def recommend_route(payload: dict):
    """Recommend best bus from a search result list."""
    buses = payload.get("buses", [])
    if not buses:
        return {"recommendation": None, "explanation": "No buses available."}
    sys = ("You are a transit advisor. From the candidate buses (each has bus_id, number, name, eta_min, status), "
           'pick the BEST one and reply strictly as JSON: {"bus_id": "...", "explanation": "..."}.')
    raw = await llm_chat(sys, json.dumps(buses[:5]))
    pick = buses[0]
    explanation = f"Fastest ETA ({pick.get('eta_min')} min) and currently {pick.get('status')}."
    if raw:
        try:
            start = raw.find("{"); end = raw.rfind("}")
            obj = json.loads(raw[start:end + 1])
            chosen = next((b for b in buses if b.get("bus_id") == obj.get("bus_id")), pick)
            pick = chosen
            explanation = obj.get("explanation", explanation)
        except Exception:
            pass
    return {"recommendation": pick, "explanation": explanation}


# --------------------- Seed ---------------------
DEMO_STOPS = [
    {"name": "Central Station", "lat": 40.7527, "lng": -73.9772},
    {"name": "Times Square", "lat": 40.7580, "lng": -73.9855},
    {"name": "Union Square", "lat": 40.7359, "lng": -73.9911},
    {"name": "Wall Street", "lat": 40.7074, "lng": -74.0113},
    {"name": "Brooklyn Bridge", "lat": 40.7061, "lng": -73.9969},
    {"name": "Empire State", "lat": 40.7484, "lng": -73.9857},
    {"name": "Columbus Circle", "lat": 40.7681, "lng": -73.9819},
    {"name": "Lincoln Center", "lat": 40.7725, "lng": -73.9835},
    {"name": "Penn Station", "lat": 40.7506, "lng": -73.9935},
    {"name": "Grand Central", "lat": 40.7527, "lng": -73.9772},
    {"name": "Harlem Plaza", "lat": 40.8116, "lng": -73.9465},
    {"name": "Bryant Park", "lat": 40.7536, "lng": -73.9832},
]


@app.on_event("startup")
async def seed_data():
    if await db.stops.count_documents({}) == 0:
        log.info("Seeding demo stops & buses…")
        stop_objs = []
        for s in DEMO_STOPS:
            stop = BusStop(**s)
            d = stop.model_dump()
            d["created_at"] = d["created_at"].isoformat()
            await db.stops.insert_one(d)
            stop_objs.append(stop)
        sm = {s.name: s.stop_id for s in stop_objs}
        demo_buses = [
            {"number": "M15", "name": "Downtown Express",
             "stops": [sm["Central Station"], sm["Times Square"], sm["Empire State"], sm["Union Square"], sm["Wall Street"]],
             "current_lat": 40.7580, "current_lng": -73.9855},
            {"number": "B25", "name": "Brooklyn Loop",
             "stops": [sm["Wall Street"], sm["Brooklyn Bridge"], sm["Union Square"], sm["Bryant Park"]],
             "current_lat": 40.7074, "current_lng": -74.0113},
            {"number": "M5", "name": "Uptown Cruiser",
             "stops": [sm["Penn Station"], sm["Bryant Park"], sm["Grand Central"], sm["Columbus Circle"], sm["Lincoln Center"], sm["Harlem Plaza"]],
             "current_lat": 40.7681, "current_lng": -73.9819},
            {"number": "Q44", "name": "Midtown Shuttle",
             "stops": [sm["Times Square"], sm["Bryant Park"], sm["Grand Central"], sm["Empire State"]],
             "current_lat": 40.7536, "current_lng": -73.9832},
        ]
        for b in demo_buses:
            bus = Bus(**b, last_update=now_utc())
            d = bus.model_dump()
            d["created_at"] = d["created_at"].isoformat()
            d["last_update"] = d["last_update"].isoformat() if d.get("last_update") else None
            await db.buses.insert_one(d)
        log.info("Seed complete.")


@api.get("/")
async def root():
    return {"app": "TransitPulse", "status": "ok"}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    client.close()
