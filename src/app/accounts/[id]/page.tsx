"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Kpi } from "@/components/kpi";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Account {
  id: string;
  name: string;
  bankName: string | null;
  accountNumber: string | null;
  color: string;
  openingBalance: string;
  openingBalanceDate: string;
  notes: string | null;
}

interface Transaction {
  id: string;
  accountId: string;
  date: string;
  amount: string;
  kind: "INCOME" | "EXPENSE";
  description: string;
  category: string | null;
  status: "ACTUAL" | "PROJECTED";
  source: string;
}

interface AccountProjection {
  accountId: string;
  accountName: string;
  current: number;
  plus1m: number;
  plus3m: number;
  plus6m: number;
  plus12m: number;
  series: { date: string; balance: number }[];
}

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<Account | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [proj, setProj] = useState<AccountProjection | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [a, t, p] = await Promise.all([
      fetch("/api/accounts").then((r) => r.json()),
      fetch(`/api/transactions?accountId=${id}`).then((r) => r.json()),
      fetch(`/api/projection?accountIds=${id}`).then((r) => r.json()),
    ]);
    setAccount((a as Account[]).find((x) => x.id === id) ?? null);
    setTxns(t);
    setProj(p.byAccount[0] ?? null);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  if (loading || !account) return <div className="card">טוען...</div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>{account.name}</h1>
          <div className="text-sm text-slate-500">{account.bankName ?? "—"} {account.accountNumber ? `· ${account.accountNumber}` : ""}</div>
        </div>
      </div>

      <OpeningBalanceBar account={account} onSaved={load} />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="יתרה נוכחית" value={proj?.current ?? 0} tone={(proj?.current ?? 0) >= 0 ? "good" : "bad"} />
        <Kpi label="בעוד חודש" value={proj?.plus1m ?? 0} tone={(proj?.plus1m ?? 0) >= 0 ? "good" : "bad"} />
        <Kpi label="בעוד 3 חודשים" value={proj?.plus3m ?? 0} tone={(proj?.plus3m ?? 0) >= 0 ? "good" : "bad"} />
        <Kpi label="בעוד 6 חודשים" value={proj?.plus6m ?? 0} tone={(proj?.plus6m ?? 0) >= 0 ? "good" : "bad"} />
        <Kpi label="בעוד 12 חודשים" value={proj?.plus12m ?? 0} tone={(proj?.plus12m ?? 0) >= 0 ? "good" : "bad"} />
      </div>

      <section className="card">
        <h2 className="mb-3">גרף תזרים</h2>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={proj?.series.filter((_, i) => i % 7 === 0) ?? []}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={(d) => formatDate(d)} reversed minTickGap={40} />
              <YAxis orientation="right" tickFormatter={(v) => new Intl.NumberFormat("he-IL").format(v)} />
              <Tooltip labelFormatter={(d) => formatDate(d)} formatter={(v: number) => [formatCurrency(v), "יתרה"]} contentStyle={{ direction: "rtl" }} />
              <Line type="monotone" dataKey="balance" stroke={account.color} dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <NewTxnForm accountId={id} onCreated={load} />

      <section className="card">
        <h2 className="mb-3">תנועות אחרונות</h2>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>תאריך</th>
                <th>תיאור</th>
                <th>קטגוריה</th>
                <th>סטטוס</th>
                <th>סכום</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id}>
                  <td>{formatDate(t.date)}</td>
                  <td>{t.description}</td>
                  <td>{t.category ?? "—"}</td>
                  <td>{t.status === "ACTUAL" ? <span className="chip-slate">בוצעה</span> : <span className="chip-amber">תחזית</span>}</td>
                  <td className={t.kind === "INCOME" ? "text-emerald-700 font-medium" : "text-red-700 font-medium"}>
                    {t.kind === "INCOME" ? "+" : "-"}{formatCurrency(t.amount)}
                  </td>
                  <td>
                    <button
                      className="btn-danger"
                      onClick={async () => {
                        if (!confirm("למחוק את התנועה?")) return;
                        await fetch(`/api/transactions/${t.id}`, { method: "DELETE" });
                        load();
                      }}
                    >מחק</button>
                  </td>
                </tr>
              ))}
              {txns.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-slate-500">אין עדיין תנועות</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function OpeningBalanceBar({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const [openingBalance, setOpeningBalance] = useState(account.openingBalance);
  const [openingBalanceDate, setOpeningBalanceDate] = useState(account.openingBalanceDate.slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        openingBalance: parseFloat(openingBalance || "0"),
        openingBalanceDate,
      }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="card grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
      <div>
        <label className="label">יתרת פתיחה</label>
        <input className="input" type="number" step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
      </div>
      <div>
        <label className="label">נכון לתאריך</label>
        <input className="input" type="date" value={openingBalanceDate} onChange={(e) => setOpeningBalanceDate(e.target.value)} />
      </div>
      <div className="flex justify-end">
        <button className="btn-primary" disabled={saving} onClick={save}>{saving ? "שומר..." : "עדכן"}</button>
      </div>
    </div>
  );
}

function NewTxnForm({ accountId, onCreated }: { accountId: string; onCreated: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"ACTUAL" | "PROJECTED">("ACTUAL");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        date,
        amount: parseFloat(amount || "0"),
        kind,
        description,
        category: category || null,
        status,
      }),
    });
    setAmount("");
    setDescription("");
    setCategory("");
    setSubmitting(false);
    onCreated();
  }

  return (
    <form onSubmit={submit} className="card grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
      <div>
        <label className="label">תאריך</label>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div>
        <label className="label">סוג</label>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as "INCOME" | "EXPENSE")}>
          <option value="EXPENSE">הוצאה</option>
          <option value="INCOME">הכנסה</option>
        </select>
      </div>
      <div>
        <label className="label">סכום</label>
        <input className="input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </div>
      <div>
        <label className="label">תיאור</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} required />
      </div>
      <div>
        <label className="label">קטגוריה</label>
        <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} />
      </div>
      <div className="flex items-end gap-2">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as "ACTUAL" | "PROJECTED")}>
          <option value="ACTUAL">בוצעה</option>
          <option value="PROJECTED">תחזית</option>
        </select>
        <button className="btn-primary" type="submit" disabled={submitting}>{submitting ? "…" : "הוסף"}</button>
      </div>
    </form>
  );
}
