import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { get } from "@/lib/api";
import { Clock, Radio, LocateFixed } from "lucide-react";

const statusColor = {
  on_time: "bg-green-600 text-white",
  delayed: "bg-yellow-500 text-black",
  cancelled: "bg-red-600 text-white",
};

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.max(0, Math.floor(diff))}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function BusDetailSheet({ bus, open, onClose, onUpdateLocation }) {
  const [details, setDetails] = useState(null);

  useEffect(() => {
    if (!bus || !open) return;
    setDetails(null);
    (async () => {
      try {
        const d = await get(`/buses/${bus.bus_id}`);
        setDetails(d);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [bus, open]);

  if (!bus) return null;
  const stopsList = details?.stops || bus.segment_stops || [];

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[440px] p-0 overflow-y-auto bg-background/95 backdrop-blur-2xl border-l border-border"
        data-testid="bus-detail-sheet"
      >
        <SheetHeader className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-md bg-foreground text-background flex items-center justify-center font-display font-black tracking-tight text-lg">
              {bus.number}
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="font-display font-bold tracking-tight text-xl truncate">
                {bus.name}
              </SheetTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge className={`${statusColor[bus.status]} rounded-sm uppercase text-[10px] tracking-wider`}>
                  {bus.status.replace("_", " ")}
                </Badge>
                {bus.eta_min != null && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {bus.eta_min} min ETA
                  </span>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-border rounded-md p-3">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">DEPARTURE</p>
              <p className="font-display font-bold text-2xl mt-1">{bus.departure_time}</p>
            </div>
            <div className="border border-border rounded-md p-3">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">ARRIVAL</p>
              <p className="font-display font-bold text-2xl mt-1">{bus.arrival_time}</p>
            </div>
          </div>

          <div className="border-2 border-foreground rounded-md p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-green-600 animate-pulse" />
                <p className="text-xs font-bold uppercase tracking-[0.2em]">LIVE POSITION</p>
              </div>
              <span className="text-xs text-muted-foreground">{timeAgo(bus.last_update)}</span>
            </div>
            {bus.current_lat != null ? (
              <p className="text-sm font-mono">
                {Number(bus.current_lat).toFixed(5)}, {Number(bus.current_lng).toFixed(5)}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No location reported yet.</p>
            )}
            <Button
              onClick={() => onUpdateLocation(bus)}
              variant="outline"
              className="w-full mt-3 rounded-md border-foreground"
              data-testid="update-location-button"
            >
              <LocateFixed className="w-4 h-4 mr-2" /> Update live location
            </Button>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-2">
              ROUTE · {stopsList.length} STOPS
            </p>
            <div className="space-y-2">
              {stopsList.map((s, idx) => (
                <div key={s.stop_id} className="flex items-center gap-3" data-testid={`stop-row-${s.stop_id}`}>
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-foreground" />
                    {idx < stopsList.length - 1 && <div className="w-0.5 h-6 bg-foreground/40" />}
                  </div>
                  <p className="text-sm font-medium">{s.name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
