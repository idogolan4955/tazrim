"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false, callbackUrl });
    setLoading(false);
    if (res?.error) {
      setErr("פרטי התחברות שגויים");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-b from-brand-50 to-white">
      <div className="card w-full max-w-sm">
        <h1 className="mb-1">תזרים</h1>
        <p className="text-sm text-slate-500 mb-4">התחברות למערכת ניהול תזרים</p>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <label className="label">אימייל</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="label">סיסמה</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {err ? <div className="text-sm text-red-600">{err}</div> : null}
          <button className="btn-primary justify-center" type="submit" disabled={loading}>
            {loading ? "מתחבר..." : "התחברות"}
          </button>
        </form>
      </div>
    </div>
  );
}
