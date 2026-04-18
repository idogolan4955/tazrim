"use client";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Account { id: string; name: string; color: string; }
interface Recurring {
  id: string;
  accountId: string;
  name: string;
  amount: string;
  kind: "INCOME" | "EXPENSE";
  frequency: "MONTHLY" | "WEEKLY" | "BIWEEKLY" | "YEARLY" | "ONE_TIME";
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  category: string | null;
  source: string;
  active: boolean;
  account?: Account;
}

const FREQ_LABEL: Record<string, string> = {
  MONTHLY: "חודשי",
  WEEKLY: "שבועי",
  BIWEEKLY: "דו-שבועי",
  YEARLY: "שנתי",
  ONE_TIME: "חד-פעמי",
};

export default function RecurringPage() {
  const [items, setItems] = useState<Recurring[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    const [r, a] = await Promise.all([
      fetch("/api/recurring").then((x) => x.json()),
      fetch("/api/accounts").then((x) => x.json()),
    ]);
    setItems(r);
    setAccounts(a);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  async function toggle(r: Recurring) {
    await fetch(`/api/recurring/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !r.active }),
    });
    load();
  }

  async function remove(r: Recurring) {
    if (!confirm("למחוק פעולה חוזרת?")) return;
    await fetch(`/api/recurring/${r.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1>פעולות חוזרות</h1>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>{showForm ? "סגור" : "הוסף פעולה"}</button>
      </div>

      {showForm ? (
        <NewRecurringForm
          accounts={accounts}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      ) : null}

      <div className="card overflow-x-auto">
        {loading ? "טוען..." : (
          <table className="table">
            <thead>
              <tr>
                <th>שם</th>
                <th>חשבון</th>
                <th>סוג</th>
                <th>תדירות</th>
                <th>התחלה</th>
                <th>סיום</th>
                <th>סכום</th>
                <th>סטטוס</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.name}</td>
                  <td>{r.account?.name ?? "—"}</td>
                  <td>{r.kind === "INCOME" ? <span className="chip-green">הכנסה</span> : <span className="chip-red">הוצאה</span>}</td>
                  <td>{FREQ_LABEL[r.frequency]} {r.dayOfMonth ? `(יום ${r.dayOfMonth})` : ""}</td>
                  <td>{formatDate(r.startDate)}</td>
                  <td>{r.endDate ? formatDate(r.endDate) : "—"}</td>
                  <td className={r.kind === "INCOME" ? "text-emerald-700" : "text-red-700"}>{formatCurrency(r.amount)}</td>
                  <td>
                    <button className={r.active ? "chip-green" : "chip-slate"} onClick={() => toggle(r)}>
                      {r.active ? "פעיל" : "מושהה"}
                    </button>
                  </td>
                  <td>
                    <button className="btn-danger" onClick={() => remove(r)}>מחק</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && !loading ? (
                <tr><td colSpan={9} className="text-center text-slate-500">אין פעולות חוזרות</td></tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function NewRecurringForm({ accounts, onCreated }: { accounts: Account[]; onCreated: () => void }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [category, setCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch("/api/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        name,
        amount: parseFloat(amount || "0"),
        kind,
        frequency,
        dayOfMonth: frequency === "MONTHLY" ? parseInt(dayOfMonth, 10) : null,
        startDate,
        endDate: endDate || null,
        category: category || null,
      }),
    });
    setSubmitting(false);
    onCreated();
  }

  return (
    <form onSubmit={submit} className="card grid grid-cols-1 md:grid-cols-4 gap-3">
      <div>
        <label className="label">חשבון</label>
        <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">שם</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label">סוג</label>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as "EXPENSE" | "INCOME")}>
          <option value="EXPENSE">הוצאה</option>
          <option value="INCOME">הכנסה</option>
        </select>
      </div>
      <div>
        <label className="label">סכום</label>
        <input className="input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </div>
      <div>
        <label className="label">תדירות</label>
        <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
          <option value="MONTHLY">חודשי</option>
          <option value="WEEKLY">שבועי</option>
          <option value="BIWEEKLY">דו-שבועי</option>
          <option value="YEARLY">שנתי</option>
          <option value="ONE_TIME">חד-פעמי</option>
        </select>
      </div>
      {frequency === "MONTHLY" ? (
        <div>
          <label className="label">יום בחודש</label>
          <input className="input" type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
        </div>
      ) : null}
      <div>
        <label className="label">תאריך התחלה</label>
        <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
      </div>
      <div>
        <label className="label">תאריך סיום (לא חובה)</label>
        <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>
      <div>
        <label className="label">קטגוריה</label>
        <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="הלוואות / שכר / ספקים..." />
      </div>
      <div className="md:col-span-4 flex justify-end">
        <button className="btn-primary" type="submit" disabled={submitting}>{submitting ? "שומר..." : "הוסף"}</button>
      </div>
    </form>
  );
}
