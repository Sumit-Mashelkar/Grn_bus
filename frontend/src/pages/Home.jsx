import { useEffect, useState, useCallback } from "react";
import { get, post } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { socket } from "@/lib/socket";
import MapView from "@/components/MapView";
import SearchPanel from "@/components/SearchPanel";
import RouteResults from "@/components/RouteResults";
import BusDetailSheet from "@/components/BusDetailSheet";
import AddBusDialog from "@/components/AddBusDialog";
import AddStopDialog from "@/components/AddStopDialog";
import UpdateLocationDialog from "@/components/UpdateLocationDialog";
import { Button } from "@/components/ui/button";
import { Sun, Moon, Plus, MapPin, Bus, Radio, LocateFixed } from "lucide-react";
import { toast } from "sonner";

export default function Home() {
  const { theme, toggle } = useTheme();
  const [stops, setStops] = useState([]);
  const [buses, setBuses] = useState([]);
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [selectedBus, setSelectedBus] = useState(null);
  const [addBusOpen, setAddBusOpen] = useState(false);
  const [addStopOpen, setAddStopOpen] = useState(false);
  const [updateLocBus, setUpdateLocBus] = useState(null);
  const [socketConnected, setSocketConnected] = useState(socket.connected);

  const refresh = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([get("/stops"), get("/buses")]);
      setStops(s);
      setBuses(b);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // SocketIO subscription for real-time bus location updates
  useEffect(() => {
    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    const onLocation = (payload) => {
      setBuses((prev) =>
        prev.map((b) =>
          b.bus_id === payload.bus_id
            ? {
                ...b,
                current_lat: payload.lat,
                current_lng: payload.lng,
                status: payload.status || b.status,
                last_update: payload.last_update,
              }
            : b
        )
      );
      setSelectedBus((sel) =>
        sel && sel.bus_id === payload.bus_id
          ? { ...sel, current_lat: payload.lat, current_lng: payload.lng, status: payload.status || sel.status, last_update: payload.last_update }
          : sel
      );
    };
    const onBusAdded = () => refresh();

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("bus_location", onLocation);
    socket.on("bus_added", onBusAdded);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("bus_location", onLocation);
      socket.off("bus_added", onBusAdded);
    };
  }, [refresh]);

  const onSearch = async ({ origin, destination }) => {
    setSearching(true);
    try {
      const r = await post("/routes/search", { origin, destination });
      setResults(r);
      if (!r.origin_stop || !r.destination_stop) {
        toast.error("No matching stops");
      } else if (r.buses.length === 0) {
        toast.message("No direct buses on that route");
      }
    } catch (e) {
      toast.error("Search failed");
    }
    setSearching(false);
  };

  const routeStops = results?.buses?.[0]?.segment_stops || null;

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden" data-testid="home-page">
      <MapView
        theme={theme}
        buses={buses}
        stops={stops}
        routeStops={routeStops}
        origin={results?.origin_stop}
        destination={results?.destination_stop}
        selectedBus={selectedBus}
      />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none p-4 sm:p-6 flex items-start justify-between gap-2">
        <div className="pointer-events-auto flex items-center gap-2 bg-background/95 backdrop-blur-2xl border border-border rounded-md px-3 py-2 shadow-sm">
          <div className="w-7 h-7 rounded-sm bg-foreground text-background flex items-center justify-center">
            <Bus className="w-4 h-4" />
          </div>
          <div>
            <p className="font-display font-black tracking-tighter leading-none">TransitPulse</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1">
              <Radio className={`w-2.5 h-2.5 ${socketConnected ? "text-green-600 animate-pulse" : "text-muted-foreground"}`} />
              {socketConnected ? "Live · realtime" : "Reconnecting…"}
            </p>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2 flex-wrap justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddStopOpen(true)}
            data-testid="open-add-stop"
            className="rounded-md"
          >
            <MapPin className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Add stop</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddBusOpen(true)}
            data-testid="open-add-bus"
            className="rounded-md"
          >
            <Plus className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Add bus</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setUpdateLocBus(buses[0] || null)}
            disabled={!buses.length}
            data-testid="open-quick-update"
            className="rounded-md font-bold"
          >
            <LocateFixed className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Update location</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={toggle}
            data-testid="theme-toggle"
            className="rounded-md"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Left search + results panel */}
      <div className="absolute top-28 sm:top-24 left-0 sm:left-6 z-20 pointer-events-none w-full sm:w-[400px] px-4 sm:px-0">
        <div className="pointer-events-auto bg-background/95 backdrop-blur-2xl border border-border rounded-xl shadow-sm overflow-hidden">
          <SearchPanel onSearch={onSearch} loading={searching} stops={stops} />
          {results && (
            <div className="border-t border-border max-h-[55vh] overflow-y-auto no-scrollbar">
              <RouteResults results={results} onSelect={setSelectedBus} />
            </div>
          )}
        </div>
      </div>

      {/* Bottom-right stats card (desktop) */}
      <div className="hidden md:flex absolute bottom-6 right-6 z-20 pointer-events-auto bg-background/95 backdrop-blur-2xl border border-border rounded-xl px-4 py-3 shadow-sm gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">BUSES</p>
          <p className="font-display font-black text-2xl tracking-tighter" data-testid="stat-buses">{buses.length}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">STOPS</p>
          <p className="font-display font-black text-2xl tracking-tighter" data-testid="stat-stops">{stops.length}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">LIVE</p>
          <p className={`font-display font-black text-2xl tracking-tighter ${socketConnected ? "text-green-600" : "text-muted-foreground"}`}>
            ●
          </p>
        </div>
      </div>

      <BusDetailSheet
        bus={selectedBus}
        open={!!selectedBus}
        onClose={() => setSelectedBus(null)}
        onUpdateLocation={(b) => setUpdateLocBus(b)}
      />
      <AddBusDialog
        open={addBusOpen}
        onClose={() => setAddBusOpen(false)}
        stops={stops}
        onCreated={() => refresh()}
      />
      <AddStopDialog
        open={addStopOpen}
        onClose={() => setAddStopOpen(false)}
        onCreated={() => refresh()}
      />
      <UpdateLocationDialog
        bus={updateLocBus}
        open={!!updateLocBus}
        onClose={() => setUpdateLocBus(null)}
        onUpdated={() => refresh()}
      />
    </div>
  );
}
