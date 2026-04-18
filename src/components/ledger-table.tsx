"use client";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";

interface LedgerRow {
  date: string;
  accountId: string;
  accountName: string;
  accountColor: string;
  label: string;
  source: "ACTUAL" | "RECURRING" | "LOAN" | "CHECK" | "PURCHASE" | "MANUAL_PROJECTED";
  amount: number;
  runningBalance: number;
}

const SOURCE_LABEL: Record<string, string> = {
  ACTUAL: "בוצעה",
  RECURRING: "חוזרת",
  LOAN: "הלוואה",
  CHECK: "שיק",
  PURCHASE: "רכש",
  MANUAL_PROJECTED: "תחזית",
};

const SOURCE_CHIP: Record<string, string> = {
  ACTUAL: "chip-slate",
  RECURRING: "chip-green",
  LOAN: "chip-amber",
  CHECK: "chip-amber",
  PURCHASE: "chip-amber",
  MANUAL_PROJECTED: "chip-amber",
};

export function LedgerTable({ accountIds }: { accountIds: string[] }) {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [includePast, setIncludePast] = useState(true);
  const [horizon, setHorizon] = useState(12);
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (accountIds.length > 0) params.set("accountIds", accountIds.join(","));
      params.set("horizon", String(horizon));
      params.set("includePast", includePast ? "1" : "0");
      params.set("pastDays", "60");
      const r = await fetch(`/api/ledger?${params.toString()}`).then((x) => x.json());
      setRows(r.rows ?? []);
      setLoading(false);
    })();
  }, [accountIds, includePast, horizon]);

  const filtered = useMemo(() => {
    if (sourceFilter === "ALL") return rows;
    return rows.filter((r) => r.source === sourceFilter);
  }, [rows, sourceFilter]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const totals = useMemo(() => {
    const future = filtered.filter((r) => r.date > todayKey);
    const income = future.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
    const expense = future.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);
    return { income, expense, net: income + expense };
  }, [filtered, todayKey]);

  return (
    <section>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2>טבלת תזרים</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includePast} onChange={(e) => setIncludePast(e.target.checked)} />
            כלול פעולות עבר (60 יום)
          </label>
          <select className="input w-auto py-1 text-sm" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
            <option value={3}>3 ח׳ קדימה</option>
            <option value={6}>6 ח׳ קדימה</option>
            <option value={12}>12 ח׳ קדימה</option>
            <option value={24}>24 ח׳ קדימה</option>
          </select>
          <select className="input w-auto py-1 text-sm" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            <option value="ALL">כל הסוגים</option>
            <option value="ACTUAL">בוצעו</option>
            <option value="RECURRING">חוזרות</option>
            <option value="LOAN">הלוואות</option>
            <option value="CHECK">שיקים</option>
            <option value="PURCHASE">רכש</option>
            <option value="MANUAL_PROJECTED">תחזיות סליקה</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div className="card">
          <div className="text-xs text-slate-500">צפי הכנסות (קדימה)</div>
          <div className="text-xl font-bold text-emerald-700">{formatCurrency(totals.income)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-slate-500">צפי הוצאות (קדימה)</div>
          <div className="text-xl font-bold text-red-700">{formatCurrency(Math.abs(totals.expense))}</div>
        </div>
        <div className="card">
          <div className="text-xs text-slate-500">צפי נטו (קדימה)</div>
          <div className={`text-xl font-bold ${totals.net >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(totals.net)}</div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? "טוען..." : (
          <table className="table">
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
              {filtered.map((r, i) => {
                const isPast = r.date <= todayKey;
                const isToday = r.date === todayKey;
                return (
                  <tr key={i} className={isToday ? "bg-brand-50" : isPast ? "" : ""}>
                    <td className={isPast ? "text-slate-500" : "font-medium"}>{formatDate(r.date)}</td>
                    <td><span className={SOURCE_CHIP[r.source] ?? "chip-slate"}>{SOURCE_LABEL[r.source] ?? r.source}</span></td>
                    <td><span className="chip" style={{ backgroundColor: r.accountColor + "22", color: r.accountColor }}>{r.accountName}</span></td>
                    <td>{r.label}</td>
                    <td className="text-emerald-700">{r.amount > 0 ? formatCurrency(r.amount) : ""}</td>
                    <td className="text-red-700">{r.amount < 0 ? formatCurrency(Math.abs(r.amount)) : ""}</td>
                    <td className={`font-semibold ${r.runningBalance >= 0 ? "text-slate-900" : "text-red-700"}`}>
                      {formatCurrency(r.runningBalance)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && !loading ? (
                <tr><td colSpan={7} className="text-center text-slate-500">אין פעולות להצגה</td></tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
