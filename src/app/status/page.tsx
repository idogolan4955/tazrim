"use client";
import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Kpi } from "@/components/kpi";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Summary {
  currentTotal: number;
  totalInventory: number;
  totalLoans: number;
  postDatedReceivable: number;
  discountedReceivable: number;
  payableChecks: number;
  receivablesTotal: number;
  liquidAssets: number;
  inventoryAssets: number;
  workingCapital: number;
  assets: number;
  liabilities: number;
  equity: number;
}

interface Receivable {
  id: string;
  customerName: string;
  amount: string;
  dueDate: string | null;
  notes: string | null;
}

interface BalancePoint {
  month: string;
  cash: number;
  inventory: number;
  receivableChecks: number;
  receivablesLedger: number;
  liquidAssets: number;
  inventoryAssets: number;
  assets: number;
  loans: number;
  payableChecks: number;
  liabilities: number;
  workingCapital: number;
  equity: number;
}

interface Settings {
  opening_inventory: string;
  opening_inventory_date: string;
  cogs_ratio: string;
  default_purchase_account_id: string;
  default_purchase_ratio: string;
}

export default function StatusPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [forecast, setForecast] = useState<BalancePoint[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [s, r, f, st] = await Promise.all([
      fetch("/api/summary").then((x) => x.json()),
      fetch("/api/receivables").then((x) => x.json()),
      fetch("/api/balance-forecast?horizon=12").then((x) => x.json()),
      fetch("/api/settings").then((x) => x.json()),
    ]);
    setSummary(s);
    setReceivables(r);
    setForecast(f);
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

  async function removeReceivable(id: string) {
    if (!confirm("למחוק שורה מכרטסת הלקוחות?")) return;
    await fetch(`/api/receivables/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1>סטטוס ומאזן עסק</h1>

      {summary ? (
        <>
          <section>
            <h2 className="mb-3">מבט על</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="כסף זמין" value={summary.liquidAssets} tone="good" hint="מזומן + שיקים ללקבל + לקוחות" />
              <Kpi label="הון במלאי" value={summary.inventoryAssets} hint="שווי סחורה במלאי" />
              <Kpi label="סך נכסים" value={summary.assets} tone="good" hint="כסף זמין + מלאי" />
              <Kpi label="סך התחייבויות" value={summary.liabilities} tone="bad" hint="הלוואות + שיקים לפרעון" />
              <Kpi label="הון חוזר" value={summary.workingCapital} tone={summary.workingCapital >= 0 ? "good" : "bad"} hint="כסף זמין - התחייבויות" />
              <Kpi label="הון עצמי" value={summary.equity} tone={summary.equity >= 0 ? "good" : "bad"} hint="נכסים - התחייבויות" />
              <Kpi label="סך הלוואות" value={summary.totalLoans} tone="bad" />
              <Kpi label="שיקים לפירעון" value={summary.payableChecks} tone="bad" />
            </div>
          </section>

          <section>
            <h2 className="mb-3">פירוט נכסים והתחייבויות</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="יתרת מזומנים" value={summary.currentTotal} />
              <Kpi label="שיקים דחויים ללקבל" value={summary.postDatedReceivable} />
              <Kpi label="כרטסת לקוחות" value={summary.receivablesTotal} />
              <Kpi label="מלאי" value={summary.totalInventory} />
            </div>
          </section>
        </>
      ) : loading ? <div className="card">טוען...</div> : null}

      <section className="card grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div className="md:col-span-3">
          <h2 className="mb-2">מלאי</h2>
          <p className="text-sm text-slate-500">המלאי נשמר כערך גלובלי — סחורה פתיחה נכון לתאריך מסוים. המאזן החזוי מחשב את המלאי לאורך זמן לפי מכירות ורכש.</p>
        </div>
        <div>
          <label className="label">יתרת מלאי פתיחה</label>
          <input
            className="input"
            type="number"
            step="0.01"
            defaultValue={settings?.opening_inventory ?? "0"}
            onBlur={(e) => patchSettings({ opening_inventory: e.target.value })}
          />
        </div>
        <div>
          <label className="label">נכון לתאריך</label>
          <input
            className="input"
            type="date"
            defaultValue={settings?.opening_inventory_date ? settings.opening_inventory_date.slice(0, 10) : new Date().toISOString().slice(0, 10)}
            onBlur={(e) => patchSettings({ opening_inventory_date: e.target.value })}
          />
        </div>
        <div>
          <label className="label">עלות מכר (COGS) כאחוז ממכירות</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min="0"
            max="1"
            defaultValue={settings?.cogs_ratio ?? "0.35"}
            onBlur={(e) => patchSettings({ cogs_ratio: e.target.value })}
          />
          <div className="text-xs text-slate-500 mt-1">כמה מהמכירות יוצא מהמלאי כעלות</div>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3">מאזן חזוי — 12 חודשים</h2>
        {forecast.length > 0 ? (
          <>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={forecast}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis orientation="right" tickFormatter={(v) => new Intl.NumberFormat("he-IL").format(v)} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ direction: "rtl" }} />
                  <Legend />
                  <Line type="monotone" dataKey="liquidAssets" stroke="#10b981" name="כסף זמין" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="inventoryAssets" stroke="#f59e0b" name="הון במלאי" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="liabilities" stroke="#ef4444" name="התחייבויות" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="equity" stroke="#1f4df5" name="הון עצמי" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto mt-4">
              <table className="table text-xs">
                <thead>
                  <tr>
                    <th rowSpan={2}>חודש</th>
                    <th colSpan={3} className="text-center bg-emerald-50">כסף זמין</th>
                    <th rowSpan={2} className="bg-emerald-50">סה״כ זמין</th>
                    <th rowSpan={2} className="bg-amber-50">הון במלאי</th>
                    <th rowSpan={2}>סך נכסים</th>
                    <th colSpan={2} className="text-center bg-red-50">התחייבויות</th>
                    <th rowSpan={2} className="bg-red-50">סה״כ חוב</th>
                    <th rowSpan={2} className="text-brand-700">הון חוזר</th>
                    <th rowSpan={2} className="text-brand-700">הון עצמי</th>
                  </tr>
                  <tr>
                    <th>מזומן</th>
                    <th>שיקים ללקבל</th>
                    <th>לקוחות</th>
                    <th>הלוואות</th>
                    <th>שיקים לפרעון</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.map((p) => (
                    <tr key={p.month}>
                      <td className="font-medium">{p.month}</td>
                      <td className={p.cash >= 0 ? "" : "text-red-700"}>{formatCurrency(p.cash)}</td>
                      <td>{formatCurrency(p.receivableChecks)}</td>
                      <td>{formatCurrency(p.receivablesLedger)}</td>
                      <td className="bg-emerald-50 text-emerald-700 font-semibold">{formatCurrency(p.liquidAssets)}</td>
                      <td className="bg-amber-50 text-amber-700">{formatCurrency(p.inventoryAssets)}</td>
                      <td className="font-semibold">{formatCurrency(p.assets)}</td>
                      <td>{formatCurrency(p.loans)}</td>
                      <td>{formatCurrency(p.payableChecks)}</td>
                      <td className="bg-red-50 text-red-700 font-semibold">{formatCurrency(p.liabilities)}</td>
                      <td className={`font-bold ${p.workingCapital >= 0 ? "text-brand-700" : "text-red-700"}`}>{formatCurrency(p.workingCapital)}</td>
                      <td className={`font-bold ${p.equity >= 0 ? "text-brand-700" : "text-red-700"}`}>{formatCurrency(p.equity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : loading ? "טוען..." : null}
      </section>

      <section className="card">
        <div className="flex items-center justify-between mb-3">
          <h2>כרטסת לקוחות</h2>
        </div>
        <NewReceivable onCreated={load} />
        <div className="overflow-x-auto mt-3">
          <table className="table">
            <thead>
              <tr>
                <th>לקוח</th>
                <th>סכום</th>
                <th>תאריך פרעון</th>
                <th>הערות</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {receivables.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.customerName}</td>
                  <td className="text-emerald-700">{formatCurrency(r.amount)}</td>
                  <td>{r.dueDate ? formatDate(r.dueDate) : "—"}</td>
                  <td>{r.notes ?? "—"}</td>
                  <td><button className="btn-danger" onClick={() => removeReceivable(r.id)}>מחק</button></td>
                </tr>
              ))}
              {receivables.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-slate-500">עדיין אין שורות בכרטסת</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function NewReceivable({ onCreated }: { onCreated: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch("/api/receivables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName,
        amount: parseFloat(amount || "0"),
        dueDate: dueDate || null,
        notes: notes || null,
      }),
    });
    setCustomerName("");
    setAmount("");
    setDueDate("");
    setNotes("");
    setSubmitting(false);
    onCreated();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-5 gap-3">
      <input className="input" placeholder="שם לקוח" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
      <input className="input" type="number" step="0.01" placeholder="סכום" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      <input className="input" placeholder="הערות" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className="btn-primary" type="submit" disabled={submitting}>{submitting ? "שומר..." : "הוסף"}</button>
    </form>
  );
}
