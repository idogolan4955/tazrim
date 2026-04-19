"use client";
import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Kpi } from "./kpi";
import { LedgerTable } from "./ledger-table";
import { LogFeed } from "./log-feed";
import { formatCurrency, formatDate } from "@/lib/utils";

interface AccountLite { id: string; name: string; color: string; }
interface DailyPoint { date: string; balance: number; }
interface AccountProjection {
  accountId: string;
  accountName: string;
  openingBalance: number;
  current: number;
  plus1m: number;
  plus3m: number;
  plus6m: number;
  plus12m: number;
  series: DailyPoint[];
}
interface ProjectionResponse {
  byAccount: AccountProjection[];
  combined: { series: DailyPoint[]; current: number; plus1m: number; plus3m: number; plus6m: number; plus12m: number };
}
interface SummaryResponse {
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

export function DashboardClient({ partnerMode = false }: { partnerMode?: boolean }) {
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [projection, setProjection] = useState<ProjectionResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/accounts");
      const data: AccountLite[] = await r.json();
      setAccounts(data);
      setSelected(new Set(data.map((a) => a.id)));
    })();
  }, []);

  useEffect(() => {
    if (accounts.length === 0) return;
    const ids = Array.from(selected);
    (async () => {
      setLoading(true);
      const url = ids.length > 0 ? `/api/projection?accountIds=${ids.join(",")}&horizon=12` : "/api/projection?horizon=12";
      const [pr, sm] = await Promise.all([
        fetch(url).then((r) => r.json()),
        fetch("/api/summary").then((r) => r.json()),
      ]);
      setProjection(pr);
      setSummary(sm);
      setLoading(false);
    })();
  }, [selected, accounts.length]);

  const chartData = useMemo(() => {
    if (!projection) return [];
    return projection.combined.series.filter((_, i) => i % 7 === 0);
  }, [projection]);

  if (accounts.length === 0) {
    return (
      <div className="card text-center text-slate-500">
        <p>אין עדיין חשבונות במערכת.</p>
        {!partnerMode ? <p className="mt-2">עבור לעמוד &quot;חשבונות&quot; כדי להוסיף את החשבון הראשון.</p> : null}
      </div>
    );
  }

  const combined = projection?.combined;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h1>סקירה כלכלית</h1>
            <a href="/report" className="btn-primary">הפק דוח תשקיף</a>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {accounts.map((a) => {
              const on = selected.has(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => {
                    const next = new Set(selected);
                    if (on) next.delete(a.id);
                    else next.add(a.id);
                    setSelected(next);
                  }}
                  className={`chip ${on ? "chip-green" : "chip-slate"} cursor-pointer`}
                  style={on ? { backgroundColor: a.color + "22", color: a.color } : undefined}
                >
                  {a.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="יתרה נוכחית" value={combined?.current ?? 0} hint={loading ? "טוען..." : "סך החשבונות הנבחרים"} tone={combined && combined.current >= 0 ? "good" : "bad"} />
          <Kpi label="בעוד חודש" value={combined?.plus1m ?? 0} tone={combined && combined.plus1m >= 0 ? "good" : "bad"} />
          <Kpi label="בעוד 3 חודשים" value={combined?.plus3m ?? 0} tone={combined && combined.plus3m >= 0 ? "good" : "bad"} />
          <Kpi label="בעוד 6 חודשים" value={combined?.plus6m ?? 0} tone={combined && combined.plus6m >= 0 ? "good" : "bad"} />
          <Kpi label="בעוד 12 חודשים" value={combined?.plus12m ?? 0} tone={combined && combined.plus12m >= 0 ? "good" : "bad"} />
        </div>
      </section>

      <LogFeed compact={true} initialLimit={30} />

      <section className="card">
        <h2 className="mb-3">תחזית תזרים (12 חודשים)</h2>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={(d) => formatDate(d)} reversed minTickGap={40} />
              <YAxis reversed={false} orientation="right" tickFormatter={(v) => new Intl.NumberFormat("he-IL").format(v)} />
              <Tooltip
                labelFormatter={(d) => formatDate(d)}
                formatter={(v: number) => [formatCurrency(v), "יתרה"]}
                contentStyle={{ direction: "rtl" }}
              />
              <Legend />
              <Line type="monotone" dataKey="balance" stroke="#1f4df5" dot={false} strokeWidth={2} name="יתרה מאוחדת" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h2 className="mb-3">תחזית לפי חשבון</h2>
        <div className="overflow-x-auto card">
          <table className="table">
            <thead>
              <tr>
                <th>חשבון</th>
                <th>יתרה נוכחית</th>
                <th>+1 ח׳</th>
                <th>+3 ח׳</th>
                <th>+6 ח׳</th>
                <th>+12 ח׳</th>
              </tr>
            </thead>
            <tbody>
              {projection?.byAccount.map((a) => (
                <tr key={a.accountId}>
                  <td className="font-medium">{a.accountName}</td>
                  <td className={a.current >= 0 ? "text-emerald-700" : "text-red-700"}>{formatCurrency(a.current)}</td>
                  <td className={a.plus1m >= 0 ? "text-emerald-700" : "text-red-700"}>{formatCurrency(a.plus1m)}</td>
                  <td className={a.plus3m >= 0 ? "text-emerald-700" : "text-red-700"}>{formatCurrency(a.plus3m)}</td>
                  <td className={a.plus6m >= 0 ? "text-emerald-700" : "text-red-700"}>{formatCurrency(a.plus6m)}</td>
                  <td className={a.plus12m >= 0 ? "text-emerald-700" : "text-red-700"}>{formatCurrency(a.plus12m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <LedgerTable accountIds={Array.from(selected)} />

      {summary ? (
        <section>
          <h2 className="mb-3">מאזן עסקי</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <Kpi label="כסף זמין" value={summary.liquidAssets} tone="good" hint="מזומן + שיקים ללקבל + לקוחות" />
            <Kpi label="הון במלאי" value={summary.inventoryAssets} hint="שווי סחורה" />
            <Kpi label="סך נכסים" value={summary.assets} tone="good" hint="זמין + מלאי" />
            <Kpi label="סך התחייבויות" value={summary.liabilities} tone="bad" hint="הלוואות + שיקים לפרעון" />
            <Kpi label="הון חוזר" value={summary.workingCapital} tone={summary.workingCapital >= 0 ? "good" : "bad"} hint="כסף זמין - חובות" />
            <Kpi label="הון עצמי" value={summary.equity} tone={summary.equity >= 0 ? "good" : "bad"} hint="נכסים - חובות" />
            <Kpi label="סך הלוואות" value={summary.totalLoans} tone="bad" />
            <Kpi label="שיקים לפירעון" value={summary.payableChecks} tone="bad" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="יתרת מזומנים" value={summary.currentTotal} />
            <Kpi label="שיקים דחויים ללקבל" value={summary.postDatedReceivable} />
            <Kpi label="כרטסת לקוחות" value={summary.receivablesTotal} />
            <Kpi label="מלאי" value={summary.totalInventory} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
