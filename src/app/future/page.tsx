"use client";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Account { id: string; name: string; color: string; }
interface Check {
  id: string;
  accountId: string;
  kind: "RECEIVABLE_DEFERRED" | "RECEIVABLE_DISCOUNTED" | "PAYABLE";
  amount: string;
  dueDate: string;
  discountedOn: string | null;
  counterparty: string;
  reference: string | null;
  status: "PENDING" | "CLEARED" | "BOUNCED" | "CANCELLED";
  notes: string | null;
  account?: Account;
}
interface Txn {
  id: string;
  accountId: string;
  date: string;
  amount: string;
  kind: "INCOME" | "EXPENSE";
  description: string;
  status: "ACTUAL" | "PROJECTED";
  source: string;
}

const KIND_LABEL: Record<string, string> = {
  RECEIVABLE_DEFERRED: "שיק דחוי ללקבל",
  RECEIVABLE_DISCOUNTED: "שיק נכיון",
  PAYABLE: "שיק לפירעון",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: "ממתין",
  CLEARED: "נפרע",
  BOUNCED: "חזר",
  CANCELLED: "בוטל",
};

export default function FuturePage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"checks" | "projected">("checks");

  const load = async () => {
    setLoading(true);
    const [c, t, a] = await Promise.all([
      fetch("/api/checks").then((r) => r.json()),
      fetch("/api/transactions?status=PROJECTED").then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
    ]);
    setChecks(c);
    setTxns(t);
    setAccounts(a);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1>פעולות עתידיות</h1>
        <div className="flex gap-2">
          <button className={tab === "checks" ? "btn-primary" : "btn"} onClick={() => setTab("checks")}>שיקים</button>
          <button className={tab === "projected" ? "btn-primary" : "btn"} onClick={() => setTab("projected")}>תחזית סליקה</button>
        </div>
      </div>

      {tab === "checks" ? <ChecksTab checks={checks} accounts={accounts} loading={loading} onChanged={load} /> : <ProjectedTab txns={txns} accounts={accounts} loading={loading} onChanged={load} />}
    </div>
  );
}

function ChecksTab({ checks, accounts, loading, onChanged }: { checks: Check[]; accounts: Account[]; loading: boolean; onChanged: () => void }) {
  const [showForm, setShowForm] = useState(false);

  async function setStatus(c: Check, status: Check["status"]) {
    await fetch(`/api/checks/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    onChanged();
  }

  async function remove(c: Check) {
    if (!confirm("למחוק את השיק?")) return;
    await fetch(`/api/checks/${c.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <>
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>{showForm ? "סגור" : "הוסף שיק"}</button>
      </div>
      {showForm ? <NewCheckForm accounts={accounts} onCreated={() => { setShowForm(false); onChanged(); }} /> : null}
      <div className="card overflow-x-auto">
        {loading ? "טוען..." : (
          <table className="table">
            <thead>
              <tr>
                <th>סוג</th>
                <th>חשבון</th>
                <th>צד נגדי</th>
                <th>סכום</th>
                <th>תאריך פרעון</th>
                <th>תאריך נכיון</th>
                <th>סטטוס</th>
                <th>אסמכתא</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id}>
                  <td>{KIND_LABEL[c.kind]}</td>
                  <td>{c.account?.name ?? "—"}</td>
                  <td>{c.counterparty}</td>
                  <td className={c.kind === "PAYABLE" ? "text-red-700" : "text-emerald-700"}>{formatCurrency(c.amount)}</td>
                  <td>{formatDate(c.dueDate)}</td>
                  <td>{c.discountedOn ? formatDate(c.discountedOn) : "—"}</td>
                  <td>
                    <select className="input" value={c.status} onChange={(e) => setStatus(c, e.target.value as Check["status"])}>
                      {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
                  <td>{c.reference ?? "—"}</td>
                  <td><button className="btn-danger" onClick={() => remove(c)}>מחק</button></td>
                </tr>
              ))}
              {checks.length === 0 && !loading ? (
                <tr><td colSpan={9} className="text-center text-slate-500">אין שיקים פתוחים</td></tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function NewCheckForm({ accounts, onCreated }: { accounts: Account[]; onCreated: () => void }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [kind, setKind] = useState<"RECEIVABLE_DEFERRED" | "RECEIVABLE_DISCOUNTED" | "PAYABLE">("RECEIVABLE_DEFERRED");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [discountedOn, setDiscountedOn] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch("/api/checks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        kind,
        amount: parseFloat(amount || "0"),
        dueDate,
        discountedOn: kind === "RECEIVABLE_DISCOUNTED" && discountedOn ? discountedOn : null,
        counterparty,
        reference: reference || null,
      }),
    });
    setSubmitting(false);
    onCreated();
  }

  return (
    <form onSubmit={submit} className="card grid grid-cols-1 md:grid-cols-4 gap-3">
      <div>
        <label className="label">סוג</label>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="RECEIVABLE_DEFERRED">שיק דחוי ללקבל</option>
          <option value="RECEIVABLE_DISCOUNTED">שיק נכיון (התקבל מזומן)</option>
          <option value="PAYABLE">שיק לפירעון (אני משלם)</option>
        </select>
      </div>
      <div>
        <label className="label">חשבון</label>
        <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">צד נגדי</label>
        <input className="input" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} required placeholder="שם לקוח / ספק" />
      </div>
      <div>
        <label className="label">סכום</label>
        <input className="input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </div>
      <div>
        <label className="label">תאריך פרעון</label>
        <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
      </div>
      {kind === "RECEIVABLE_DISCOUNTED" ? (
        <div>
          <label className="label">תאריך נכיון</label>
          <input className="input" type="date" value={discountedOn} onChange={(e) => setDiscountedOn(e.target.value)} required />
        </div>
      ) : null}
      <div>
        <label className="label">אסמכתא</label>
        <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      <div className="md:col-span-4 flex justify-end">
        <button className="btn-primary" type="submit" disabled={submitting}>{submitting ? "שומר..." : "הוסף שיק"}</button>
      </div>
    </form>
  );
}

