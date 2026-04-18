"use client";
import { useEffect, useState } from "react";
import { Kpi } from "./kpi";
import { formatCurrency, formatDate } from "@/lib/utils";

interface LoanItem {
  id: string;
  name: string;
  accountName: string | null;
  principal: number;
  remaining: number;
  rate: number;
  monthlyPayment: number;
  purpose: string | null;
}
interface DiscountItem {
  id: string;
  name: string;
  accountName: string | null;
  amount: number;
  dueDate: string;
  discountedOn: string | null;
  counterparty: string;
  purpose: string | null;
}
interface PurposeSlice { purpose: string; amount: number; }
interface CreditSummary {
  loans: LoanItem[];
  discounts: DiscountItem[];
  totalLoans: number;
  totalDiscounts: number;
  totalCredit: number;
  byPurpose: PurposeSlice[];
}

export function CreditSummarySection() {
  const [data, setData] = useState<CreditSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await fetch("/api/credit-summary").then((x) => x.json());
      setData(r);
      setLoading(false);
    })();
  }, []);

  if (loading || !data) return <div className="card">טוען...</div>;

  return (
    <section className="flex flex-col gap-3">
      <h2>סיכום אשראי</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="סך אשראי" value={data.totalCredit} tone="bad" hint="הלוואות + נכיונות פעילים" />
        <Kpi label="יתרת הלוואות" value={data.totalLoans} tone="bad" />
        <Kpi label="סך נכיונות פעילים" value={data.totalDiscounts} tone="bad" />
        <Kpi label="מספר מקורות" value={`${data.loans.length + data.discounts.length}`} />
      </div>

      {data.byPurpose.length > 0 ? (
        <div className="card">
          <h3 className="mb-2">פירוק לפי מטרה</h3>
          <div className="flex flex-col gap-2">
            {data.byPurpose.map((p) => {
              const pct = data.totalCredit > 0 ? (p.amount / data.totalCredit) * 100 : 0;
              return (
                <div key={p.purpose} className="flex items-center gap-3">
                  <div className="text-sm w-48 shrink-0">{p.purpose}</div>
                  <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div className="bg-brand-500 h-full" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-sm w-24 text-left font-medium">{formatCurrency(p.amount)}</div>
                  <div className="text-xs text-slate-500 w-12">{pct.toFixed(0)}%</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {data.loans.length > 0 ? (
        <div className="card overflow-x-auto">
          <h3 className="mb-2">הלוואות</h3>
          <table className="table">
            <thead>
              <tr>
                <th>שם</th>
                <th>חשבון</th>
                <th>מטרה</th>
                <th>קרן</th>
                <th>יתרה</th>
                <th>ריבית</th>
                <th>החזר חודשי</th>
              </tr>
            </thead>
            <tbody>
              {data.loans.map((l) => (
                <tr key={l.id}>
                  <td className="font-medium">{l.name}</td>
                  <td>{l.accountName ?? "—"}</td>
                  <td className="text-brand-700">{l.purpose ?? "—"}</td>
                  <td>{formatCurrency(l.principal)}</td>
                  <td className="font-semibold">{formatCurrency(l.remaining)}</td>
                  <td>{l.rate.toFixed(2)}%</td>
                  <td>{formatCurrency(l.monthlyPayment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data.discounts.length > 0 ? (
        <div className="card overflow-x-auto">
          <h3 className="mb-2">נכיונות פעילים (אשראי קצר-טווח)</h3>
          <table className="table">
            <thead>
              <tr>
                <th>צד נגדי</th>
                <th>חשבון</th>
                <th>מטרה</th>
                <th>סכום</th>
                <th>תאריך נכיון</th>
                <th>תאריך פרעון</th>
              </tr>
            </thead>
            <tbody>
              {data.discounts.map((d) => (
                <tr key={d.id}>
                  <td className="font-medium">{d.counterparty}</td>
                  <td>{d.accountName ?? "—"}</td>
                  <td className="text-brand-700">{d.purpose ?? "—"}</td>
                  <td>{formatCurrency(d.amount)}</td>
                  <td>{d.discountedOn ? formatDate(d.discountedOn) : "—"}</td>
                  <td>{formatDate(d.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
