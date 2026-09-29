"use client";

import Link from "next/link";
import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "../../../components/auth/auth-shell";
import { GoogleButton } from "../../../components/auth/google-button";
import { OtpCodeInput } from "../../../components/auth/otp-code-input";
import { useLocale } from "../../../components/locale-provider";
import { googleUrl, resendOtp, saveSession, signup, verifySignupOtp, type OtpChallenge } from "../../../lib/api/auth";
import { emptyOtpDigits, otpValue } from "../../../lib/auth-otp-logic";

function SignupForm() {
  const router = useRouter();
  const search = useSearchParams();
  const inviteToken = search.get("inviteToken") ?? "";
  const { label } = useLocale();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [digits, setDigits] = useState(emptyOtpDigits());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setChallenge(await signup(name, email, password, inviteToken || undefined));
      setDigits(emptyOtpDigits());
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Unable to create your account. The email may already be registered.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError("");
    try {
      saveSession(await verifySignupOtp(challenge.challenge_id, otpValue(digits)));
      router.replace("/files");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "The verification code is incorrect.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    try {
      window.location.href = (await googleUrl()).url;
    } catch {
      setError(label("auth.googleUnavailable"));
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title={challenge ? label("auth.otpTitle") : label("auth.createAccount")}
      subtitle={challenge ? `${label("auth.otpSent")} ${challenge.masked_email}` : label("auth.signupDescription")}
      footer={!challenge ? <p>{label("auth.haveAccount")} <Link href="/auth/login">{label("auth.signIn")}</Link></p> : null}
    >
      {challenge ? (
        <form className="wd-auth-form" onSubmit={verify}>
          {challenge.dev_code ? <div className="wd-auth-note">{label("auth.devCode")} <strong>{challenge.dev_code}</strong></div> : null}
          <OtpCodeInput digits={digits} onChange={setDigits} disabled={busy} />
          {error ? <div className="imkan-alert imkan-alert-danger">{error}</div> : null}
          <button className="wd-auth-submit" disabled={busy || otpValue(digits).length < 6}>{busy ? "…" : label("auth.verify")}</button>
          <button type="button" className="wd-auth-text" onClick={async () => { setBusy(true); try { setChallenge(await resendOtp(challenge.challenge_id)); } catch (err) { setError(err instanceof Error ? err.message : "Unable to resend the code."); } finally { setBusy(false); } }}>{label("auth.resend")}</button>
        </form>
      ) : (
        <form className="wd-auth-form" onSubmit={submit}>
          <label>{label("auth.name")}<input className="wd-auth-input" required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>
          <label>{label("auth.email")}<input className="wd-auth-input" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
          <label>{label("auth.password")}<input className="wd-auth-input" type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label>
          {error ? <div className="imkan-alert imkan-alert-danger">{error}</div> : null}
          <button className="wd-auth-submit" disabled={busy}>{busy ? "…" : label("auth.createAccount")}</button>
          <div className="wd-auth-divider"><span>{label("auth.signInUsing")}</span></div>
          <GoogleButton label={label("auth.continueGoogle")} disabled={busy} onClick={google} />
        </form>
      )}
    </AuthShell>
  );
}

export default function SignupPage() {
  return <Suspense fallback={<main className="wd-auth-page" />}><SignupForm /></Suspense>;
}
