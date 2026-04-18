"use client";
import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Kpi } from "@/components/kpi";
import { formatCurrency } from "@/lib/utils";

interface Sales {
  id: string;
  month: string;
  salesAmount: string;
  forecastAmount: string | null;
  actualPurchase: string | null;
  purchaseRatio: string;
  notes: string | null;
}

interface Account { id: string; name: string; color: string; }

interface Settings {
  opening_inventory: string;
  opening_inventory_date: string;
  cogs_ratio: string;
  default_purchase_account_id: string;
  default_purchase_ratio: string;
}

export default function PurchasingPage() {
  const [sales, setSales] = useState<Sales[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [s, a, st] = await Promise.all([
      fetch("/api/sales").then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]);
    setSales(s);
    setAccounts(a);
    setSettings(st);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  async function patchSettings(patch: Partial<Settings>) {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    load();
  }

  async function patchMonth(month: string, patch: Record<string, unknown>) {
    await fetch(`/api/sales/${month}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    load();
  }

  const defaultRatio = parseFloat(settings?.default_purchase_ratio ?? "0.35");
  const cogsRatio = parseFloat(settings?.cogs_ratio ?? "0.35");

  async function applyRatioToAllMonths() {
    if (!confirm(`לעדכן את אחוז הרכש לכל החודשים בטבלה ל-${(defaultRatio * 100).toFixed(0)}%?`)) return;
    for (const s of sales) {
      if (parseFloat(s.purchaseRatio) !== defaultRatio) {
        await fetch(`/api/sales/${s.month}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchaseRatio: defaultRatio }),
        });
      }
    }
    load();
  }

  const rows = useMemo(() => {
    return [...sales]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((s) => {
        const actual = parseFloat(s.salesAmount || "0");
        const forecast = s.forecastAmount ? parseFloat(s.forecastAmount) : null;
        const actualPurchase = s.actualPurchase ? parseFloat(s.actualPurchase) : null;
        const ratio = parseFloat(s.purchaseRatio);
        const basis = actual > 0 ? actual : (forecast ?? 0);
        const plannedPurchase = basis * ratio;
        const cogs = basis * cogsRatio;
        const varianceVsPlan = actualPurchase != null ? actualPurchase - plannedPurchase : null;
        const deltaInventory = actualPurchase != null ? actualPurchase - cogs : null;
        return {
          month: s.month,
          actual,
          forecast,
          ratio,
          basis,
          plannedPurchase,
          actualPurchase,
          cogs,
          varianceVsPlan,
          deltaInventory,
          kind: actual > 0 ? "actual" : "forecast",
        };
      });
  }, [sales, cogsRatio]);

  const totals = {
    actualSales: rows.reduce((s, r) => s + r.actual, 0),
    forecastSales: rows.reduce((s, r) => s + (r.forecast ?? 0), 0),
    plannedPurchase: rows.reduce((s, r) => s + r.plannedPurchase, 0),
    actualPurchase: rows.reduce((s, r) => s + (r.actualPurchase ?? 0), 0),
    cogs: rows.reduce((s, r) => s + r.cogs, 0),
    varianceVsPlan: rows.reduce((s, r) => s + (r.varianceVsPlan ?? 0), 0),
    deltaInventory: rows.reduce((s, r) => s + (r.deltaInventory ?? 0), 0),
  };

  const defaultAccountName = accounts.find((a) => a.id === settings?.default_purchase_account_id)?.name;

  return (
    <div className="flex flex-col gap-4">
      <h1>רכש חזוי ובפועל</h1>
      <p className="text-sm text-slate-500">
        תקציב הרכש מחושב מנתוני המכירות × מקדם. עדכן את הרכש בפועל לכל חודש כדי לראות פער מול התקציב ומול עלות המכר (כלומר — האם המלאי גדל או נאכל).
      </p>

      <div className="card grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div>
          <label className="label">מקדם רכש ברירת מחדל (0-1)</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min="0"
            max="1"
            defaultValue={settings?.default_purchase_ratio ?? "0.35"}
            onBlur={(e) => patchSettings({ default_purchase_ratio: e.target.value })}
          />
          <div className="text-xs text-slate-500 mt-1">{(defaultRatio * 100).toFixed(0)}% מהמכירות</div>
        </div>
        <div>
          <label className="label">חשבון רכש בתזרים</label>
          <select
            className="input"
            value={settings?.default_purchase_account_id ?? ""}
            onChange={(e) => patchSettings({ default_purchase_account_id: e.target.value })}
          >
            <option value="">— ללא (רכש לא משפיע על תזרים) —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div className="text-xs text-slate-500 mt-1">
            {defaultAccountName ? `רכש מתוכנן עתידי מופיע כהוצאה בחשבון "${defaultAccountName}"` : "בלי חשבון, הרכש לא משפיע על תזרים"}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={applyRatioToAllMonths} disabled={!sales.length}>
            החל מקדם על כל הטבלה
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="סך רכש מתוכנן" value={totals.plannedPurchase} hint="לפי מקדם × מכירות" />
        <Kpi label="סך רכש בפועל" value={totals.actualPurchase} tone={totals.actualPurchase > 0 ? "bad" : "default"} />
        <Kpi label="פער מהמתוכנן" value={totals.varianceVsPlan} tone={totals.varianceVsPlan > 0 ? "bad" : "good"} hint={totals.varianceVsPlan > 0 ? "קניתי יותר מהתקציב" : "קניתי בתוך/מתחת לתקציב"} />
        <Kpi label="Δ מלאי (מול עלות מכר)" value={totals.deltaInventory} tone={totals.deltaInventory >= 0 ? "good" : "bad"} hint={totals.deltaInventory >= 0 ? "המלאי גדל" : "אכלתי מהמלאי"} />
      </div>

      <section className="card">
        <h2 className="mb-3">מכירות ורכש לאורך זמן</h2>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={rows}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis orientation="right" tickFormatter={(v) => new Intl.NumberFormat("he-IL").format(v)} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ direction: "rtl" }} />
              <Legend />
              <Bar dataKey="forecast" fill="#94a3b8" name="תחזית מכירות" />
              <Bar dataKey="actual" fill="#1f4df5" name="מכירות בפועל" />
              <Bar dataKey="plannedPurchase" fill="#fbbf24" name="רכש מתוכנן" />
              <Bar dataKey="actualPurchase" fill="#f97316" name="רכש בפועל" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="card overflow-x-auto">
        <div className="text-sm text-slate-500 mb-2">
          עריכת המכירות בעמוד <a className="text-brand-700 underline" href="/sales">המכירות</a>. כאן עורכים רק את הרכש בפועל ואת המקדם.
        </div>
        {loading ? "טוען..." : (
          <table className="table">
            <thead>
              <tr>
                <th>חודש</th>
                <th>תחזית מכירות</th>
                <th>מכירות בפועל</th>
                <th>מקדם</th>
                <th>רכש מתוכנן</th>
                <th>רכש בפועל</th>
                <th>פער</th>
                <th>עלות מכר</th>
                <th>Δ מלאי</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <PurchaseRow
                  key={r.month}
                  row={r}
                  onSaveActual={(v) => patchMonth(r.month, { actualPurchase: v === "" ? null : parseFloat(v) })}
                  onSaveRatio={(v) => patchMonth(r.month, { purchaseRatio: parseFloat(v || "0") })}
                />
              ))}
              {rows.length === 0 && !loading ? (
                <tr><td colSpan={9} className="text-center text-slate-500">הוסף חודשי מכירות בעמוד המכירות</td></tr>
              ) : (
                <tr className="bg-slate-50 font-semibold">
                  <td>סיכום</td>
                  <td>{formatCurrency(totals.forecastSales)}</td>
                  <td className="text-emerald-700">{formatCurrency(totals.actualSales)}</td>
                  <td>—</td>
                  <td className="text-amber-700">{formatCurrency(totals.plannedPurchase)}</td>
                  <td className="text-orange-700">{formatCurrency(totals.actualPurchase)}</td>
                  <td className={totals.varianceVsPlan > 0 ? "text-red-700" : totals.varianceVsPlan < 0 ? "text-emerald-700" : ""}>
                    {formatCurrency(totals.varianceVsPlan)}
                  </td>
                  <td>{formatCurrency(totals.cogs)}</td>
                  <td className={totals.deltaInventory >= 0 ? "text-emerald-700" : "text-red-700"}>
                    {formatCurrency(totals.deltaInventory)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

interface Row {
  month: string;
  actual: number;
  forecast: number | null;
  ratio: number;
  basis: number;
  plannedPurchase: number;
  actualPurchase: number | null;
  cogs: number;
  varianceVsPlan: number | null;
  deltaInventory: number | null;
  kind: string;
}

function PurchaseRow({ row, onSaveActual, onSaveRatio }: {
  row: Row;
  onSaveActual: (v: string) => Promise<void>;
  onSaveRatio: (v: string) => Promise<void>;
}) {
  const [actualInput, setActualInput] = useState(row.actualPurchase != null ? String(row.actualPurchase) : "");
  const [ratioInput, setRatioInput] = useState(String(row.ratio));
  const [saving, setSaving] = useState(false);

  const actualDirty = actualInput !== (row.actualPurchase != null ? String(row.actualPurchase) : "");
  const ratioDirty = ratioInput !== String(row.ratio);
  const dirty = actualDirty || ratioDirty;

  async function save() {
    setSaving(true);
    if (ratioDirty) await onSaveRatio(ratioInput);
    if (actualDirty) await onSaveActual(actualInput);
    setSaving(false);
  }

  const variance = row.varianceVsPlan;
  const delta = row.deltaInventory;

  return (
    <tr>
      <td className="font-medium">{row.month}</td>
      <td>{row.forecast != null ? formatCurrency(row.forecast) : "—"}</td>
      <td className="text-emerald-700">{row.actual > 0 ? formatCurrency(row.actual) : "—"}</td>
      <td>
        <input
          className="input max-w-[80px] text-xs"
          type="number"
          step="0.01"
          min="0"
          max="1"
          value={ratioInput}
          onChange={(e) => setRatioInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        />
      </td>
      <td className="text-amber-700">{formatCurrency(row.plannedPurchase)}</td>
      <td>
        <div className="flex items-center gap-1">
          <input
            className="input max-w-[140px] text-xs"
            type="number"
            step="0.01"
            placeholder="—"
            value={actualInput}
            onChange={(e) => setActualInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          />
          {dirty ? (
            <button className="btn-primary py-1 px-2 text-xs" onClick={save} disabled={saving}>
              {saving ? "…" : "שמור"}
            </button>
          ) : null}
        </div>
      </td>
      <td className={variance == null ? "text-slate-400" : variance > 0 ? "text-red-700" : variance < 0 ? "text-emerald-700" : ""}>
        {variance == null ? "—" : `${variance > 0 ? "+" : ""}${formatCurrency(variance)}`}
      </td>
      <td>{formatCurrency(row.cogs)}</td>
      <td className={delta == null ? "text-slate-400" : delta >= 0 ? "text-emerald-700" : "text-red-700"}>
        {delta == null ? "—" : `${delta >= 0 ? "+" : ""}${formatCurrency(delta)}`}
      </td>
    </tr>
  );
}
