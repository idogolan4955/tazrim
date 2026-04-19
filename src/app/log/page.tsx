import { LogFeed } from "@/components/log-feed";

export default function LogPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1>היסטוריית פעולות במערכת</h1>
        <p className="text-sm text-slate-500 mt-1">יומן מלא של כל הפעולות במערכת — יצירה, עדכון, מחיקה, ייבוא ושינויי סטטוס.</p>
      </div>
      <LogFeed compact={false} initialLimit={100} />
    </div>
  );
}
