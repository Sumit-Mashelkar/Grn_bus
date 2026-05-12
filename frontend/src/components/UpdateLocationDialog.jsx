import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { post } from "@/lib/api";
import { toast } from "sonner";
import { STATUS_OPTIONS } from "@/lib/status";
import { LocateFixed } from "lucide-react";

export default function UpdateLocationDialog({ open, onClose, bus, onUpdated }) {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [status, setStatus] = useState("running");
  const [loading, setLoading] = useState(false);

  // Reset fields whenever a different bus is selected
  useEffect(() => {
    if (bus) {
      setLat(bus.current_lat ?? "");
      setLng(bus.current_lng ?? "");
      setStatus(bus.status || "running");
    }
  }, [bus]);

  const useGeolocation = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        toast.success("Got your location");
      },
      () => toast.error("Could not get location"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const submit = async () => {
    if (!bus || lat === "" || lng === "") return toast.error("Tap 'Use my location' or enter coords");
    setLoading(true);
    try {
      const r = await post(`/buses/${bus.bus_id}/location`, {
        lat: Number(lat),
        lng: Number(lng),
        status,
      });
      toast.success(`Updated ${bus.number}`);
      onUpdated?.(r);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Update failed");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="update-location-dialog">
        <DialogHeader>
          <DialogTitle className="font-display font-bold tracking-tight">
            Update {bus?.number} live location
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Crowd-sourced — anyone riding this bus can broadcast its position. Tap
            "Use my current location" for the easiest update.
          </p>
          <Button
            type="button"
            variant="default"
            onClick={useGeolocation}
            className="w-full rounded-md"
            data-testid="use-geolocation-button"
          >
            <LocateFixed className="w-4 h-4 mr-2" /> Use my current location
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Latitude</Label>
              <Input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="40.7580"
                data-testid="loc-lat-input"
              />
            </div>
            <div>
              <Label className="text-xs">Longitude</Label>
              <Input
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="-73.9855"
                data-testid="loc-lng-input"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid="loc-status-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={loading} data-testid="submit-location-button">
            {loading ? "Updating…" : "Broadcast update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
