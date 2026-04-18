"use client";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Account { id: string; name: string; color: string; }

type Kind = "RECEIVABLE_DEFERRED" | "RECEIVABLE_DISCOUNTED" | "PAYABLE";

const KIND_LABEL: Record<Kind, string> = {
  RECEIVABLE_DEFERRED: "שיק דחוי ללקבל",
  RECEIVABLE_DISCOUNTED: "שיק נכיון",
  PAYABLE: "שיק לפירעון",
};

interface ParsedRow {
  dueDate: string | null; // ISO date YYYY-MM-DD
  amount: number | null;
  counterparty: string;
  reference: string;
  error: string | null;
}

export default function ImportChecksPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [kind, setKind] = useState<Kind>("RECEIVABLE_DEFERRED");
  const [purpose, setPurpose] = useState("");
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: { index: number; reason: string }[] } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [imageNote, setImageNote] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const a = await fetch("/api/accounts").then((r) => r.json());
      setAccounts(a);
      if (a[0]) setAccountId(a[0].id);
    })();
  }, []);

  async function extractFromImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    setUploading(true);
    setResult(null);
    setImageNote(null);
    setProgress({ done: 0, total: fileList.length });

    const CONCURRENCY = 4;
    let doneCount = 0;
    const notes: string[] = [];

    async function processOne(file: File) {
      const fd = new FormData();
      fd.append("image", file);
      try {
        const res = await fetch("/api/checks/extract-image", { method: "POST", body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          notes.push(`[${file.name}] שגיאה: ${err.error ?? res.statusText}`);
          return;
        }
        const data = await res.json();
        if (data.imageNotes) notes.push(`[${file.name}] ${data.imageNotes}`);
        const newRows: ParsedRow[] = [];
        for (const c of data.checks ?? []) {
          newRows.push({
            dueDate: c.dueDate ?? null,
            amount: typeof c.amount === "number" && c.amount > 0 ? c.amount : null,
            counterparty: c.counterparty ?? "",
            reference: c.reference ?? "",
            error: validateRow(c),
          });
        }
        // Stream results into the table as each image finishes.
        if (newRows.length > 0) setRows((prev) => [...prev, ...newRows]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        notes.push(`[${file.name}] שגיאה ברשת: ${msg}`);
      } finally {
        doneCount += 1;
        setProgress({ done: doneCount, total: fileList.length });
      }
    }

    // Simple concurrency pool — always keep CONCURRENCY workers running.
    const queue = [...fileList];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const file = queue.shift();
        if (file) await processOne(file);
      }
    });
    await Promise.all(workers);

    setImageNote(notes.length > 0 ? notes.join(" · ") : null);
    setUploading(false);
    setProgress(null);
  }

  function parse() {
    setResult(null);
    const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const parsed: ParsedRow[] = [];
    for (const line of lines) {
      // Detect delimiter: tab, or 2+ spaces, or comma
      let parts: string[];
      if (line.includes("\t")) parts = line.split("\t");
      else if (line.includes(",")) parts = line.split(",");
      else parts = line.split(/\s{2,}/);
      parts = parts.map((p) => p.trim());

      // Find the date token and the amount token anywhere in the line
      let dueDate: string | null = null;
      let amount: number | null = null;
      let remaining: string[] = [];
      for (const part of parts) {
        if (dueDate == null) {
          const d = parseDate(part);
          if (d) { dueDate = d; continue; }
        }
        if (amount == null) {
          const n = parseAmount(part);
          if (n != null && n > 0) { amount = n; continue; }
        }
        remaining.push(part);
      }
      // Assume first remaining = counterparty, second = reference (check number)
      const counterparty = remaining[0] ?? "";
      const reference = remaining[1] ?? "";

      let error: string | null = null;
      if (!dueDate) error = "לא זוהה תאריך פרעון";
      else if (amount == null) error = "לא זוהה סכום";

      parsed.push({ dueDate, amount, counterparty, reference, error });
    }
    setRows(parsed);
  }

  function updateRow(i: number, patch: Partial<ParsedRow>) {
    setRows((prev) => prev.map((r, idx) => {
      if (idx !== i) return r;
      const merged = { ...r, ...patch };
      // Recompute validity
      let error: string | null = null;
      if (!merged.dueDate) error = "תאריך פרעון חסר";
      else if (merged.amount == null || merged.amount <= 0) error = "סכום חסר";
      return { ...merged, error };
    }));
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    if (!accountId) { alert("בחר חשבון"); return; }
    const valid = rows.filter((r) => !r.error);
    if (valid.length === 0) { alert("אין שורות תקינות"); return; }
    setSubmitting(true);
    const payload = {
      checks: valid.map((r) => ({
        accountId,
        kind,
        amount: r.amount,
        dueDate: r.dueDate,
        counterparty: r.counterparty || "—",
        reference: r.reference || null,
        purpose: purpose || null,
      })),
    };
    const res = await fetch("/api/checks/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setResult(data);
    setSubmitting(false);
    if (data.created > 0 && (!data.errors || data.errors.length === 0)) {
      setRows([]);
      setRawText("");
    }
  }

  const validCount = useMemo(() => rows.filter((r) => !r.error).length, [rows]);
  const totalAmount = useMemo(() => rows.reduce((s, r) => s + (r.amount ?? 0), 0), [rows]);

  return (
    <div className="flex flex-col gap-4">
      <h1>יבוא שיקים מרובה</h1>
      <p className="text-sm text-slate-500">
        הדבק רשימת שיקים (שורה לכל שיק). חייב להופיע <strong>תאריך פרעון</strong> ו<strong>סכום</strong>. שאר השדות (שם לקוח, מספר שיק) רשות ומזוהים אוטומטית.
        תומך בפורמטים DD/MM/YYYY · DD/MM/YY · YYYY-MM-DD. סכום יכול להיות עם ₪, פסיקים או רווחים.
      </p>

      <div className="card grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="label">חשבון ליעד</label>
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">סוג השיקים</label>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="RECEIVABLE_DEFERRED">שיקים דחויים ללקבל</option>
            <option value="RECEIVABLE_DISCOUNTED">שיקים נכיון</option>
            <option value="PAYABLE">שיקים לפירעון</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label">מטרה (אופציונלי, חל על כל השורות)</label>
          <input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="הגדלת מלאי / תזרים..." />
        </div>
      </div>

      <div className="card flex flex-col gap-4">
        <div>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <label className="label mb-0">העלה תמונות / צילומים של שיקים — חילוץ אוטומטי</label>
            {uploading ? (
              <span className="text-xs text-brand-700">
                Gemini מנתח{progress ? ` (${progress.done}/${progress.total})` : "..."}
              </span>
            ) : null}
          </div>
          {uploading && progress && progress.total > 1 ? (
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-brand-500 transition-all"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
          ) : null}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={uploading}
            onChange={(e) => extractFromImages(e.target.files)}
            className="block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-brand-600 file:text-white file:font-medium file:cursor-pointer file:hover:bg-brand-700 disabled:opacity-50"
          />
          <div className="text-xs text-slate-500 mt-1">
            תומך בצילום שיקים פיזיים, טבלאות, צילומי מסך, או רשימה כתובה. בחר מספר תמונות בבת אחת — הן מנותחות במקביל (4 במקביל), ותוצאות מתווספות לטבלה תוך כדי.
          </div>
          {imageNote ? (
            <div className="mt-2 text-xs text-slate-600 bg-slate-50 rounded p-2 whitespace-pre-wrap">
              {imageNote}
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-100 pt-3">
          <label className="label">או — הדבק רשימה כטקסט</label>
          <textarea
            className="input font-mono text-sm"
            rows={6}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={"15/05/2026  5000  יוסי לוי  12345\n20/05/2026, 3500, חנה כהן, 98765\n2026-06-01\t2,800\tדוד מזרחי\t55512"}
          />
          <div className="flex gap-2 mt-3">
            <button className="btn-primary" onClick={parse} disabled={!rawText.trim()}>נתח טקסט</button>
            <button className="btn" onClick={() => { setRows([]); setRawText(""); setResult(null); setImageNote(null); }}>נקה הכל</button>
          </div>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2>תצוגה מקדימה ({validCount} תקינים מתוך {rows.length})</h2>
            <div className="flex items-center gap-2">
              <div className="text-sm text-slate-500">סכום כולל: <strong>{formatCurrency(totalAmount)}</strong></div>
              <button className="btn-primary" disabled={submitting || validCount === 0} onClick={submit}>
                {submitting ? "מייבא..." : `ייבא ${validCount} שיקים`}
              </button>
            </div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>תאריך פרעון</th>
                <th>סכום</th>
                <th>שם לקוח / ספק</th>
                <th>מספר שיק</th>
                <th>סטטוס</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.error ? "bg-red-50" : ""}>
                  <td className="text-slate-500">{i + 1}</td>
                  <td>
                    <input
                      className="input max-w-[140px]"
                      type="date"
                      value={r.dueDate ?? ""}
                      onChange={(e) => updateRow(i, { dueDate: e.target.value || null })}
                    />
                  </td>
                  <td>
                    <input
                      className="input max-w-[120px]"
                      type="number"
                      step="0.01"
                      value={r.amount ?? ""}
                      onChange={(e) => updateRow(i, { amount: e.target.value ? parseFloat(e.target.value) : null })}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={r.counterparty}
                      onChange={(e) => updateRow(i, { counterparty: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input max-w-[120px]"
                      value={r.reference}
                      onChange={(e) => updateRow(i, { reference: e.target.value })}
                    />
                  </td>
                  <td>
                    {r.error ? <span className="chip-red">{r.error}</span> : <span className="chip-green">תקין</span>}
                  </td>
                  <td>
                    <button className="btn-danger" onClick={() => removeRow(i)}>הסר</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {result ? (
        <div className={`card ${result.created > 0 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
          <div className="font-semibold mb-1">
            {result.created > 0 ? `✓ נוצרו ${result.created} שיקים בהצלחה` : "שגיאה ביצירה"}
          </div>
          {result.errors && result.errors.length > 0 ? (
            <ul className="text-sm list-disc mr-5">
              {result.errors.map((e, i) => <li key={i}>שורה {e.index + 1}: {e.reason}</li>)}
            </ul>
          ) : null}
          {result.created > 0 ? (
            <a href="/future" className="btn-primary mt-2 inline-flex">עבור לדף השיקים</a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function validateRow(c: { dueDate?: string | null; amount?: number | null }): string | null {
  if (!c.dueDate) return "תאריך פרעון חסר";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.dueDate)) return "תאריך לא תקין";
  if (c.amount == null || !Number.isFinite(c.amount) || c.amount <= 0) return "סכום חסר";
  return null;
}

function parseDate(s: string): string | null {
  s = s.trim();
  // DD/MM/YYYY or DD/MM/YY or DD-MM-YYYY or DD.MM.YYYY
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (m[3].length === 2) y = 2000 + y;
    if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 2000 || y > 2100) return null;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  // ISO
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;
  return null;
}

function parseAmount(s: string): number | null {
  const cleaned = s.replace(/[₪$€\s,]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}
