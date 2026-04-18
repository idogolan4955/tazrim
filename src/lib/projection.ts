import { prisma } from "./prisma";
import { spitzerSchedule } from "./spitzer";
import { toNumber } from "./utils";
import type { Frequency, TxnKind } from "@prisma/client";

export interface ProjectionEvent {
  date: Date;
  accountId: string;
  amount: number; // +income / -expense
  label: string;
  source: "ACTUAL" | "RECURRING" | "LOAN" | "CHECK" | "PURCHASE" | "MANUAL_PROJECTED";
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  balance: number;
}

export interface AccountProjection {
  accountId: string;
  accountName: string;
  openingBalance: number;
  current: number;
  plus1m: number;
  plus3m: number;
  plus6m: number;
  plus12m: number;
  series: DailyPoint[];
}

export interface LedgerRow {
  date: string; // YYYY-MM-DD
  accountId: string;
  accountName: string;
  accountColor: string;
  label: string;
  source: ProjectionEvent["source"];
  amount: number; // signed (+income, -expense)
  runningBalance: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function buildProjection(opts: { accountIds?: string[]; horizonMonths?: number; asOf?: Date } = {}): Promise<{
  byAccount: AccountProjection[];
  combined: { series: DailyPoint[]; current: number; plus1m: number; plus3m: number; plus6m: number; plus12m: number };
}> {
  const horizon = opts.horizonMonths ?? 12;
  const asOf = stripTime(opts.asOf ?? new Date());
  const end = new Date(asOf);
  end.setMonth(end.getMonth() + horizon);

  const accounts = await prisma.account.findMany({
    where: opts.accountIds && opts.accountIds.length > 0 ? { id: { in: opts.accountIds } } : undefined,
    orderBy: { createdAt: "asc" },
  });

  const purchaseEventsByAccount = await buildPurchaseEvents(asOf, end);

  const results: AccountProjection[] = [];
  for (const acc of accounts) {
    const events = await gatherEvents(acc.id, asOf, end);
    const purchaseEvents = purchaseEventsByAccount.get(acc.id) ?? [];
    events.push(...purchaseEvents);

    const openingBalance = toNumber(acc.openingBalance);
    const openingDate = stripTime(acc.openingBalanceDate);

    // Current balance = opening + all ACTUAL between openingDate and asOf.
    let current = openingBalance;
    const actuals = await prisma.transaction.findMany({
      where: { accountId: acc.id, status: "ACTUAL", date: { gte: openingDate, lte: asOf } },
      orderBy: { date: "asc" },
    });
    for (const t of actuals) {
      current += signed(toNumber(t.amount), t.kind);
    }

    // Projected events from asOf to end (strictly after asOf).
    const futureEvents = events.filter((e) => e.date > asOf && e.date <= end);
    futureEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Build daily series from asOf .. end.
    const series: DailyPoint[] = [];
    let bal = current;
    let idx = 0;
    for (let d = new Date(asOf); d <= end; d = new Date(d.getTime() + DAY_MS)) {
      while (idx < futureEvents.length && sameDay(futureEvents[idx].date, d)) {
        bal += futureEvents[idx].amount;
        idx++;
      }
      series.push({ date: dateKey(d), balance: round2(bal) });
    }

    results.push({
      accountId: acc.id,
      accountName: acc.name,
      openingBalance,
      current: round2(current),
      plus1m: pickByOffset(series, asOf, 1),
      plus3m: pickByOffset(series, asOf, 3),
      plus6m: pickByOffset(series, asOf, 6),
      plus12m: pickByOffset(series, asOf, 12),
      series,
    });
  }

  // Combined series (sum across selected accounts, day by day).
  const dates = results[0]?.series.map((p) => p.date) ?? [];
  const combinedSeries: DailyPoint[] = dates.map((date, i) => ({
    date,
    balance: round2(results.reduce((s, r) => s + (r.series[i]?.balance ?? 0), 0)),
  }));

  return {
    byAccount: results,
    combined: {
      series: combinedSeries,
      current: round2(results.reduce((s, r) => s + r.current, 0)),
      plus1m: round2(results.reduce((s, r) => s + r.plus1m, 0)),
      plus3m: round2(results.reduce((s, r) => s + r.plus3m, 0)),
      plus6m: round2(results.reduce((s, r) => s + r.plus6m, 0)),
      plus12m: round2(results.reduce((s, r) => s + r.plus12m, 0)),
    },
  };
}

export async function buildLedger(opts: {
  accountIds?: string[];
  horizonMonths?: number;
  asOf?: Date;
  includePast?: boolean;
  pastDays?: number;
} = {}): Promise<{ rows: LedgerRow[]; startingBalance: number }> {
  const horizon = opts.horizonMonths ?? 12;
  const asOf = stripTime(opts.asOf ?? new Date());
  const end = new Date(asOf);
  end.setMonth(end.getMonth() + horizon);
  const pastDays = opts.pastDays ?? 60;
  const pastStart = new Date(asOf);
  pastStart.setDate(pastStart.getDate() - pastDays);

  const accounts = await prisma.account.findMany({
    where: opts.accountIds && opts.accountIds.length > 0 ? { id: { in: opts.accountIds } } : undefined,
    orderBy: { createdAt: "asc" },
  });
  const accountsById = new Map(accounts.map((a) => [a.id, a]));

  const purchaseEventsByAccount = await buildPurchaseEvents(asOf, end);

  const events: ProjectionEvent[] = [];
  let startingBalanceAtPastStart = 0; // combined balance at pastStart (or asOf if !includePast)

  for (const acc of accounts) {
    const openingBalance = toNumber(acc.openingBalance);
    const openingDate = stripTime(acc.openingBalanceDate);

    // Actual past txns (between openingDate and asOf)
    const actuals = await prisma.transaction.findMany({
      where: { accountId: acc.id, status: "ACTUAL", date: { gte: openingDate, lte: asOf } },
      orderBy: { date: "asc" },
    });

    // Balance at pastStart = openingBalance + actuals from openingDate..pastStart-1
    let balAtPastStart = openingBalance;
    for (const t of actuals) {
      if (stripTime(t.date) < (opts.includePast ? pastStart : asOf)) {
        balAtPastStart += signed(toNumber(t.amount), t.kind);
      }
    }
    startingBalanceAtPastStart += balAtPastStart;

    // Actual events from pastStart onwards (if includePast)
    if (opts.includePast) {
      for (const t of actuals) {
        const d = stripTime(t.date);
        if (d >= pastStart && d <= asOf) {
          events.push({
            date: d,
            accountId: acc.id,
            amount: signed(toNumber(t.amount), t.kind),
            label: t.description,
            source: "ACTUAL",
          });
        }
      }
    }

    // Future projected events
    const future = await gatherEvents(acc.id, asOf, end);
    const purchase = purchaseEventsByAccount.get(acc.id) ?? [];
    for (const e of [...future, ...purchase]) {
      if (e.date > asOf && e.date <= end) events.push(e);
    }
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime() || sortSource(a.source, b.source));

  const rows: LedgerRow[] = [];
  let running = startingBalanceAtPastStart;
  for (const e of events) {
    running += e.amount;
    const acc = accountsById.get(e.accountId);
    rows.push({
      date: dateKey(e.date),
      accountId: e.accountId,
      accountName: acc?.name ?? "—",
      accountColor: acc?.color ?? "#64748b",
      label: e.label,
      source: e.source,
      amount: round2(e.amount),
      runningBalance: round2(running),
    });
  }

  return { rows, startingBalance: round2(startingBalanceAtPastStart) };
}

function sortSource(a: string, b: string) {
  const order = ["ACTUAL", "RECURRING", "LOAN", "CHECK", "PURCHASE", "MANUAL_PROJECTED"];
  return order.indexOf(a) - order.indexOf(b);
}

async function gatherEvents(accountId: string, asOf: Date, end: Date): Promise<ProjectionEvent[]> {
  const events: ProjectionEvent[] = [];

  // 1) PROJECTED transactions already stored (manual future entries)
  const projTxns = await prisma.transaction.findMany({
    where: { accountId, status: "PROJECTED", date: { gte: asOf, lte: end } },
  });
  for (const t of projTxns) {
    events.push({
      date: stripTime(t.date),
      accountId,
      amount: signed(toNumber(t.amount), t.kind),
      label: t.description,
      source: "MANUAL_PROJECTED",
    });
  }

  // 2) Recurring transactions — expand within window
  const recurrences = await prisma.recurringTransaction.findMany({ where: { accountId, active: true } });
  for (const r of recurrences) {
    const windowStart = r.startDate > asOf ? stripTime(r.startDate) : asOf;
    const windowEnd = r.endDate && r.endDate < end ? stripTime(r.endDate) : end;
    const occurrences = expandRecurrence(r.frequency, stripTime(r.startDate), windowStart, windowEnd, r.dayOfMonth ?? undefined);
    for (const occ of occurrences) {
      events.push({
        date: occ,
        accountId,
        amount: signed(toNumber(r.amount), r.kind),
        label: r.name,
        source: "RECURRING",
      });
    }
  }

  // 3) Loans — generate Spitzer payment schedule on the fly (monthly payment as EXPENSE)
  const loans = await prisma.loan.findMany({ where: { accountId } });
  for (const loan of loans) {
    const rate = await resolveLoanRate(loan);
    const override = toNumber(loan.monthlyPaymentOverride);
    const basis = toNumber(loan.currentBalance) > 0 ? toNumber(loan.currentBalance) : toNumber(loan.principal);
    const schedule = spitzerSchedule({
      principal: basis,
      annualRatePct: rate,
      termMonths: loan.termMonths,
      startDate: stripTime(loan.startDate),
    });
    for (const row of schedule) {
      if (row.paymentDate >= asOf && row.paymentDate <= end) {
        const payment = override > 0 ? override : row.payment;
        events.push({
          date: row.paymentDate,
          accountId,
          amount: -payment,
          label: `החזר הלוואה: ${loan.name}`,
          source: "LOAN",
        });
      }
    }
  }

  // 4) Checks — affect balance like a real bank OSH statement
  const checks = await prisma.check.findMany({
    where: { accountId, status: "PENDING" },
  });
  for (const c of checks) {
    const amt = toNumber(c.amount);
    const due = stripTime(c.dueDate);

    if (c.kind === "PAYABLE") {
      if (due >= asOf && due <= end) {
        events.push({ date: due, accountId, amount: -amt, label: `שיק לפירעון: ${c.counterparty}`, source: "CHECK" });
      }
    } else if (c.kind === "RECEIVABLE_DEFERRED") {
      if (due >= asOf && due <= end) {
        events.push({ date: due, accountId, amount: amt, label: `שיק דחוי מ־${c.counterparty}`, source: "CHECK" });
      }
    } else if (c.kind === "RECEIVABLE_DISCOUNTED") {
      // Three events like a real bank OSH:
      // (1) discount date  → +amount (bank credits us now, we receive cash from the discount)
      // (2) due date       → +amount (the check clears in from customer)
      // (3) due date       → -amount (bank claws back the discount advance)
      // Net on due date = 0, but all three rows appear in the ledger.
      const discountDate = c.discountedOn ? stripTime(c.discountedOn) : due;
      if (discountDate >= asOf && discountDate <= end) {
        events.push({
          date: discountDate,
          accountId,
          amount: amt,
          label: `נכיון שיק מ־${c.counterparty}`,
          source: "CHECK",
        });
      }
      if (due >= asOf && due <= end) {
        events.push({
          date: due,
          accountId,
          amount: amt,
          label: `פרעון שיק דחוי מ־${c.counterparty}`,
          source: "CHECK",
        });
        events.push({
          date: due,
          accountId,
          amount: -amt,
          label: `החזר אשראי נכיון (${c.counterparty})`,
          source: "CHECK",
        });
      }
    }
  }

  return events;
}

/**
 * Derive projected purchase expense events from monthly sales rows.
 * Purchases are assigned to the account identified by `default_purchase_account_id` setting.
 * If the setting isn't set, no purchase events are generated.
 *
 * For each month that has either forecastAmount or salesAmount > 0, we schedule an expense
 * on the last day of that month equal to (salesAmount || forecast) × purchaseRatio.
 * Past-month sales don't project (only months strictly after asOf).
 */
async function buildPurchaseEvents(asOf: Date, end: Date): Promise<Map<string, ProjectionEvent[]>> {
  const out = new Map<string, ProjectionEvent[]>();
  const acct = await prisma.setting.findUnique({ where: { key: "default_purchase_account_id" } });
  if (!acct?.value) return out;
  const accountId = acct.value;
  const sales = await prisma.monthlySales.findMany();
  for (const s of sales) {
    const monthDate = monthEndDate(s.month);
    if (monthDate < asOf || monthDate > end) continue;
    const base = toNumber(s.salesAmount) || toNumber(s.forecastAmount);
    if (base <= 0) continue;
    const ratio = toNumber(s.purchaseRatio);
    const purchase = base * ratio;
    if (purchase <= 0) continue;
    const ev: ProjectionEvent = {
      date: monthDate,
      accountId,
      amount: -purchase,
      label: `רכש חזוי ${s.month}`,
      source: "PURCHASE",
    };
    const arr = out.get(accountId) ?? [];
    arr.push(ev);
    out.set(accountId, arr);
  }
  return out;
}

function monthEndDate(ym: string): Date {
  const [y, m] = ym.split("-").map((n) => parseInt(n, 10));
  const d = new Date(y, m, 0); // last day of month m
  d.setHours(0, 0, 0, 0);
  return d;
}

async function resolveLoanRate(loan: { type: "FIXED" | "PRIME_LINKED"; spread: unknown; fixedRate: unknown | null }): Promise<number> {
  if (loan.type === "FIXED") {
    return toNumber(loan.fixedRate);
  }
  const boi = await prisma.setting.findUnique({ where: { key: "boi_base_rate" } });
  const base = boi ? parseFloat(boi.value) : parseFloat(process.env.BOI_BASE_RATE_FALLBACK ?? "4.5");
  const prime = base + 1.5;
  return prime + toNumber(loan.spread);
}

function expandRecurrence(freq: Frequency, start: Date, from: Date, to: Date, dayOfMonth?: number): Date[] {
  const out: Date[] = [];
  if (freq === "ONE_TIME") {
    if (start >= from && start <= to) out.push(start);
    return out;
  }
  let cur = new Date(start);
  while (cur < from) cur = nextStep(cur, freq);
  while (cur <= to) {
    if (freq === "MONTHLY" && dayOfMonth) {
      const d = new Date(cur);
      d.setDate(Math.min(dayOfMonth, daysInMonth(d)));
      if (d >= from && d <= to) out.push(stripTime(d));
    } else {
      out.push(stripTime(cur));
    }
    cur = nextStep(cur, freq);
  }
  return out;
}

function nextStep(d: Date, freq: Frequency): Date {
  const nd = new Date(d);
  switch (freq) {
    case "WEEKLY":
      nd.setDate(nd.getDate() + 7);
      break;
    case "BIWEEKLY":
      nd.setDate(nd.getDate() + 14);
      break;
    case "MONTHLY":
      nd.setMonth(nd.getMonth() + 1);
      break;
    case "YEARLY":
      nd.setFullYear(nd.getFullYear() + 1);
      break;
    default:
      nd.setFullYear(nd.getFullYear() + 100);
  }
  return nd;
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function signed(amount: number, kind: TxnKind) {
  return kind === "INCOME" ? Math.abs(amount) : -Math.abs(amount);
}

function stripTime(d: Date) {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function pickByOffset(series: DailyPoint[], asOf: Date, months: number): number {
  const target = new Date(asOf);
  target.setMonth(target.getMonth() + months);
  const key = dateKey(target);
  let last = series[0]?.balance ?? 0;
  for (const p of series) {
    if (p.date <= key) last = p.balance;
    else break;
  }
  return round2(last);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
