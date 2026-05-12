import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { post } from "@/lib/api";
import { toast } from "sonner";

export default function AddStopDialog({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim() || !lat || !lng) return toast.error("All fields required");
    setLoading(true);
    try {
      const s = await post("/stops", { name: name.trim(), lat: Number(lat), lng: Number(lng) });
      toast.success("Stop added");
      onCreated?.(s);
      setName(""); setLat(""); setLng("");
      onClose();
    } catch (e) { toast.error("Create failed"); }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="add-stop-dialog">
        <DialogHeader>
          <DialogTitle className="font-display font-bold tracking-tight">Add a bus stop</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riverside Park" data-testid="stop-name-input" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Latitude</Label>
              <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="40.78" data-testid="stop-lat-input" />
            </div>
            <div>
              <Label>Longitude</Label>
              <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-73.97" data-testid="stop-lng-input" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={loading} data-testid="submit-stop-button">{loading ? "Adding…" : "Add Stop"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
