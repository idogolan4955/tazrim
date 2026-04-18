import { formatCurrency } from "@/lib/utils";

export function Kpi({ label, value, hint, tone = "default" }: { label: string; value: number | string; hint?: string; tone?: "default" | "good" | "bad" }) {
  const toneClass = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-slate-900";
  const display = typeof value === "number" ? formatCurrency(value) : value;
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${toneClass}`}>{display}</div>
      {hint ? <div className="text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}
