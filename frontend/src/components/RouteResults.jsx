import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Clock, Bus as BusIcon, ChevronRight, AlertTriangle } from "lucide-react";

const statusColor = {
  on_time: "bg-green-600 text-white",
  delayed: "bg-yellow-500 text-black",
  cancelled: "bg-red-600 text-white",
};

export default function RouteResults({ results, recommendation, onSelect, onReport }) {
  if (!results) return null;
  const { buses = [], origin_stop, destination_stop } = results;

  if (!origin_stop || !destination_stop) {
    return (
      <div className="p-5" data-testid="no-results">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">NO MATCH</p>
        <p className="text-sm">No stops matched your search. Try names like <span className="font-bold">Times Square</span> or <span className="font-bold">Wall Street</span>.</p>
      </div>
    );
  }
  if (buses.length === 0) {
    return (
      <div className="p-5" data-testid="no-buses">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">NO DIRECT BUS</p>
        <p className="text-sm">No buses currently connect <span className="font-bold">{origin_stop.name}</span> to <span className="font-bold">{destination_stop.name}</span>.</p>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-3" data-testid="route-results">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {buses.length} BUS{buses.length > 1 ? "ES" : ""} FOUND
        </p>
        <span className="text-xs text-muted-foreground">{origin_stop.name} → {destination_stop.name}</span>
      </div>

      {recommendation && recommendation.recommendation && (
        <div className="border border-foreground rounded-md p-3 bg-secondary" data-testid="ai-recommendation">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4" />
            <p className="text-xs font-bold uppercase tracking-[0.2em]">AI Pick</p>
          </div>
          <p className="text-sm font-bold">
            Bus {recommendation.recommendation.number} — {recommendation.recommendation.name}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{recommendation.explanation}</p>
        </div>
      )}

      <div className="space-y-2 max-h-[40vh] overflow-y-auto no-scrollbar">
        {buses.map((b) => (
          <button
            key={b.bus_id}
            data-testid={`bus-result-${b.number}`}
            onClick={() => onSelect(b)}
            className="w-full text-left border border-border rounded-md p-3 hover:border-foreground hover:-translate-y-0.5 transition-all bg-background"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0 w-12 h-12 rounded-md bg-foreground text-background flex items-center justify-center font-display font-black tracking-tight">
                  {b.number}
                </div>
                <div className="min-w-0">
                  <p className="font-bold truncate">{b.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> {b.eta_min} min · {b.departure_time}–{b.arrival_time}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge className={`${statusColor[b.status]} rounded-sm uppercase text-[10px] tracking-wider`}>{b.status.replace("_", " ")}</Badge>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </button>
        ))}
      </div>

      <Button
        onClick={onReport}
        variant="outline"
        data-testid="open-report-button"
        className="w-full rounded-md border-foreground"
      >
        <AlertTriangle className="w-4 h-4 mr-2" /> Report an issue
      </Button>
    </div>
  );
}
