import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { post } from "@/lib/api";
import { toast } from "sonner";
import { STATUS_OPTIONS } from "@/lib/status";
import { X, GripVertical, LocateFixed, Plus } from "lucide-react";

export default function AddBusDialog({ open, onClose, stops, onCreated }) {
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [direction, setDirection] = useState("");
  const [sourceStop, setSourceStop] = useState("");
  const [destStop, setDestStop] = useState("");
  const [intermediates, setIntermediates] = useState([]); // ordered stop_ids
  const [status, setStatus] = useState("running");
  const [shareGps, setShareGps] = useState(false);
  const [gpsCoords, setGpsCoords] = useState(null);
  const [loading, setLoading] = useState(false);

  const stopMap = useMemo(() => Object.fromEntries(stops.map((s) => [s.stop_id, s])), [stops]);

  const used = new Set([sourceStop, destStop, ...intermediates].filter(Boolean));
  const availableIntermediates = stops.filter((s) => !used.has(s.stop_id));

  const requestGps = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setShareGps(true);
        toast.success("Live GPS captured");
      },
      () => toast.error("Could not get your location"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const reset = () => {
    setNumber(""); setName(""); setDirection("");
    setSourceStop(""); setDestStop(""); setIntermediates([]);
    setStatus("running"); setShareGps(false); setGpsCoords(null);
  };

  const moveIntermediate = (idx, dir) => {
    const next = [...intermediates];
    const t = idx + dir;
    if (t < 0 || t >= next.length) return;
    [next[idx], next[t]] = [next[t], next[idx]];
    setIntermediates(next);
  };

  const submit = async () => {
    if (!number.trim() || !name.trim()) return toast.error("Bus number & name are required");
    if (!sourceStop || !destStop) return toast.error("Pick a source and destination stop");
    if (sourceStop === destStop) return toast.error("Source and destination must differ");

    const orderedStops = [sourceStop, ...intermediates, destStop];
    setLoading(true);
    try {
      const created = await post("/buses", {
        number: number.trim(),
        name: name.trim(),
        direction: direction.trim(),
        status,
        stops: orderedStops,
      });
      // If user opted in, push their current GPS as initial location
      if (shareGps && gpsCoords) {
        try {
          await post(`/buses/${created.bus_id}/location`, {
            lat: gpsCoords.lat,
            lng: gpsCoords.lng,
            status,
          });
        } catch {/* non-fatal */}
      }
      toast.success(`Bus ${created.number} added`);
      onCreated?.(created);
      reset();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Create failed");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="add-bus-dialog">
        <DialogHeader>
          <DialogTitle className="font-display font-bold tracking-tight">Add a bus</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Number</Label>
              <Input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="e.g. M99"
                data-testid="bus-number-input"
              />
            </div>
            <div>
              <Label className="text-xs">Route name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Riverside Express"
                data-testid="bus-name-input"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Direction (optional)</Label>
            <Input
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              placeholder="e.g. Northbound, Downtown → Uptown"
              data-testid="bus-direction-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Source stop</Label>
              <Select value={sourceStop} onValueChange={setSourceStop}>
                <SelectTrigger data-testid="source-stop-select"><SelectValue placeholder="Start" /></SelectTrigger>
                <SelectContent>
                  {stops.filter((s) => s.stop_id !== destStop).map((s) => (
                    <SelectItem key={s.stop_id} value={s.stop_id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Destination stop</Label>
              <Select value={destStop} onValueChange={setDestStop}>
                <SelectTrigger data-testid="dest-stop-select"><SelectValue placeholder="End" /></SelectTrigger>
                <SelectContent>
                  {stops.filter((s) => s.stop_id !== sourceStop).map((s) => (
                    <SelectItem key={s.stop_id} value={s.stop_id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Intermediate stops (optional, in order)</Label>
            <div className="border border-border rounded-md p-2 space-y-1 min-h-[44px] mt-1" data-testid="intermediate-stops-list">
              {intermediates.length === 0 && (
                <p className="text-xs text-muted-foreground p-1">No intermediate stops</p>
              )}
              {intermediates.map((id, idx) => (
                <div key={id} className="flex items-center gap-2 bg-secondary rounded-sm px-2 py-1">
                  <GripVertical className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs flex-1 truncate">{idx + 1}. {stopMap[id]?.name || id}</span>
                  <button type="button" onClick={() => moveIntermediate(idx, -1)} className="text-xs px-1" title="Up">↑</button>
                  <button type="button" onClick={() => moveIntermediate(idx, 1)} className="text-xs px-1" title="Down">↓</button>
                  <button type="button" onClick={() => setIntermediates((xs) => xs.filter((x) => x !== id))} title="Remove">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <Select
              value=""
              onValueChange={(v) => v && setIntermediates((xs) => [...xs, v])}
            >
              <SelectTrigger className="mt-1" data-testid="add-intermediate-select">
                <SelectValue placeholder="+ Add intermediate stop" />
              </SelectTrigger>
              <SelectContent>
                {availableIntermediates.length === 0 && (
                  <div className="px-2 py-1 text-xs text-muted-foreground">No more stops to add</div>
                )}
                {availableIntermediates.map((s) => (
                  <SelectItem key={s.stop_id} value={s.stop_id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Current status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid="bus-status-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border border-border rounded-md p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">SHARE LIVE GPS</p>
                <p className="text-xs text-muted-foreground mt-0.5">Optional — broadcasts your current position as the bus's location.</p>
              </div>
              <Button
                type="button"
                variant={shareGps ? "default" : "outline"}
                size="sm"
                onClick={requestGps}
                data-testid="share-gps-button"
                className="rounded-md shrink-0"
              >
                <LocateFixed className="w-4 h-4 mr-1" />
                {shareGps && gpsCoords ? "On" : "Off"}
              </Button>
            </div>
            {shareGps && gpsCoords && (
              <p className="text-[10px] font-mono text-muted-foreground mt-2">
                {gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={loading} data-testid="submit-bus-button">
            {loading ? "Adding…" : <><Plus className="w-4 h-4 mr-1" /> Add bus</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
