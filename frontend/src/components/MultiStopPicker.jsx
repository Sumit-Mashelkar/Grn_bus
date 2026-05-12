import { Button } from "@/components/ui/button";
import { X, GripVertical } from "lucide-react";

export function MultiStopPicker({ stops, value, onChange }) {
  const available = stops.filter((s) => !value.includes(s.stop_id));
  const add = (id) => onChange([...value, id]);
  const remove = (id) => onChange(value.filter((v) => v !== id));
  const move = (idx, dir) => {
    const next = [...value];
    const tgt = idx + dir;
    if (tgt < 0 || tgt >= next.length) return;
    [next[idx], next[tgt]] = [next[tgt], next[idx]];
    onChange(next);
  };
  const nameOf = (id) => stops.find((s) => s.stop_id === id)?.name || id;

  return (
    <div className="space-y-2" data-testid="multi-stop-picker">
      <div className="border border-border rounded-md p-2 min-h-[80px] space-y-1 max-h-[150px] overflow-y-auto">
        {value.length === 0 && <p className="text-xs text-muted-foreground p-2">Select stops below</p>}
        {value.map((id, idx) => (
          <div key={id} className="flex items-center gap-2 bg-secondary rounded-sm px-2 py-1">
            <GripVertical className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs flex-1 truncate">{idx + 1}. {nameOf(id)}</span>
            <button type="button" onClick={() => move(idx, -1)} className="text-xs px-1">↑</button>
            <button type="button" onClick={() => move(idx, 1)} className="text-xs px-1">↓</button>
            <button type="button" onClick={() => remove(id)}><X className="w-3 h-3" /></button>
          </div>
        ))}
      </div>
      <select
        className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
        onChange={(e) => { if (e.target.value) { add(e.target.value); e.target.value = ""; } }}
        data-testid="stop-add-select"
      >
        <option value="">+ Add stop…</option>
        {available.map((s) => (
          <option key={s.stop_id} value={s.stop_id}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}
