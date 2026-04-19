import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireAuth } from "@/lib/api-guard";
import { getSettings, setSetting } from "@/lib/settings";
import { logAction } from "@/lib/audit";

const SETTING_LABEL: Record<string, string> = {
  opening_inventory: "יתרת מלאי פתיחה",
  opening_inventory_date: "תאריך מלאי פתיחה",
  cogs_ratio: "אחוז עלות מכר (COGS)",
  default_purchase_account_id: "חשבון רכש ברירת מחדל",
  default_purchase_ratio: "מקדם רכש ברירת מחדל",
};

const KEYS = [
  "opening_inventory",
  "opening_inventory_date",
  "cogs_ratio",
  "default_purchase_account_id",
  "default_purchase_ratio",
];

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  const values = await getSettings(KEYS);
  return NextResponse.json(values);
}

export async function PATCH(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await req.json();
  const updated: Record<string, string> = {};
  for (const k of KEYS) {
    if (body[k] !== undefined) {
      const v = String(body[k]);
      await setSetting(k, v);
      updated[k] = v;
    }
  }
  const changedKeys = Object.keys(updated);
  if (changedKeys.length > 0) {
    const labels = changedKeys.map((k) => SETTING_LABEL[k] ?? k).join(", ");
    await logAction({
      action: "UPDATE",
      entity: "SETTING",
      summary: `עודכנו הגדרות: ${labels}`,
    });
  }
  return NextResponse.json(updated);
}
