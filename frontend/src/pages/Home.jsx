import { useEffect, useState } from "react";
import { get, post } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import MapView from "@/components/MapView";
import SearchPanel from "@/components/SearchPanel";
import RouteResults from "@/components/RouteResults";
import BusDetailSheet from "@/components/BusDetailSheet";
import ReportDialog from "@/components/ReportDialog";
import AddBusDialog from "@/components/AddBusDialog";
import AddStopDialog from "@/components/AddStopDialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sun, Moon, Plus, LogOut, Bus, MapPin, Sparkles, Radio } from "lucide-react";
import { toast } from "sonner";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
function loginWithGoogle() {
  const redirectUrl = window.location.origin + "/dashboard";
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
}

export default function Home() {
  const { theme, toggle } = useTheme();
  const [user, setUser] = useState(null);
  const [stops, setStops] = useState([]);
  const [buses, setBuses] = useState([]);
  const [results, setResults] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [searching, setSearching] = useState(false);
  const [selectedBus, setSelectedBus] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [addBusOpen, setAddBusOpen] = useState(false);
  const [addStopOpen, setAddStopOpen] = useState(false);

  useEffect(() => {
    if (window.location.hash?.includes("session_id=")) return;
    (async () => {
      try { const me = await get("/auth/me"); setUser(me); } catch {}
    })();
    refresh();
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
  }, []);

  const refresh = async () => {
    try {
      const [s, b] = await Promise.all([get("/stops"), get("/buses")]);
      setStops(s); setBuses(b);
    } catch (e) { console.error(e); }
  };

  const onSearch = async ({ origin, destination }) => {
    setSearching(true); setRecommendation(null);
    try {
      const r = await post("/routes/search", { origin, destination });
      setResults(r);
      if (r.buses?.length > 0) {
        const rec = await post("/ai/recommend-route", { buses: r.buses });
        setRecommendation(rec);
      }
    } catch (e) { toast.error("Search failed"); }
    setSearching(false);
  };

  const logout = async () => {
    try { await post("/auth/logout", {}); } catch {}
    setUser(null);
    toast.success("Signed out");
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
      <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none p-4 sm:p-6 flex items-center justify-between gap-2">
        <div className="pointer-events-auto flex items-center gap-2 bg-background/95 backdrop-blur-2xl border border-border rounded-md px-3 py-2 shadow-sm">
          <div className="w-7 h-7 rounded-sm bg-foreground text-background flex items-center justify-center">
            <Bus className="w-4 h-4" />
          </div>
          <div>
            <p className="font-display font-black tracking-tighter leading-none">TransitPulse</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1">
              <Radio className="w-2.5 h-2.5 text-green-600 animate-pulse" /> Live · crowd-sourced
            </p>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={toggle} data-testid="theme-toggle" className="rounded-md">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="rounded-md gap-2" data-testid="user-menu">
                  <Avatar className="w-6 h-6">
                    <AvatarImage src={user.picture} />
                    <AvatarFallback>{user.name?.[0] || "U"}</AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline text-sm font-bold">{user.name}</span>
                  <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-muted-foreground">· trust {user.trust_score}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setAddBusOpen(true)} data-testid="menu-add-bus">
                  <Plus className="w-4 h-4 mr-2" /> Add bus
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAddStopOpen(true)} data-testid="menu-add-stop">
                  <MapPin className="w-4 h-4 mr-2" /> Add stop
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setReportOpen(true)} data-testid="menu-report">
                  <Sparkles className="w-4 h-4 mr-2" /> New report
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} data-testid="menu-logout">
                  <LogOut className="w-4 h-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button onClick={loginWithGoogle} data-testid="login-button" className="rounded-md font-bold">
              Sign in
            </Button>
          )}
        </div>
      </div>

      {/* Left search + results panel */}
      <div className="absolute top-20 left-0 sm:top-24 sm:left-6 z-20 pointer-events-none w-full sm:w-[400px] px-4 sm:px-0">
        <div className="pointer-events-auto bg-background/95 backdrop-blur-2xl border border-border rounded-xl shadow-sm overflow-hidden">
          <SearchPanel onSearch={onSearch} loading={searching} stops={stops} />
          {results && (
            <div className="border-t border-border max-h-[55vh] overflow-y-auto no-scrollbar">
              <RouteResults
                results={results}
                recommendation={recommendation}
                onSelect={setSelectedBus}
                onReport={() => setReportOpen(true)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Bottom-right stats card (desktop) */}
      <div className="hidden md:flex absolute bottom-6 right-6 z-20 pointer-events-auto bg-background/95 backdrop-blur-2xl border border-border rounded-xl px-4 py-3 shadow-sm gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">BUSES</p>
          <p className="font-display font-black text-2xl tracking-tighter">{buses.length}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">STOPS</p>
          <p className="font-display font-black text-2xl tracking-tighter">{stops.length}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">LIVE</p>
          <p className="font-display font-black text-2xl tracking-tighter text-green-600">●</p>
        </div>
      </div>

      <BusDetailSheet
        bus={selectedBus}
        open={!!selectedBus}
        onClose={() => setSelectedBus(null)}
        user={user}
        onOpenReport={() => setReportOpen(true)}
      />
      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        buses={buses}
        defaultBusId={selectedBus?.bus_id}
        onCreated={() => refresh()}
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
    </div>
  );
}
