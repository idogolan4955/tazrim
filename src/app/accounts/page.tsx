"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Account {
  id: string;
  name: string;
  bankName: string | null;
  accountNumber: string | null;
  color: string;
  openingBalance: string;
  openingBalanceDate: string;
  inventory: string;
  notes: string | null;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/accounts");
    setAccounts(await r.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  async function onDelete(id: string) {
    if (!confirm("למחוק את החשבון? פעולה זו תמחק גם את כל התנועות, ההלוואות והשיקים השייכים אליו.")) return;
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1>חשבונות בנק</h1>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "סגור" : "הוסף חשבון"}
        </button>
      </div>

      {showForm ? (
        <NewAccountForm
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      ) : null}

      {loading ? (
        <div className="card">טוען...</div>
      ) : accounts.length === 0 ? (
        <div className="card text-slate-500 text-center">עדיין אין חשבונות. הוסף חשבון ראשון כדי להתחיל.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {accounts.map((a) => (
            <div key={a.id} className="card flex items-start gap-3" style={{ borderRightWidth: 4, borderRightColor: a.color }}>
              <div className="flex-1">
                <Link href={`/accounts/${a.id}`} className="text-lg font-semibold hover:text-brand-700">{a.name}</Link>
                <div className="text-sm text-slate-500">
                  {a.bankName ? a.bankName : "—"} {a.accountNumber ? `· ${a.accountNumber}` : ""}
                </div>
                <div className="mt-2 text-sm">
                  <span className="text-slate-500">יתרת פתיחה: </span>
                  <span className="font-medium">{formatCurrency(a.openingBalance)}</span>
                  <span className="text-slate-400 mx-2">·</span>
                  <span className="text-slate-500">נכון ל־</span>
                  <span>{formatDate(a.openingBalanceDate)}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Link href={`/accounts/${a.id}`} className="btn">פתח</Link>
                <button className="btn-danger" onClick={() => onDelete(a.id)}>מחק</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewAccountForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [color, setColor] = useState("#336bff");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [openingBalanceDate, setOpeningBalanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        bankName: bankName || null,
        accountNumber: accountNumber || null,
        color,
        openingBalance: parseFloat(openingBalance || "0"),
        openingBalanceDate,
        notes: notes || null,
      }),
    });
    setSubmitting(false);
    onCreated();
  }

  return (
    <form onSubmit={submit} className="card grid grid-cols-1 md:grid-cols-3 gap-3">
      <div>
        <label className="label">שם החשבון</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label">בנק</label>
        <input className="input" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="לאומי / פועלים / …" />
      </div>
      <div>
        <label className="label">מספר חשבון</label>
        <input className="input" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
      </div>
      <div>
        <label className="label">יתרת פתיחה</label>
        <input className="input" type="number" step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} required />
      </div>
      <div>
        <label className="label">נכון לתאריך</label>
        <input className="input" type="date" value={openingBalanceDate} onChange={(e) => setOpeningBalanceDate(e.target.value)} required />
      </div>
      <div>
        <label className="label">צבע</label>
        <input className="input h-10 p-1" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </div>
      <div className="md:col-span-3">
        <label className="label">הערות</label>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="md:col-span-3 flex justify-end">
        <button className="btn-primary" type="submit" disabled={submitting}>{submitting ? "שומר..." : "הוסף חשבון"}</button>
      </div>
    </form>
  );
}
