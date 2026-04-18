"use client";
import { useEffect, useState } from "react";
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

interface Account { id: string; name: string; inventory: string; }

export default function StatusPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [s, r, a] = await Promise.all([
      fetch("/api/summary").then((x) => x.json()),
      fetch("/api/receivables").then((x) => x.json()),
      fetch("/api/accounts").then((x) => x.json()),
    ]);
    setSummary(s);
    setReceivables(r);
    setAccounts(a);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  async function saveInventory(id: string, value: string) {
    await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inventory: parseFloat(value || "0") }),
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="סך נכסים" value={summary.assets} tone="good" />
          <Kpi label="סך התחייבויות" value={summary.liabilities} tone="bad" />
          <Kpi label="הון עצמי" value={summary.equity} tone={summary.equity >= 0 ? "good" : "bad"} hint="נכסים - התחייבויות" />
          <Kpi label="יתרת מזומנים" value={summary.currentTotal} />
          <Kpi label="סך הלוואות" value={summary.totalLoans} tone="bad" />
          <Kpi label="שיקים דחויים ללקבל" value={summary.postDatedReceivable} />
          <Kpi label="שיקים לפירעון" value={summary.payableChecks} tone="bad" />
          <Kpi label="כרטסת לקוחות" value={summary.receivablesTotal} />
        </div>
      ) : loading ? <div className="card">טוען...</div> : null}

      <section className="card">
        <h2 className="mb-3">מלאי לפי חשבון</h2>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>חשבון</th>
                <th>ערך מלאי</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <InventoryRow key={a.id} account={a} onSave={(v) => saveInventory(a.id, v)} />
              ))}
            </tbody>
          </table>
        </div>
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

function InventoryRow({ account, onSave }: { account: Account; onSave: (v: string) => void }) {
  const [v, setV] = useState(account.inventory);
  const [saving, setSaving] = useState(false);
  return (
    <tr>
      <td className="font-medium">{account.name}</td>
      <td>
        <input className="input max-w-xs" type="number" step="0.01" value={v} onChange={(e) => setV(e.target.value)} />
      </td>
      <td>
        <button className="btn" disabled={saving} onClick={async () => { setSaving(true); await onSave(v); setSaving(false); }}>
          {saving ? "שומר..." : "שמור"}
        </button>
      </td>
    </tr>
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
