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

  const defaultRatio = parseFloat(settings?.default_purchase_ratio ?? "0.35");

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
        const ratio = parseFloat(s.purchaseRatio);
        const basis = actual > 0 ? actual : (forecast ?? 0);
        return {
          month: s.month,
          actual,
          forecast,
          ratio,
          basis,
          purchase: basis * ratio,
          kind: actual > 0 ? "actual" : "forecast",
        };
      });
  }, [sales]);

  const totals = {
    purchase: rows.reduce((s, r) => s + r.purchase, 0),
    actualSales: rows.reduce((s, r) => s + r.actual, 0),
    forecastSales: rows.reduce((s, r) => s + (r.forecast ?? 0), 0),
  };

  const defaultAccountName = accounts.find((a) => a.id === settings?.default_purchase_account_id)?.name;

  return (
    <div className="flex flex-col gap-4">
      <h1>רכש חזוי</h1>
      <p className="text-sm text-slate-500">
        תקציב הרכש מחושב אוטומטית מנתוני עמוד המכירות. הזן כאן רק את המקדם (ברירת המחדל 35%) ואת חשבון הבנק שממנו ייצאו הרכישות בתזרים.
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
            {defaultAccountName ? `הרכש יופיע כהוצאה חודשית בחשבון "${defaultAccountName}"` : "בלי חשבון, הרכש מופיע רק בטבלה ולא בתזרים"}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={applyRatioToAllMonths} disabled={!sales.length}>
            החל מקדם על כל הטבלה
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="סך מכירות בפועל" value={totals.actualSales} tone="good" />
        <Kpi label="סך תחזית מכירות" value={totals.forecastSales} />
        <Kpi label="סך רכש חזוי" value={totals.purchase} tone="bad" />
        <Kpi label="מקדם ברירת מחדל" value={`${(defaultRatio * 100).toFixed(0)}%`} />
      </div>

      <section className="card">
        <h2 className="mb-3">מכירות ורכש לאורך זמן</h2>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={rows}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis orientation="right" tickFormatter={(v) => new Intl.NumberFormat("he-IL").format(v)} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ direction: "rtl" }} />
              <Legend />
              <Bar dataKey="forecast" fill="#94a3b8" name="תחזית מכירות" />
              <Bar dataKey="actual" fill="#1f4df5" name="מכירות בפועל" />
              <Bar dataKey="purchase" fill="#f59e0b" name="רכש חזוי" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="card overflow-x-auto">
        <div className="text-sm text-slate-500 mb-2">
          הטבלה מחושבת מנתוני עמוד <a className="text-brand-700 underline" href="/sales">המכירות</a>. לעריכה — עבור לשם.
        </div>
        {loading ? "טוען..." : (
          <table className="table">
            <thead>
              <tr>
                <th>חודש</th>
                <th>תחזית מכירות</th>
                <th>מכירות בפועל</th>
                <th>בסיס לחישוב</th>
                <th>מקדם רכש</th>
                <th>רכש חזוי</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month}>
                  <td className="font-medium">{r.month}</td>
                  <td>{r.forecast != null ? formatCurrency(r.forecast) : "—"}</td>
                  <td className="text-emerald-700">{r.actual > 0 ? formatCurrency(r.actual) : "—"}</td>
                  <td>{formatCurrency(r.basis)} <span className="chip-slate mr-2">{r.kind === "actual" ? "בפועל" : "תחזית"}</span></td>
                  <td>{(r.ratio * 100).toFixed(0)}%</td>
                  <td className="text-amber-700 font-medium">{formatCurrency(r.purchase)}</td>
                </tr>
              ))}
              {rows.length === 0 && !loading ? (
                <tr><td colSpan={6} className="text-center text-slate-500">הוסף חודשי מכירות בעמוד המכירות</td></tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
