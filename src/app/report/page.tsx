"use client";
import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Kpi } from "@/components/kpi";
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
  assets: number;
  liabilities: number;
  equity: number;
}
interface BalancePoint {
  month: string;
  cash: number;
  inventory: number;
  receivableChecks: number;
  receivablesLedger: number;
  assets: number;
  loans: number;
  payableChecks: number;
  liabilities: number;
  equity: number;
}
interface LedgerRow {
  date: string;
  accountName: string;
  accountColor: string;
  label: string;
  source: string;
  amount: number;
  runningBalance: number;
}
interface Loan {
  id: string;
  name: string;
  principal: string;
  remainingBalance: number;
  monthlyPayment: number;
  effectiveRate: number;
  termMonths: number;
  startDate: string;
  account?: AccountLite;
}

const SOURCE_LABEL: Record<string, string> = {
  ACTUAL: "בוצעה",
  RECURRING: "חוזרת",
  LOAN: "הלוואה",
  CHECK: "שיק",
  PURCHASE: "רכש",
  MANUAL_PROJECTED: "תחזית",
};

export default function ReportPage() {
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [projection, setProjection] = useState<ProjectionResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [forecast, setForecast] = useState<BalancePoint[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [a, p, s, f, l, ln] = await Promise.all([
        fetch("/api/accounts").then((r) => r.json()),
        fetch("/api/projection?horizon=12").then((r) => r.json()),
        fetch("/api/summary").then((r) => r.json()),
        fetch("/api/balance-forecast?horizon=12").then((r) => r.json()),
        fetch("/api/ledger?horizon=12&includePast=0").then((r) => r.json()),
        fetch("/api/loans").then((r) => r.json()),
      ]);
      setAccounts(a);
      setProjection(p);
      setSummary(s);
      setForecast(f);
      setLedger(l.rows ?? []);
      setLoans(ln.loans ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading || !projection || !summary) return <div className="card">טוען דוח...</div>;

  const combined = projection.combined;
  const chartData = combined.series.filter((_, i) => i % 7 === 0);
  const today = new Date();
  const reportDate = formatDate(today);

  return (
    <div className="flex flex-col gap-6 print:gap-3">
      <div className="flex items-center justify-between no-print">
        <div>
          <h1>דוח תשקיף</h1>
          <div className="text-sm text-slate-500">נכון לתאריך {reportDate}</div>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => window.print()}>
            הדפס / שמור כ-PDF
          </button>
        </div>
      </div>

      <div className="print-only mb-2" style={{ display: "none" }}>
        <h1 className="text-2xl font-bold">דוח תשקיף עסקי</h1>
        <div className="text-sm">הופק ב־{reportDate}</div>
      </div>

      <section>
        <h2 className="mb-3">תקציר מנהלים</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="יתרה נוכחית" value={combined.current} tone={combined.current >= 0 ? "good" : "bad"} />
          <Kpi label="צפי בעוד 3 חודשים" value={combined.plus3m} tone={combined.plus3m >= 0 ? "good" : "bad"} />
          <Kpi label="צפי בעוד 6 חודשים" value={combined.plus6m} tone={combined.plus6m >= 0 ? "good" : "bad"} />
          <Kpi label="צפי בעוד 12 חודשים" value={combined.plus12m} tone={combined.plus12m >= 0 ? "good" : "bad"} />
          <Kpi label="סך נכסים" value={summary.assets} tone="good" />
          <Kpi label="סך התחייבויות" value={summary.liabilities} tone="bad" />
          <Kpi label="הון עצמי" value={summary.equity} tone={summary.equity >= 0 ? "good" : "bad"} />
          <Kpi label="סך הלוואות" value={summary.totalLoans} />
        </div>
      </section>

      <section className="card avoid-break">
        <h2 className="mb-3">גרף תזרים מאוחד — 12 חודשים</h2>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={(d) => formatDate(d)} reversed minTickGap={40} />
              <YAxis orientation="right" tickFormatter={(v) => new Intl.NumberFormat("he-IL").format(v)} />
              <Tooltip labelFormatter={(d) => formatDate(d)} formatter={(v: number) => [formatCurrency(v), "יתרה"]} contentStyle={{ direction: "rtl" }} />
              <Legend />
              <Line type="monotone" dataKey="balance" stroke="#1f4df5" dot={false} strokeWidth={2} name="יתרה מאוחדת" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="avoid-break">
        <h2 className="mb-3">יתרות לפי חשבון</h2>
        <div className="card overflow-x-auto">
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
              {projection.byAccount.map((a) => (
                <tr key={a.accountId}>
                  <td className="font-medium">{a.accountName}</td>
                  <td>{formatCurrency(a.current)}</td>
                  <td>{formatCurrency(a.plus1m)}</td>
                  <td>{formatCurrency(a.plus3m)}</td>
                  <td>{formatCurrency(a.plus6m)}</td>
                  <td>{formatCurrency(a.plus12m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="avoid-break">
        <h2 className="mb-3">מאזן חזוי — 12 חודשים</h2>
        <div className="card overflow-x-auto">
          <table className="table text-xs">
            <thead>
              <tr>
                <th>חודש</th>
                <th>מזומן</th>
                <th>מלאי</th>
                <th>שיקים ללקבל</th>
                <th>לקוחות</th>
                <th>נכסים</th>
                <th>הלוואות</th>
                <th>שיקים לפרעון</th>
                <th>התחייבויות</th>
                <th>הון עצמי</th>
              </tr>
            </thead>
            <tbody>
              {forecast.map((p) => (
                <tr key={p.month}>
                  <td className="font-medium">{p.month}</td>
                  <td>{formatCurrency(p.cash)}</td>
                  <td>{formatCurrency(p.inventory)}</td>
                  <td>{formatCurrency(p.receivableChecks)}</td>
                  <td>{formatCurrency(p.receivablesLedger)}</td>
                  <td className="text-emerald-700">{formatCurrency(p.assets)}</td>
                  <td>{formatCurrency(p.loans)}</td>
                  <td>{formatCurrency(p.payableChecks)}</td>
                  <td className="text-red-700">{formatCurrency(p.liabilities)}</td>
                  <td className={`font-bold ${p.equity >= 0 ? "text-brand-700" : "text-red-700"}`}>{formatCurrency(p.equity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {loans.length > 0 ? (
        <section className="avoid-break">
          <h2 className="mb-3">סטטוס הלוואות</h2>
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>שם</th>
                  <th>חשבון</th>
                  <th>קרן</th>
                  <th>יתרה היום</th>
                  <th>ריבית</th>
                  <th>החזר חודשי</th>
                  <th>התחלה</th>
                  <th>תקופה</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id}>
                    <td className="font-medium">{l.name}</td>
                    <td>{l.account?.name ?? "—"}</td>
                    <td>{formatCurrency(l.principal)}</td>
                    <td className="font-semibold">{formatCurrency(l.remainingBalance)}</td>
                    <td>{l.effectiveRate.toFixed(2)}%</td>
                    <td>{formatCurrency(l.monthlyPayment)}</td>
                    <td>{formatDate(l.startDate)}</td>
                    <td>{l.termMonths} ח׳</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3">טבלת תזרים — 90 ימים קדימה</h2>
        <div className="card overflow-x-auto">
          <table className="table text-xs">
            <thead>
              <tr>
                <th>תאריך</th>
                <th>סוג</th>
                <th>חשבון</th>
                <th>תיאור</th>
                <th>זיכוי</th>
                <th>חיוב</th>
                <th>יתרה רצה</th>
              </tr>
            </thead>
            <tbody>
              {ledger.slice(0, 120).map((r, i) => (
                <tr key={i}>
                  <td>{formatDate(r.date)}</td>
                  <td>{SOURCE_LABEL[r.source] ?? r.source}</td>
                  <td>{r.accountName}</td>
                  <td>{r.label}</td>
                  <td className="text-emerald-700">{r.amount > 0 ? formatCurrency(r.amount) : ""}</td>
                  <td className="text-red-700">{r.amount < 0 ? formatCurrency(Math.abs(r.amount)) : ""}</td>
                  <td className={`font-semibold ${r.runningBalance >= 0 ? "" : "text-red-700"}`}>{formatCurrency(r.runningBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="text-center text-xs text-slate-400 print-only" style={{ display: "none" }}>
        הופק ממערכת תזרים · {reportDate}
      </div>
    </div>
  );
}
