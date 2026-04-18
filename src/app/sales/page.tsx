"use client";
import { useEffect, useMemo, useState } from "react";
import { Kpi } from "@/components/kpi";
import { formatCurrency } from "@/lib/utils";

interface Sale {
  id: string;
  month: string;
  salesAmount: string;
  forecastAmount: string | null;
  purchaseRatio: string;
  notes: string | null;
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/sales").then((x) => x.json());
    setSales(r);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  async function addMonth() {
    const defaultMonth = nextUnusedMonth(sales);
    const m = prompt("חודש להוספה (YYYY-MM):", defaultMonth);
    if (!m) return;
    if (!/^\d{4}-\d{2}$/.test(m)) {
      alert("פורמט לא תקין. יש להשתמש ב-YYYY-MM");
      return;
    }
    await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: m, salesAmount: 0, forecastAmount: null }),
    });
    load();
  }

  async function deleteRow(month: string) {
    if (!confirm(`למחוק את נתוני ${month}?`)) return;
    await fetch(`/api/sales/${month}`, { method: "DELETE" });
    load();
  }

  async function patchRow(month: string, patch: Partial<Sale>) {
    const body: Record<string, unknown> = {};
    if (patch.salesAmount !== undefined) body.salesAmount = patch.salesAmount === null ? 0 : parseFloat(String(patch.salesAmount));
    if (patch.forecastAmount !== undefined) body.forecastAmount = patch.forecastAmount === null || patch.forecastAmount === "" ? null : parseFloat(String(patch.forecastAmount));
    if (patch.notes !== undefined) body.notes = patch.notes ?? null;
    await fetch(`/api/sales/${month}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    load();
  }

  const totals = useMemo(() => {
    const actual = sales.reduce((s, r) => s + parseFloat(r.salesAmount || "0"), 0);
    const forecast = sales.reduce((s, r) => s + parseFloat(r.forecastAmount ?? "0"), 0);
    const latest = sales[0];
    const latestActual = latest ? parseFloat(latest.salesAmount || "0") : 0;
    const latestForecast = latest?.forecastAmount ? parseFloat(latest.forecastAmount) : 0;
    return { actual, forecast, latestActual, latestForecast, latestMonth: latest?.month };
  }, [sales]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1>מכירות והכנסות</h1>
        <button className="btn-primary" onClick={addMonth}>הוסף חודש</button>
      </div>

      <p className="text-sm text-slate-500">הזן תחזית מכירות בתחילת החודש, ועדכן את העמודה &quot;בפועל&quot; בסוף החודש. הנתונים האלה משמשים גם לגזירת תקציב הרכש החזוי (35%).</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="חודש אחרון" value={totals.latestMonth ?? "—"} hint={totals.latestForecast ? `תחזית: ${formatCurrency(totals.latestForecast)}` : undefined} />
        <Kpi label="מכירות בפועל אחרונות" value={totals.latestActual} tone="good" />
        <Kpi label="סך מכירות בפועל" value={totals.actual} tone="good" hint="סיכום כל החודשים" />
        <Kpi label="סך תחזיות" value={totals.forecast} hint="סיכום כל התחזיות שהוזנו" />
      </div>

      <div className="card overflow-x-auto">
        {loading ? "טוען..." : (
          <table className="table">
            <thead>
              <tr>
                <th>חודש</th>
                <th>תחזית</th>
                <th>בפועל</th>
                <th>פער</th>
                <th>הערות</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => {
                const forecast = s.forecastAmount ? parseFloat(s.forecastAmount) : null;
                const actual = parseFloat(s.salesAmount || "0");
                const diff = forecast != null ? actual - forecast : null;
                return (
                  <SalesRow
                    key={s.id}
                    row={s}
                    forecast={forecast}
                    actual={actual}
                    diff={diff}
                    onSave={(p) => patchRow(s.month, p)}
                    onDelete={() => deleteRow(s.month)}
                  />
                );
              })}
              {sales.length === 0 && !loading ? (
                <tr><td colSpan={6} className="text-center text-slate-500">לחץ &quot;הוסף חודש&quot; כדי להתחיל</td></tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SalesRow({ row, forecast, actual, diff, onSave, onDelete }: {
  row: Sale;
  forecast: number | null;
  actual: number;
  diff: number | null;
  onSave: (patch: Partial<Sale>) => Promise<void>;
  onDelete: () => void;
}) {
  const [forecastInput, setForecastInput] = useState(forecast != null ? String(forecast) : "");
  const [actualInput, setActualInput] = useState(String(actual));
  const [notesInput, setNotesInput] = useState(row.notes ?? "");
  const [saving, setSaving] = useState(false);

  const dirty = forecastInput !== (forecast != null ? String(forecast) : "")
    || actualInput !== String(actual)
    || notesInput !== (row.notes ?? "");

  async function save() {
    setSaving(true);
    await onSave({
      forecastAmount: forecastInput === "" ? null : forecastInput,
      salesAmount: actualInput === "" ? "0" : actualInput,
      notes: notesInput || null,
    });
    setSaving(false);
  }

  return (
    <tr>
      <td className="font-medium">{row.month}</td>
      <td>
        <input className="input max-w-[140px]" type="number" step="0.01" value={forecastInput} onChange={(e) => setForecastInput(e.target.value)} placeholder="—" />
      </td>
      <td>
        <input className="input max-w-[140px]" type="number" step="0.01" value={actualInput} onChange={(e) => setActualInput(e.target.value)} />
      </td>
      <td className={diff == null ? "text-slate-400" : diff >= 0 ? "text-emerald-700" : "text-red-700"}>
        {diff == null ? "—" : `${diff >= 0 ? "+" : ""}${formatCurrency(diff)}`}
      </td>
      <td>
        <input className="input" value={notesInput} onChange={(e) => setNotesInput(e.target.value)} />
      </td>
      <td className="flex gap-2">
        <button className="btn-primary" disabled={!dirty || saving} onClick={save}>{saving ? "..." : "שמור"}</button>
        <button className="btn-danger" onClick={onDelete}>מחק</button>
      </td>
    </tr>
  );
}

function nextUnusedMonth(sales: Sale[]): string {
  const months = new Set(sales.map((s) => s.month));
  const d = new Date();
  for (let i = 0; i < 60; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!months.has(key)) return key;
    d.setMonth(d.getMonth() + 1);
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
