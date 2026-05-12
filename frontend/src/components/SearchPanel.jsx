import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight, MapPin, Navigation, ArrowUpDown, X } from "lucide-react";

export default function SearchPanel({ onSearch, onClear, loading, stops = [], hasResults = false }) {
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

  const clear = () => {
    setOrigin("");
    setDestination("");
    onClear?.();
  };

  return (
    <form onSubmit={submit} className="p-3 sm:p-4" data-testid="search-panel">
      <div className="flex items-center gap-2">
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="relative">
            <MapPin className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              data-testid="origin-input"
              placeholder="From"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className="h-10 pl-7 rounded-md border-border focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary text-sm"
              list="stops-list"
            />
          </div>
          <div className="relative">
            <Navigation className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              data-testid="destination-input"
              placeholder="To"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="h-10 pl-7 rounded-md border-border focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary text-sm"
              list="stops-list"
            />
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={swap}
          data-testid="swap-button"
          className="h-10 w-10 rounded-md shrink-0"
          title="Swap"
        >
          <ArrowUpDown className="w-4 h-4" />
        </Button>
        <Button
          type="submit"
          size="icon"
          disabled={loading}
          data-testid="search-button"
          className="h-10 w-10 rounded-md shrink-0 bg-primary text-primary-foreground"
          title="Find buses"
        >
          <ArrowRight className="w-4 h-4" />
        </Button>
        {hasResults && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={clear}
            data-testid="clear-search-button"
            className="h-10 w-10 rounded-md shrink-0"
            title="Clear"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      <datalist id="stops-list">
        {stops.map((s) => (
          <option key={s.stop_id} value={s.name} />
        ))}
      </datalist>
    </form>
  );
}
