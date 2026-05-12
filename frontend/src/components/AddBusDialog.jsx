import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { post } from "@/lib/api";
import { toast } from "sonner";
import { MultiStopPicker } from "@/components/MultiStopPicker";

export default function AddBusDialog({ open, onClose, stops, onCreated }) {
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState([]);
  const [departure, setDeparture] = useState("06:00");
  const [arrival, setArrival] = useState("22:00");
  const [freq, setFreq] = useState(15);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!number.trim() || !name.trim() || selected.length < 2)
      return toast.error("Number, name, and at least 2 stops required");
    setLoading(true);
    try {
      const b = await post("/buses", {
        number: number.trim(),
        name: name.trim(),
        stops: selected,
        departure_time: departure,
        arrival_time: arrival,
        frequency_min: Number(freq) || 15,
      });
      toast.success("Bus added");
      onCreated?.(b);
      setNumber(""); setName(""); setSelected([]);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Create failed");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="add-bus-dialog">
        <DialogHeader>
          <DialogTitle className="font-display font-bold tracking-tight">Add a bus</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Number</Label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="M99" data-testid="bus-number-input" />
            </div>
            <div>
              <Label>Route name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Riverside Express" data-testid="bus-name-input" />
            </div>
          </div>
          <div>
            <Label>Stops (in order)</Label>
            <MultiStopPicker stops={stops} value={selected} onChange={setSelected} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Departure</Label>
              <Input value={departure} onChange={(e) => setDeparture(e.target.value)} data-testid="bus-departure-input" />
            </div>
            <div>
              <Label>Arrival</Label>
              <Input value={arrival} onChange={(e) => setArrival(e.target.value)} data-testid="bus-arrival-input" />
            </div>
            <div>
              <Label>Freq (min)</Label>
              <Input value={freq} onChange={(e) => setFreq(e.target.value)} type="number" data-testid="bus-freq-input" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={loading} data-testid="submit-bus-button">{loading ? "Adding…" : "Add Bus"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
