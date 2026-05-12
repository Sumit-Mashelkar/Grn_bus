import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { post } from "@/lib/api";
import { toast } from "sonner";

export default function ReportDialog({ open, onClose, buses, defaultBusId, onCreated }) {
  const [busId, setBusId] = useState(defaultBusId || "");
  const [type, setType] = useState("delay");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!busId || !message.trim()) return toast.error("Bus and message required");
    setLoading(true);
    try {
      const r = await post("/reports", { bus_id: busId, type, message: message.trim() });
      if (r.is_spam) toast.error("Report flagged as spam by AI moderator");
      else toast.success("Report submitted");
      onCreated?.(r);
      setMessage("");
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Submit failed");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="report-dialog">
        <DialogHeader>
          <DialogTitle className="font-display font-bold tracking-tight">Report an issue</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Bus</Label>
            <Select value={busId || defaultBusId} onValueChange={setBusId}>
              <SelectTrigger data-testid="report-bus-select"><SelectValue placeholder="Choose a bus" /></SelectTrigger>
              <SelectContent>
                {buses.map((b) => (
                  <SelectItem key={b.bus_id} value={b.bus_id}>{b.number} — {b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger data-testid="report-type-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="delay">Delay</SelectItem>
                <SelectItem value="cancellation">Cancellation</SelectItem>
                <SelectItem value="crowded">Crowded</SelectItem>
                <SelectItem value="on_time">On time</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Details</Label>
            <Textarea
              data-testid="report-message-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What did you observe? (e.g. 10 min late at Union Square)"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={loading} data-testid="submit-report-button">
            {loading ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
