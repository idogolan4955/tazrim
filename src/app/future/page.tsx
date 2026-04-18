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
  purpose: string | null;
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
  const [editing, setEditing] = useState<Check | null>(null);
  const [filterKind, setFilterKind] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("PENDING");

  async function patch(c: Check, body: Record<string, unknown>) {
    await fetch(`/api/checks/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    onChanged();
  }

  async function convertToDiscount(c: Check) {
    const today = new Date().toISOString().slice(0, 10);
    const date = prompt("תאריך הנכיון:", today);
    if (!date) return;
    const purpose = prompt("מטרת הנכיון (אופציונלי):", c.purpose ?? "") ?? null;
    await patch(c, { kind: "RECEIVABLE_DISCOUNTED", discountedOn: date, purpose });
  }

  async function revertToDeferred(c: Check) {
    if (!confirm("להחזיר את השיק מנכיון לדחוי רגיל? פעולות התזרים של הנכיון יבוטלו.")) return;
    await patch(c, { kind: "RECEIVABLE_DEFERRED", discountedOn: null });
  }

  async function remove(c: Check) {
    if (!confirm("למחוק את השיק?")) return;
    await fetch(`/api/checks/${c.id}`, { method: "DELETE" });
    onChanged();
  }

  const filtered = checks.filter((c) =>
    (filterKind === "ALL" || c.kind === filterKind) &&
    (filterStatus === "ALL" || c.status === filterStatus),
  );

  const totalsByKind = checks
    .filter((c) => c.status === "PENDING")
    .reduce((acc, c) => {
      const amt = parseFloat(c.amount);
      acc[c.kind] = (acc[c.kind] ?? 0) + amt;
      return acc;
    }, {} as Record<string, number>);

  return (
    <>
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <a href="/import/checks" className="btn">יבוא רשימה</a>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>{showForm ? "סגור" : "הוסף שיק"}</button>
      </div>
      {showForm ? <NewCheckForm accounts={accounts} onCreated={() => { setShowForm(false); onChanged(); }} /> : null}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="kpi">
          <div className="kpi-label">שיקים דחויים ללקבל (ממתינים)</div>
          <div className="kpi-value text-emerald-700">{formatCurrency(totalsByKind["RECEIVABLE_DEFERRED"] ?? 0)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">נכיונות פעילים</div>
          <div className="kpi-value text-amber-700">{formatCurrency(totalsByKind["RECEIVABLE_DISCOUNTED"] ?? 0)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">שיקים לפירעון (אני משלם)</div>
          <div className="kpi-value text-red-700">{formatCurrency(totalsByKind["PAYABLE"] ?? 0)}</div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <select className="input w-auto text-sm" value={filterKind} onChange={(e) => setFilterKind(e.target.value)}>
            <option value="ALL">כל הסוגים</option>
            <option value="RECEIVABLE_DEFERRED">דחוי ללקבל</option>
            <option value="RECEIVABLE_DISCOUNTED">נכיון</option>
            <option value="PAYABLE">לפרעון</option>
          </select>
          <select className="input w-auto text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="ALL">כל הסטטוסים</option>
            <option value="PENDING">ממתינים</option>
            <option value="CLEARED">נפרעו</option>
            <option value="BOUNCED">חזרו</option>
            <option value="CANCELLED">בוטלו</option>
          </select>
          <div className="text-sm text-slate-500">מציג {filtered.length} מתוך {checks.length}</div>
        </div>

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
                <th>מטרה / מס׳ שיק</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className={c.status !== "PENDING" ? "opacity-60" : ""}>
                  <td>
                    <span className="chip-slate">{KIND_LABEL[c.kind]}</span>
                  </td>
                  <td>{c.account?.name ?? "—"}</td>
                  <td className="font-medium">{c.counterparty}</td>
                  <td className={c.kind === "PAYABLE" ? "text-red-700 font-semibold" : "text-emerald-700 font-semibold"}>{formatCurrency(c.amount)}</td>
                  <td>{formatDate(c.dueDate)}</td>
                  <td>{c.discountedOn ? formatDate(c.discountedOn) : "—"}</td>
                  <td>
                    <div className="flex items-center gap-1 flex-wrap">
                      {(["PENDING", "CLEARED", "BOUNCED", "CANCELLED"] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => patch(c, { status: st })}
                          className={`text-xs px-2 py-0.5 rounded-full border ${c.status === st ? statusClass(st) : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                        >
                          {STATUS_LABEL[st]}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td>
                    {c.purpose ? <div className="text-xs text-brand-700 font-medium">{c.purpose}</div> : null}
                    {c.reference ? <div className="text-xs text-slate-500">#{c.reference}</div> : null}
                    {!c.purpose && !c.reference ? "—" : null}
                  </td>
                  <td className="flex gap-1 flex-wrap">
                    <button className="btn py-1 px-2 text-xs" onClick={() => setEditing(c)}>ערוך</button>
                    {c.kind === "RECEIVABLE_DEFERRED" ? (
                      <button className="btn py-1 px-2 text-xs" onClick={() => convertToDiscount(c)}>לנכיון</button>
                    ) : null}
                    {c.kind === "RECEIVABLE_DISCOUNTED" ? (
                      <button className="btn py-1 px-2 text-xs" onClick={() => revertToDeferred(c)}>בטל נכיון</button>
                    ) : null}
                    <button className="btn-danger py-1 px-2 text-xs" onClick={() => remove(c)}>מחק</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading ? (
                <tr><td colSpan={9} className="text-center text-slate-500">אין שיקים בסינון הזה</td></tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>

      {editing ? (
        <EditCheckModal
          check={editing}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }}
        />
      ) : null}
    </>
  );
}

function statusClass(s: "PENDING" | "CLEARED" | "BOUNCED" | "CANCELLED") {
  switch (s) {
    case "PENDING": return "bg-amber-100 text-amber-800 border-amber-200";
    case "CLEARED": return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "BOUNCED": return "bg-red-100 text-red-800 border-red-200";
    case "CANCELLED": return "bg-slate-200 text-slate-700 border-slate-300";
  }
}

function EditCheckModal({ check, accounts, onClose, onSaved }: {
  check: Check;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [accountId, setAccountId] = useState(check.accountId);
  const [kind, setKind] = useState(check.kind);
  const [amount, setAmount] = useState(check.amount);
  const [dueDate, setDueDate] = useState(check.dueDate.slice(0, 10));
  const [discountedOn, setDiscountedOn] = useState(check.discountedOn ? check.discountedOn.slice(0, 10) : "");
  const [counterparty, setCounterparty] = useState(check.counterparty);
  const [reference, setReference] = useState(check.reference ?? "");
  const [purpose, setPurpose] = useState(check.purpose ?? "");
  const [notes, setNotes] = useState(check.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/checks/${check.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        kind,
        amount: parseFloat(amount),
        dueDate,
        discountedOn: kind === "RECEIVABLE_DISCOUNTED" && discountedOn ? discountedOn : null,
        counterparty,
        reference: reference || null,
        purpose: purpose || null,
        notes: notes || null,
      }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-5 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3">עריכת שיק</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label">סוג</label>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Check["kind"])}>
              <option value="RECEIVABLE_DEFERRED">שיק דחוי ללקבל</option>
              <option value="RECEIVABLE_DISCOUNTED">שיק נכיון</option>
              <option value="PAYABLE">שיק לפירעון</option>
            </select>
          </div>
          <div>
            <label className="label">חשבון</label>
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">צד נגדי</label>
            <input className="input" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
          </div>
          <div>
            <label className="label">סכום</label>
            <input className="input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">תאריך פרעון</label>
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          {kind === "RECEIVABLE_DISCOUNTED" ? (
            <div>
              <label className="label">תאריך נכיון</label>
              <input className="input" type="date" value={discountedOn} onChange={(e) => setDiscountedOn(e.target.value)} />
            </div>
          ) : null}
          <div>
            <label className="label">מספר שיק / אסמכתא</label>
            <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div>
            <label className="label">מטרה</label>
            <input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="label">הערות</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn" onClick={onClose}>ביטול</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? "שומר..." : "שמור שינויים"}</button>
        </div>
      </div>
    </div>
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
  const [purpose, setPurpose] = useState("");
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
        purpose: purpose || null,
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
      {kind === "RECEIVABLE_DISCOUNTED" ? (
        <div className="md:col-span-4">
          <label className="label">מטרת האשראי (נכיון)</label>
          <input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="הגדלת מלאי / תזרים שוטף / רכש ספציפי..." />
        </div>
      ) : null}
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
