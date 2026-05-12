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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sun, Moon, Plus, MapPin, Bus, Radio, LocateFixed, Search, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { statusBadge, statusLabel } from "@/lib/status";

export default function Home() {
  const { theme, toggle } = useTheme();
  const [stops, setStops] = useState([]);
  const [buses, setBuses] = useState([]);
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedBus, setSelectedBus] = useState(null);
  const [addBusOpen, setAddBusOpen] = useState(false);
  const [addStopOpen, setAddStopOpen] = useState(false);
  const [updateLocBus, setUpdateLocBus] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
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

  useEffect(() => { refresh(); }, [refresh]);

  // SocketIO real-time
  useEffect(() => {
    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    const onLocation = (payload) => {
      setBuses((prev) =>
        prev.map((b) =>
          b.bus_id === payload.bus_id
            ? { ...b, current_lat: payload.lat, current_lng: payload.lng, status: payload.status || b.status, last_update: payload.last_update }
            : b
        )
      );
      setSelectedBus((sel) =>
        sel && sel.bus_id === payload.bus_id
          ? { ...sel, current_lat: payload.lat, current_lng: payload.lng, status: payload.status || sel.status, last_update: payload.last_update }
          : sel
      );
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("bus_location", onLocation);
    socket.on("bus_added", refresh);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("bus_location", onLocation);
      socket.off("bus_added", refresh);
    };
  }, [refresh]);

  const onSearch = async ({ origin, destination }) => {
    setSearching(true);
    try {
      const r = await post("/routes/search", { origin, destination });
      setResults(r);
      if (!r.origin_stop || !r.destination_stop) toast.error("No matching stops");
      else if (r.buses.length === 0) toast.message("No direct buses on that route");
    } catch {
      toast.error("Search failed");
    }
    setSearching(false);
  };

  const clearSearch = () => setResults(null);

  const openQuickUpdate = (bus) => setUpdateLocBus(bus);

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

      {/* Top bar — compact */}
      <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none p-3 sm:p-4 flex items-center justify-between gap-2">
        <div className="pointer-events-auto flex items-center gap-2 bg-background/95 backdrop-blur-2xl border border-border rounded-md px-2.5 py-1.5 shadow-sm">
          <div className="w-6 h-6 rounded-sm bg-foreground text-background flex items-center justify-center">
            <Bus className="w-3.5 h-3.5" />
          </div>
          <div className="leading-tight">
            <p className="font-display font-black tracking-tighter text-sm">TransitPulse</p>
            <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1">
              <Radio className={`w-2 h-2 ${socketConnected ? "text-green-600 animate-pulse" : "text-muted-foreground"}`} />
              {socketConnected ? "Live" : "Offline"}
            </p>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5">
          <Button
            variant="default"
            size="sm"
            onClick={() => setPickerOpen(true)}
            disabled={!buses.length}
            data-testid="quick-update-button"
            className="rounded-md font-bold h-9 px-3"
          >
            <LocateFixed className="w-4 h-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Update</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-md h-9 px-3" data-testid="add-menu-trigger">
                <Plus className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Add</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setAddBusOpen(true)} data-testid="menu-add-bus">
                <Bus className="w-4 h-4 mr-2" /> Add bus
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAddStopOpen(true)} data-testid="menu-add-stop">
                <MapPin className="w-4 h-4 mr-2" /> Add stop
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="icon" onClick={toggle} data-testid="theme-toggle" className="rounded-md h-9 w-9">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Floating compact search — collapsed by default, expands on tap */}
      <div className="absolute top-16 sm:top-20 left-0 right-0 sm:left-4 sm:right-auto z-20 pointer-events-none px-3 sm:px-0 sm:w-[520px]">
        <div className="pointer-events-auto bg-background/95 backdrop-blur-2xl border border-border rounded-md shadow-sm overflow-hidden">
          {!searchOpen && !results ? (
            <button
              onClick={() => setSearchOpen(true)}
              data-testid="open-search-button"
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-secondary transition-colors"
            >
              <Search className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground flex-1">Search buses by source &amp; destination…</span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between px-3 pt-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">PLAN A TRIP</span>
                <button
                  onClick={() => { setSearchOpen(false); }}
                  className="text-muted-foreground hover:text-foreground"
                  data-testid="collapse-search-button"
                  title="Collapse"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
              <SearchPanel
                onSearch={onSearch}
                onClear={clearSearch}
                loading={searching}
                stops={stops}
                hasResults={!!results}
              />
              {results && (
                <div className="border-t border-border max-h-[45vh] overflow-y-auto no-scrollbar">
                  <RouteResults results={results} onSelect={setSelectedBus} />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bottom-right stats card (desktop only) */}
      <div className="hidden md:flex absolute bottom-5 right-5 z-20 pointer-events-auto bg-background/95 backdrop-blur-2xl border border-border rounded-md px-3 py-2 shadow-sm gap-5">
        <div>
          <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">BUSES</p>
          <p className="font-display font-black text-xl tracking-tighter" data-testid="stat-buses">{buses.length}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">STOPS</p>
          <p className="font-display font-black text-xl tracking-tighter" data-testid="stat-stops">{stops.length}</p>
        </div>
      </div>

      {/* Bus picker for the toolbar "Update" button */}
      <BusPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        buses={buses}
        onPick={(b) => { setPickerOpen(false); openQuickUpdate(b); }}
      />

      <BusDetailSheet
        bus={selectedBus}
        open={!!selectedBus}
        onClose={() => setSelectedBus(null)}
        onUpdateLocation={openQuickUpdate}
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

// Tiny inline bus picker dialog for the toolbar "Update location" CTA
function BusPicker({ open, onClose, buses, onPick }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="bus-picker-dialog">
        <DialogHeader>
          <DialogTitle className="font-display font-bold tracking-tight">Which bus are you on?</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {buses.length === 0 && <p className="text-sm text-muted-foreground p-3">No buses yet. Add one first.</p>}
          {buses.map((b) => (
            <button
              key={b.bus_id}
              data-testid={`pick-bus-${b.number}`}
              onClick={() => onPick(b)}
              className="w-full text-left border border-border rounded-md p-2.5 hover:border-foreground transition-colors flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-md bg-foreground text-background flex items-center justify-center font-display font-black tracking-tight text-sm">
                {b.number}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{b.name}</p>
                {b.direction && <p className="text-xs text-muted-foreground truncate">{b.direction}</p>}
              </div>
              <span className={`text-[10px] uppercase tracking-wider rounded-sm px-1.5 py-0.5 ${statusBadge(b.status)}`}>
                {statusLabel(b.status)}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