function ProjectedTab({ txns, accounts, loading, onChanged }: { txns: Txn[]; accounts: Account[]; loading: boolean; onChanged: () => void }) {
  const [showForm, setShowForm] = useState(false);
  async function remove(t: Txn) {
    if (!confirm("למחוק את התחזית?")) return;
    await fetch(`/api/transactions/${t.id}`, { method: "DELETE" });
    onChanged();
  }
  return (
    <>
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>{showForm ? "סגור" : "הוסף תחזית"}</button>
      </div>
      {showForm ? <NewProjectedForm accounts={accounts} onCreated={() => { setShowForm(false); onChanged(); }} /> : null}
      <div className="card overflow-x-auto">
        {loading ? "טוען..." : (
          <table className="table">
            <thead>
              <tr>
                <th>תאריך</th>
                <th>תיאור</th>
                <th>סוג</th>
                <th>סכום</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id}>
                  <td>{formatDate(t.date)}</td>
                  <td>{t.description}</td>
                  <td>{t.kind === "INCOME" ? <span className="chip-green">הכנסה</span> : <span className="chip-red">הוצאה</span>}</td>
                  <td className={t.kind === "INCOME" ? "text-emerald-700" : "text-red-700"}>{formatCurrency(t.amount)}</td>
                  <td><button className="btn-danger" onClick={() => remove(t)}>מחק</button></td>
                </tr>
              ))}
              {txns.length === 0 && !loading ? (
                <tr><td colSpan={5} className="text-center text-slate-500">אין תחזיות סליקה</td></tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function NewProjectedForm({ accounts, onCreated }: { accounts: Account[]; onCreated: () => void }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">("INCOME");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, date, amount: parseFloat(amount || "0"), kind, description, status: "PROJECTED" }),
    });
    setSubmitting(false);
    onCreated();
  }

  return (
    <form onSubmit={submit} className="card grid grid-cols-1 md:grid-cols-5 gap-3">
      <div>
        <label className="label">חשבון</label>
        <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">תאריך</label>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div>
        <label className="label">סוג</label>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as "INCOME" | "EXPENSE")}>
          <option value="INCOME">הכנסה צפויה</option>
          <option value="EXPENSE">הוצאה צפויה</option>
        </select>
      </div>
      <div>
        <label className="label">סכום</label>
        <input className="input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </div>
      <div>
        <label className="label">תיאור</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="סליקת ויזה, תשלום עתידי..." />
      </div>
      <div className="md:col-span-5 flex justify-end">
        <button className="btn-primary" type="submit" disabled={submitting}>{submitting ? "שומר..." : "הוסף"}</button>
      </div>
    </form>
  );
}
