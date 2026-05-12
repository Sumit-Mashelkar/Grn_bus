// Shared bus status enum + colors (single source of truth for the UI)
export const STATUS_OPTIONS = [
  { value: "running",   label: "Running",   color: "#16A34A", bg: "bg-green-600 text-white" },
  { value: "delayed",   label: "Delayed",   color: "#EAB308", bg: "bg-yellow-500 text-black" },
  { value: "arriving",  label: "Arriving",  color: "#2563EB", bg: "bg-blue-600 text-white" },
  { value: "cancelled", label: "Cancelled", color: "#DC2626", bg: "bg-red-600 text-white" },
];

export const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s]));

export function statusBadge(value) {
  return STATUS_MAP[value]?.bg || "bg-zinc-500 text-white";
}

export function statusLabel(value) {
  return STATUS_MAP[value]?.label || value;
}

export function statusColor(value) {
  return STATUS_MAP[value]?.color || "#71717A";
}
