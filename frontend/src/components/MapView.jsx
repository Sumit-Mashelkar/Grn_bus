import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { statusColor } from "@/lib/status";

const ICON_BUS = (number, status, dark) => {
  const color = statusColor(status);
  const ring = dark ? "#FAFAFA" : "#09090B";
  return L.divIcon({
    className: "bus-marker",
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: `
      <div class="live-pulse" style="width:44px;height:44px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;border:3px solid ${ring};color:${ring};font-size:11px;font-weight:900;letter-spacing:-0.02em;">
        ${number}
      </div>`,
  });
};

const ICON_STOP = (dark) =>
  L.divIcon({
    className: "stop-marker",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${dark ? "#09090B" : "#FFFFFF"};border:3px solid ${dark ? "#FAFAFA" : "#09090B"};"></div>`,
  });

const ICON_ENDPOINT = (label, dark) =>
  L.divIcon({
    className: "endpoint-marker",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="width:28px;height:28px;border-radius:6px;background:${dark ? "#FAFAFA" : "#09090B"};color:${dark ? "#09090B" : "#FAFAFA"};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;">${label}</div>`,
  });

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    const valid = points.filter((p) => p && typeof p[0] === "number");
    if (valid.length === 0) return;
    const bounds = L.latLngBounds(valid);
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 14 });
  }, [points, map]);
  return null;
}

export default function MapView({ theme, buses = [], stops = [], routeStops = null, selectedBus = null, origin = null, destination = null }) {
  const dark = theme === "dark";
  const tile = dark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  const center = useMemo(() => [40.7527, -73.9772], []);

  const routeLine = useMemo(() => {
    if (routeStops && routeStops.length > 1) return routeStops.map((s) => [s.lat, s.lng]);
    return null;
  }, [routeStops]);

  const fitPoints = useMemo(() => {
    const pts = [];
    if (routeLine) pts.push(...routeLine);
    if (origin) pts.push([origin.lat, origin.lng]);
    if (destination) pts.push([destination.lat, destination.lng]);
    if (selectedBus?.current_lat != null) pts.push([selectedBus.current_lat, selectedBus.current_lng]);
    return pts;
  }, [routeLine, origin, destination, selectedBus]);

  return (
    <MapContainer
      center={center}
      zoom={13}
      zoomControl={false}
      className="fixed inset-0 z-0 h-screen w-screen"
      data-testid="map-container"
    >
      <TileLayer url={tile} attribution='&copy; OpenStreetMap &copy; CARTO' />
      {stops.map((s) => (
        <Marker key={s.stop_id} position={[s.lat, s.lng]} icon={ICON_STOP(dark)} />
      ))}
      {buses
        .filter((b) => b.current_lat != null && b.current_lng != null)
        .map((b) => (
          <Marker
            key={b.bus_id}
            position={[b.current_lat, b.current_lng]}
            icon={ICON_BUS(b.number, b.status, dark)}
          />
        ))}
      {origin && (
        <Marker position={[origin.lat, origin.lng]} icon={ICON_ENDPOINT("A", dark)} />
      )}
      {destination && (
        <Marker position={[destination.lat, destination.lng]} icon={ICON_ENDPOINT("B", dark)} />
      )}
      {routeLine && (
        <Polyline
          positions={routeLine}
          pathOptions={{
            color: dark ? "#FAFAFA" : "#09090B",
            weight: 5,
            opacity: 0.9,
            dashArray: "10 10",
            className: "route-line",
          }}
        />
      )}
      <FitBounds points={fitPoints} />
    </MapContainer>
  );
}
