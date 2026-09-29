"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthShell } from "../../../components/auth/auth-shell";
import { useLocale } from "../../../components/locale-provider";
import { resetPassword } from "../../../lib/api/auth";

export default function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();

  const token = params.get("token") || "";
  const { label } = useLocale();

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();

    try {
      await resetPassword(token, password);
      router.replace("/auth/login?reset=1");
    } catch {
      setError("The reset link is invalid or expired.");
    }
  }

  return (
    <AuthShell title={label("auth.newPassword")} subtitle={label("auth.passwordHint")} footer={<Link href="/auth/login">{label("auth.back")}</Link>}>
      <form onSubmit={submit} className="wd-auth-form">
        <label>
          {label("auth.newPassword")}
          <input className="wd-auth-input" type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
        </label>
        {error ? <div className="imkan-alert imkan-alert-danger">{error}</div> : null}
        <button className="wd-auth-submit" type="submit">{label("auth.updatePassword")}</button>
      </form>
    </AuthShell>
  );
}