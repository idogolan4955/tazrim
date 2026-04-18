"use client";
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Kpi } from "@/components/kpi";
import { formatCurrency } from "@/lib/utils";

interface Sales {
  id: string;
  month: string;
  salesAmount: string;
  purchaseRatio: string;
  notes: string | null;
}

export default function PurchasingPage() {
  const [sales, setSales] = useState<Sales[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(currentMonth());
  const [salesAmount, setSalesAmount] = useState("");
  const [purchaseRatio, setPurchaseRatio] = useState("0.35");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/sales").then((x) => x.json());
    setSales(r);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month,
        salesAmount: parseFloat(salesAmount || "0"),
        purchaseRatio: parseFloat(purchaseRatio || "0.35"),
        notes: notes || null,
      }),
    });
    setSalesAmount("");
    setNotes("");
    setSubmitting(false);
    load();
  }

  const chartData = [...sales]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((s) => ({
      month: s.month,
      sales: parseFloat(s.salesAmount),
      purchase: parseFloat(s.salesAmount) * parseFloat(s.purchaseRatio),
    }));

  const latest = sales[0];
  const latestSales = latest ? parseFloat(latest.salesAmount) : 0;
  const latestRatio = latest ? parseFloat(latest.purchaseRatio) : 0.35;
  const budget = latestSales * latestRatio;

  return (
    <div className="flex flex-col gap-4">
      <h1>רכש חזוי</h1>
      <p className="text-sm text-slate-500">תקציב הרכש לחודש הבא נגזר מהמכירות של החודש הקודם בהכפלה באחוז שמירת מלאי (ברירת מחדל 35%).</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Kpi label="מכירות חודש אחרון" value={latestSales} hint={latest?.month ?? "—"} />
        <Kpi label="אחוז רכש" value={`${(latestRatio * 100).toFixed(0)}%`} />
        <Kpi label="תקציב רכש לחודש הבא" value={budget} tone="good" />
      </div>

      <form onSubmit={submit} className="card grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <label className="label">חודש</label>
          <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
        </div>
        <div>
          <label className="label">סך מכירות</label>
          <input className="input" type="number" step="0.01" value={salesAmount} onChange={(e) => setSalesAmount(e.target.value)} required />
        </div>
        <div>
          <label className="label">אחוז רכש (0-1)</label>
          <input className="input" type="number" step="0.01" min="0" max="1" value={purchaseRatio} onChange={(e) => setPurchaseRatio(e.target.value)} />
        </div>
        <div>
          <label className="label">הערות</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full justify-center" type="submit" disabled={submitting}>{submitting ? "שומר..." : "שמור מכירות"}</button>
        </div>
      </form>

      <section className="card">
        <h2 className="mb-3">מכירות ותקציב רכש נגזר</h2>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis orientation="right" tickFormatter={(v) => new Intl.NumberFormat("he-IL").format(v)} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ direction: "rtl" }} />
              <Legend />
              <Bar dataKey="sales" fill="#1f4df5" name="מכירות" />
              <Bar dataKey="purchase" fill="#f59e0b" name="תקציב רכש" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="card overflow-x-auto">
        {loading ? "טוען..." : (
          <table className="table">
            <thead>
              <tr>
                <th>חודש</th>
                <th>מכירות</th>
                <th>אחוז רכש</th>
                <th>תקציב רכש</th>
                <th>הערות</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => {
                const sa = parseFloat(s.salesAmount);
                const pr = parseFloat(s.purchaseRatio);
                return (
                  <tr key={s.id}>
                    <td>{s.month}</td>
                    <td>{formatCurrency(sa)}</td>
                    <td>{(pr * 100).toFixed(0)}%</td>
                    <td className="text-emerald-700">{formatCurrency(sa * pr)}</td>
                    <td>{s.notes ?? "—"}</td>
                  </tr>
                );
              })}
              {sales.length === 0 && !loading ? (
                <tr><td colSpan={5} className="text-center text-slate-500">עדיין לא הוזנו מכירות</td></tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
