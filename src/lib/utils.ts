import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string, withSign = false) {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  const safe = Number.isFinite(n) ? n : 0;
  const formatted = new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(safe);
  if (withSign && safe > 0) return "+" + formatted;
  return formatted;
}

export function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function startOfDay(d: Date) {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd;
}

export function endOfDay(d: Date) {
  const nd = new Date(d);
  nd.setHours(23, 59, 59, 999);
  return nd;
}

export function toNumber(decimal: unknown): number {
  if (decimal == null) return 0;
  if (typeof decimal === "number") return decimal;
  if (typeof decimal === "string") return parseFloat(decimal);
  if (typeof decimal === "object" && "toString" in (decimal as object)) {
    return parseFloat((decimal as { toString: () => string }).toString());
  }
  return 0;
}
