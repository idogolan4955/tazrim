"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

interface LogRow {
  id: string;
  timestamp: string;
  userId: string | null;
  userName: string | null;
  action: "CREATE" | "UPDATE" | "DELETE" | "CONVERT" | "STATUS_CHANGE" | "IMPORT";
  entity: string;
  entityId: string | null;
  summary: string;
  amount: string | null;
  amountKind: "INCOME" | "EXPENSE" | "NEUTRAL" | null;
}

const ACTION_ICON: Record<string, string> = {
  CREATE: "✨",
  UPDATE: "✎",
  DELETE: "✕",
  CONVERT: "⇄",
  STATUS_CHANGE: "◐",
  IMPORT: "⇣",
};

const ACTION_COLOR: Record<string, string> = {
  CREATE: "text-emerald-600",
  UPDATE: "text-brand-600",
  DELETE: "text-red-600",
  CONVERT: "text-amber-600",
  STATUS_CHANGE: "text-slate-500",
  IMPORT: "text-sky-600",
};

export function LogFeed({ compact = false, initialLimit = 30 }: { compact?: boolean; initialLimit?: number }) {
  const [items, setItems] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await fetch(`/api/audit?limit=${initialLimit}`).then((x) => x.json());
      setItems(r.items ?? []);
      setCursor(r.nextCursor ?? null);
      setLoading(false);
    })();
  }, [initialLimit]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    const r = await fetch(`/api/audit?limit=${initialLimit}&cursor=${cursor}`).then((x) => x.json());
    setItems((prev) => [...prev, ...(r.items ?? [])]);
    setCursor(r.nextCursor ?? null);
    setLoadingMore(false);
  }

  const groups = useMemo(() => {
    const map = new Map<string, LogRow[]>();
    for (const it of items) {
      const d = new Date(it.timestamp);
      const key = dayKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <section>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2>פעולות אחרונות</h2>
        {compact ? (
          <Link href="/log" className="text-sm text-brand-700 hover:underline">ראה את כל ההיסטוריה →</Link>
        ) : null}
      </div>

      <div className={`card log-stripes ${compact ? "max-h-80 overflow-y-auto" : ""}`}>
        {loading ? (
          <div className="text-slate-500 text-center py-6">טוען...</div>
        ) : items.length === 0 ? (
          <div className="text-slate-500 text-center py-6">אין עדיין פעולות במערכת</div>
        ) : (
          <div className="flex flex-col gap-1">
            {groups.map(([day, rows]) => (
              <div key={day} className="flex flex-col">
                <div className="sticky top-0 bg-white/95 backdrop-blur-sm -mx-4 px-4 py-1.5 mb-1 border-b border-slate-100">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{dayHeader(day)}</h3>
                </div>
                {rows.map((r) => <LogRowView key={r.id} row={r} />)}
              </div>
            ))}
          </div>
        )}

        {!compact && cursor ? (
          <div className="mt-3 flex justify-center">
            <button className="btn" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? "טוען..." : "טען עוד"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LogRowView({ row }: { row: LogRow }) {
  const t = new Date(row.timestamp);
  const hhmm = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  const amount = row.amount ? parseFloat(row.amount) : null;
  const amountClass = row.amountKind === "INCOME"
    ? "text-emerald-700"
    : row.amountKind === "EXPENSE"
    ? "text-red-700"
    : "text-slate-700";

  return (
    <div className="flex items-center gap-3 py-1.5 px-1 hover:bg-white/60 rounded-md">
      <span className="text-xs font-mono text-slate-400 w-12 shrink-0 tabular-nums">{hhmm}</span>
      <span className={`w-5 text-center text-sm ${ACTION_COLOR[row.action] ?? "text-slate-500"}`}>
        {ACTION_ICON[row.action] ?? "•"}
      </span>
      <span className="flex-1 text-sm">{row.summary}</span>
      {amount != null ? (
        <span className={`text-sm font-bold tabular-nums ${amountClass}`}>
          {row.amountKind === "EXPENSE" ? "−" : row.amountKind === "INCOME" ? "+" : ""}
          {formatCurrency(amount)}
        </span>
      ) : null}
      {row.userName ? (
        <span className="text-xs text-slate-400 hidden md:inline">{row.userName}</span>
      ) : null}
    </div>
  );
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayHeader(dayKeyStr: string): string {
  const [y, m, d] = dayKeyStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "היום";
  if (diffDays === 1) return "אתמול";
  if (diffDays < 7) {
    const weekday = new Intl.DateTimeFormat("he-IL", { weekday: "long" }).format(date);
    return `${weekday}, ${new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit" }).format(date)}`;
  }
  return new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}
