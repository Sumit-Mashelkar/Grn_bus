import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight, MapPin, Navigation } from "lucide-react";

export default function SearchPanel({ onSearch, loading, stops = [] }) {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");

  const submit = (e) => {
    e?.preventDefault();
    if (!origin.trim() || !destination.trim()) return;
    onSearch({ origin: origin.trim(), destination: destination.trim() });
  };

  const swap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  return (
    <form onSubmit={submit} className="space-y-3 p-5" data-testid="search-panel">
      <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">PLAN YOUR TRIP</p>
        <h2 className="text-xl font-bold tracking-tight font-display">Where to?</h2>
      </div>

      <div className="relative space-y-2">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 shrink-0 text-foreground" />
          <Input
            data-testid="origin-input"
            placeholder="Start (e.g. Central Station)"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className="h-11 rounded-md border-border focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary"
            list="stops-list"
          />
        </div>
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 shrink-0 text-foreground" />
          <Input
            data-testid="destination-input"
            placeholder="Destination (e.g. Wall Street)"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="h-11 rounded-md border-border focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary"
            list="stops-list"
          />
        </div>
        <datalist id="stops-list">
          {stops.map((s) => (
            <option key={s.stop_id} value={s.name} />
          ))}
        </datalist>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={swap}
          data-testid="swap-button"
          className="rounded-md"
        >
          Swap
        </Button>
        <Button
          type="submit"
          disabled={loading}
          data-testid="search-button"
          className="flex-1 h-11 rounded-md bg-primary text-primary-foreground font-bold tracking-tight hover:-translate-y-0.5 transition-all"
        >
          {loading ? "Searching…" : "Find buses"}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </form>
  );
}
