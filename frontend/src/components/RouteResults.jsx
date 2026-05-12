import { Badge } from "@/components/ui/badge";
import { Clock, ChevronRight } from "lucide-react";
import { statusBadge, statusLabel } from "@/lib/status";

export default function RouteResults({ results, onSelect }) {
  if (!results) return null;
  const { buses = [], origin_stop, destination_stop } = results;

  if (!origin_stop || !destination_stop) {
    return (
      <div className="p-4" data-testid="no-results">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">NO MATCH</p>
        <p className="text-sm">
          Try stop names like <span className="font-bold">Times Square</span> or <span className="font-bold">Wall Street</span>.
        </p>
      </div>
    );
  }
  if (buses.length === 0) {
    return (
      <div className="p-4" data-testid="no-buses">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">NO DIRECT BUS</p>
        <p className="text-sm">
          No buses currently connect <span className="font-bold">{origin_stop.name}</span> to <span className="font-bold">{destination_stop.name}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 space-y-2" data-testid="route-results">
      <div className="flex items-center justify-between text-xs px-1">
        <span className="font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {buses.length} BUS{buses.length > 1 ? "ES" : ""}
        </span>
        <span className="text-muted-foreground truncate ml-2">
          {origin_stop.name} → {destination_stop.name}
        </span>
      </div>

      {buses.map((b) => (
        <button
          key={b.bus_id}
          data-testid={`bus-result-${b.number}`}
          onClick={() => onSelect(b)}
          className="w-full text-left border border-border rounded-md p-2.5 hover:border-foreground transition-colors bg-background"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="shrink-0 w-10 h-10 rounded-md bg-foreground text-background flex items-center justify-center font-display font-black tracking-tight text-sm">
                {b.number}
              </div>
              <div className="min-w-0">
                <p className="font-bold truncate text-sm">{b.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {b.eta_min} min
                  {b.direction ? ` · ${b.direction}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge className={`${statusBadge(b.status)} rounded-sm uppercase text-[10px] tracking-wider`}>
                {statusLabel(b.status)}
              </Badge>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
