"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthShell } from "../../../components/auth/auth-shell";
import { useLocale } from "../../../components/locale-provider";
import { forgotPassword } from "../../../lib/api/auth";

export default function ForgotPassword() {
  const { label } = useLocale();
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await forgotPassword(email);
      setToken(result.reset_token || "");
      setDone(true);
    } catch {
      setError("Unable to process the request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={label("auth.resetTitle")} subtitle={done ? label("auth.resetSent") : label("auth.resetHint")} footer={<Link href="/auth/login">{label("auth.back")}</Link>}>
      {done ? (
        token ? <p className="wd-auth-note">{label("auth.devCode")} <Link href={`/auth/reset-password?token=${encodeURIComponent(token)}`}>{label("auth.resetTitle")}</Link></p> : null
      ) : (
        <form className="wd-auth-form" onSubmit={submit}>
          <label>{label("auth.email")}<input className="wd-auth-input" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
          {error ? <div className="imkan-alert imkan-alert-danger">{error}</div> : null}
          <button className="wd-auth-submit" disabled={busy}>{label("auth.sendReset")}</button>
        </form>
      )}
    </AuthShell>
  );
}
