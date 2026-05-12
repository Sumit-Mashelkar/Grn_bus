import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { post } from "@/lib/api";
import { toast } from "sonner";
import { LocateFixed } from "lucide-react";

export default function UpdateLocationDialog({ open, onClose, bus, onUpdated }) {
  const [lat, setLat] = useState(bus?.current_lat ?? "");
  const [lng, setLng] = useState(bus?.current_lng ?? "");
  const [status, setStatus] = useState(bus?.status || "on_time");
  const [loading, setLoading] = useState(false);

  // Reset fields whenever the dialog is reopened for a new bus
  if (open && bus && lat === "" && lng === "" && bus.current_lat != null) {
    setLat(bus.current_lat);
    setLng(bus.current_lng);
  }

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
    if (!bus || lat === "" || lng === "") return toast.error("Lat & lng required");
    setLoading(true);
    try {
      const r = await post(`/buses/${bus.bus_id}/location`, {
        lat: Number(lat),
        lng: Number(lng),
        status,
      });
      toast.success(`Updated ${bus.number} live position`);
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
            Update bus {bus?.number} location
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Crowd-sourced. Anyone on this bus can post its current location and status — every
            other user will see the marker move on the map in real time.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Latitude</Label>
              <Input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="40.7580"
                data-testid="loc-lat-input"
              />
            </div>
            <div>
              <Label>Longitude</Label>
              <Input
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="-73.9855"
                data-testid="loc-lng-input"
              />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={useGeolocation}
            className="w-full rounded-md"
            data-testid="use-geolocation-button"
          >
            <LocateFixed className="w-4 h-4 mr-2" /> Use my current location
          </Button>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid="loc-status-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on_time">On time</SelectItem>
                <SelectItem value="delayed">Delayed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
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
