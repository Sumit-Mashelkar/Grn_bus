import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { post, get } from "@/lib/api";
import { Sparkles, Clock, MapPin, ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

const statusColor = {
  on_time: "bg-green-600 text-white",
  delayed: "bg-yellow-500 text-black",
  cancelled: "bg-red-600 text-white",
};

export default function BusDetailSheet({ bus, open, onClose, user, onOpenReport }) {
  const [details, setDetails] = useState(null);
  const [reports, setReports] = useState([]);
  const [eta, setEta] = useState(null);
  const [loadingEta, setLoadingEta] = useState(false);

  useEffect(() => {
    if (!bus || !open) return;
    setDetails(null); setReports([]); setEta(null);
    (async () => {
      try {
        const d = await get(`/buses/${bus.bus_id}`);
        setDetails(d);
        const r = await get(`/reports?bus_id=${bus.bus_id}`);
        setReports(r);
      } catch (e) { console.error(e); }
    })();
  }, [bus, open]);

  const fetchEta = async () => {
    if (!bus) return;
    setLoadingEta(true);
    try {
      const r = await post("/ai/predict-eta", { bus_id: bus.bus_id, base_eta_min: bus.eta_min || 10 });
      setEta(r);
    } catch (e) { toast.error("AI ETA failed"); }
    setLoadingEta(false);
  };

  const vote = async (reportId, direction) => {
    if (!user) return toast.error("Please sign in to vote");
    try {
      const updated = await post(`/reports/${reportId}/vote`, { direction });
      setReports((rs) => rs.map((r) => (r.report_id === reportId ? updated : r)));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Vote failed");
    }
  };

  if (!bus) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[440px] p-0 overflow-y-auto bg-background/95 backdrop-blur-2xl border-l border-border"
        data-testid="bus-detail-sheet"
      >
        <SheetHeader className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-md bg-foreground text-background flex items-center justify-center font-display font-black tracking-tight text-lg">
              {bus.number}
            </div>
            <div className="flex-1">
              <SheetTitle className="font-display font-bold tracking-tight text-xl">{bus.name}</SheetTitle>
              <Badge className={`${statusColor[bus.status]} mt-1 rounded-sm uppercase text-[10px] tracking-wider`}>{bus.status.replace("_", " ")}</Badge>
            </div>
          </div>
        </SheetHeader>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-border rounded-md p-3">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">DEPARTURE</p>
              <p className="font-display font-bold text-2xl mt-1">{bus.departure_time}</p>
            </div>
            <div className="border border-border rounded-md p-3">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">ARRIVAL</p>
              <p className="font-display font-bold text-2xl mt-1">{bus.arrival_time}</p>
            </div>
          </div>

          <div className="border-2 border-foreground rounded-md p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <p className="text-xs font-bold uppercase tracking-[0.2em]">AI ETA PREDICTION</p>
              </div>
              <Button
                size="sm" variant="ghost"
                onClick={fetchEta} disabled={loadingEta}
                data-testid="predict-eta-button"
              >
                {loadingEta ? <Loader2 className="w-4 h-4 animate-spin" /> : "Predict"}
              </Button>
            </div>
            {eta ? (
              <>
                <p className="font-display font-black text-4xl tracking-tighter">{eta.predicted_eta_min} min</p>
                <p className="text-xs text-muted-foreground mt-1">{eta.explanation}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Confidence {Math.round((eta.confidence || 0) * 100)}%</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Tap predict to get a Claude-powered ETA using crowd signals.</p>
            )}
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-2">STOPS</p>
            <div className="space-y-2">
              {(details?.stop_details || bus.segment_stops || []).map((s, idx, arr) => (
                <div key={s.stop_id} className="flex items-center gap-3" data-testid={`stop-row-${s.stop_id}`}>
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-foreground" />
                    {idx < arr.length - 1 && <div className="w-0.5 h-6 bg-foreground/40" />}
                  </div>
                  <p className="text-sm font-medium">{s.name}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">COMMUNITY REPORTS</p>
              <Button size="sm" variant="outline" onClick={onOpenReport} data-testid="add-report-button">
                Report
              </Button>
            </div>
            <div className="space-y-2 max-h-[200px] overflow-y-auto no-scrollbar">
              {reports.length === 0 && <p className="text-sm text-muted-foreground">No reports yet.</p>}
              {reports.map((r) => {
                const accent = r.type === "delay" ? "border-l-yellow-500" : r.type === "cancellation" ? "border-l-red-600" : "border-l-green-600";
                return (
                  <div key={r.report_id} className={`border border-border border-l-4 ${accent} rounded-md p-3`} data-testid={`report-${r.report_id}`}>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{r.type} · {r.created_by_name || "anon"}</p>
                    <p className="text-sm mt-1">{r.message}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <button onClick={() => vote(r.report_id, "up")} className="flex items-center gap-1 text-xs hover:text-green-600" data-testid={`upvote-${r.report_id}`}>
                        <ThumbsUp className="w-3 h-3" /> {r.upvotes}
                      </button>
                      <button onClick={() => vote(r.report_id, "down")} className="flex items-center gap-1 text-xs hover:text-red-600" data-testid={`downvote-${r.report_id}`}>
                        <ThumbsDown className="w-3 h-3" /> {r.downvotes}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
