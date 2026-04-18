"use client";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Account { id: string; name: string; color: string; }
interface Loan {
  id: string;
  accountId: string;
  name: string;
  principal: string;
  type: "FIXED" | "PRIME_LINKED";
  spread: string;
  fixedRate: string | null;
  startDate: string;
  termMonths: number;
  effectiveRate: number;
  monthlyPayment: number;
  account?: Account;
}
interface LoansResponse { loans: Loan[]; boi: number; prime: number; }

export default function LoansPage() {
  const [data, setData] = useState<LoansResponse | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rateUpdatedAt, setRateUpdatedAt] = useState<string | null>(null);
  const [rateSource, setRateSource] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [l, a, r] = await Promise.all([
      fetch("/api/loans").then((x) => x.json()),
      fetch("/api/accounts").then((x) => x.json()),
      fetch("/api/boi-rate").then((x) => x.json()),
    ]);
    setData(l);
    setAccounts(a);
    setRateUpdatedAt(r.updatedAt);
    setRateSource(r.source);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  async function refreshRate() {
    setRefreshing(true);
    const r = await fetch("/api/boi-rate?refresh=1").then((x) => x.json());
    setRateUpdatedAt(r.updatedAt);
    setRateSource(r.source);
    setRefreshing(false);
    load();
  }

  async function setManualRate() {
    const v = prompt("הזן ריבית בנק ישראל ידנית (%)", data ? String(data.boi) : "4.5");
    if (!v) return;
    const rate = parseFloat(v);
    if (!Number.isFinite(rate)) return;
    await fetch("/api/boi-rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rate }),
    });
    load();
  }

  async function remove(loan: Loan) {
    if (!confirm(`למחוק את ההלוואה "${loan.name}"? פעולה זו תמחק גם את ההחזר החודשי מהפעולות החוזרות.`)) return;
    await fetch(`/api/loans/${loan.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1>הלוואות</h1>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>{showForm ? "סגור" : "הוסף הלוואה"}</button>
      </div>

      <div className="card flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-sm text-slate-500">ריבית בנק ישראל</div>
          <div className="text-2xl font-bold">{data?.boi.toFixed(2)}%</div>
          <div className="text-xs text-slate-500">פריים = {data?.prime.toFixed(2)}% · מקור: {rateSource === "live" ? "חי" : rateSource === "cache" ? "מטמון" : "ברירת מחדל"}{rateUpdatedAt ? ` · עודכן ${formatDate(rateUpdatedAt)}` : ""}</div>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={refreshRate} disabled={refreshing}>{refreshing ? "מרענן..." : "רענן ריבית"}</button>
          <button className="btn" onClick={setManualRate}>עדכון ידני</button>
        </div>
      </div>

      {showForm ? <NewLoanForm accounts={accounts} prime={data?.prime ?? 6} onCreated={() => { setShowForm(false); load(); }} /> : null}

      <div className="card overflow-x-auto">
        {loading ? "טוען..." : (
          <table className="table">
            <thead>
              <tr>
                <th>שם</th>
                <th>חשבון</th>
                <th>קרן</th>
                <th>סוג</th>
                <th>ריבית אפקטיבית</th>
                <th>החזר חודשי</th>
                <th>התחלה</th>
                <th>תקופה</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data?.loans.map((l) => (
                <tr key={l.id}>
                  <td className="font-medium">{l.name}</td>
                  <td>{l.account?.name ?? "—"}</td>
                  <td>{formatCurrency(l.principal)}</td>
                  <td>{l.type === "FIXED" ? "קבועה" : `פריים + ${parseFloat(l.spread).toFixed(2)}%`}</td>
                  <td>{l.effectiveRate.toFixed(2)}%</td>
                  <td>{formatCurrency(l.monthlyPayment)}</td>
                  <td>{formatDate(l.startDate)}</td>
                  <td>{l.termMonths} ח׳</td>
                  <td><button className="btn-danger" onClick={() => remove(l)}>מחק</button></td>
                </tr>
              ))}
              {data?.loans.length === 0 && !loading ? (
                <tr><td colSpan={9} className="text-center text-slate-500">אין הלוואות</td></tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function NewLoanForm({ accounts, prime, onCreated }: { accounts: Account[]; prime: number; onCreated: () => void }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [name, setName] = useState("");
  const [principal, setPrincipal] = useState("");
  const [type, setType] = useState<"PRIME_LINKED" | "FIXED">("PRIME_LINKED");
  const [spread, setSpread] = useState("1.5");
  const [fixedRate, setFixedRate] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [termMonths, setTermMonths] = useState("60");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  const effectiveRate = type === "FIXED" ? parseFloat(fixedRate || "0") : prime + parseFloat(spread || "0");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch("/api/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        name,
        principal: parseFloat(principal || "0"),
        type,
        spread: type === "PRIME_LINKED" ? parseFloat(spread || "0") : 0,
        fixedRate: type === "FIXED" ? parseFloat(fixedRate || "0") : null,
        startDate,
        termMonths: parseInt(termMonths, 10),
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
        <label className="label">שם ההלוואה</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label">קרן</label>
        <input className="input" type="number" step="0.01" value={principal} onChange={(e) => setPrincipal(e.target.value)} required />
      </div>
      <div>
        <label className="label">סוג ריבית</label>
        <select className="input" value={type} onChange={(e) => setType(e.target.value as "PRIME_LINKED" | "FIXED")}>
          <option value="PRIME_LINKED">פריים + מרווח</option>
          <option value="FIXED">קבועה</option>
        </select>
      </div>
      {type === "PRIME_LINKED" ? (
        <div>
          <label className="label">מרווח מעל פריים (%)</label>
          <input className="input" type="number" step="0.01" value={spread} onChange={(e) => setSpread(e.target.value)} />
          <div className="text-xs text-slate-500 mt-1">פריים נוכחי: {prime.toFixed(2)}%</div>
        </div>
      ) : (
        <div>
          <label className="label">ריבית קבועה (%)</label>
          <input className="input" type="number" step="0.01" value={fixedRate} onChange={(e) => setFixedRate(e.target.value)} />
        </div>
      )}
      <div>
        <label className="label">תאריך התחלה</label>
        <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
      </div>
      <div>
        <label className="label">תקופה (חודשים)</label>
        <input className="input" type="number" min={1} value={termMonths} onChange={(e) => setTermMonths(e.target.value)} required />
      </div>
      <div className="md:col-span-4 bg-slate-50 rounded-lg p-3 text-sm">
        ריבית אפקטיבית: <strong>{effectiveRate.toFixed(2)}%</strong> · חישוב שפיצר — החזר חודשי מחושב אוטומטית ונוסף לפעולות החוזרות.
      </div>
      <div className="md:col-span-4 flex justify-end">
        <button className="btn-primary" type="submit" disabled={submitting}>{submitting ? "שומר..." : "הוסף הלוואה"}</button>
      </div>
    </form>
  );
}
