"use client";

import Link from "next/link";
import { Suspense, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "../../../components/auth/auth-shell";
import { GoogleButton } from "../../../components/auth/google-button";
import { OtpCodeInput } from "../../../components/auth/otp-code-input";
import { useLocale } from "../../../components/locale-provider";
import { googleUrl, isOtpChallenge, login, requestLoginOtp, resendOtp, saveSession, verifyLoginOtp, type OtpChallenge } from "../../../lib/api/auth";
import { emptyOtpDigits, otpValue } from "../../../lib/auth-otp-logic";

function destination(params: URLSearchParams) {
  return params.get("next") || (params.get("inviteToken") ? `/organization/invitations/accept?token=${encodeURIComponent(params.get("inviteToken") || "")}` : "/files");
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { label } = useLocale();
  const [step, setStep] = useState<"email" | "password" | "otp">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [digits, setDigits] = useState(emptyOtpDigits());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const cooldown = useRef<number | null>(null);

  function startCooldown() {
    if (cooldown.current) window.clearInterval(cooldown.current);
    setResendIn(30);
    cooldown.current = window.setInterval(() => {
      setResendIn((current) => {
        if (current <= 1) {
          if (cooldown.current) window.clearInterval(cooldown.current);
          cooldown.current = null;
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }

  async function google() {
    setBusy(true);
    setError("");
    try {
      window.location.href = (await googleUrl()).url;
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      setError(detail && !detail.startsWith("<") ? detail : label("auth.googleUnavailable"));
      setBusy(false);
    }
  }

  async function openOtp(next: OtpChallenge) {
    setChallenge(next);
    setDigits(emptyOtpDigits());
    setStep("otp");
    startCooldown();
  }

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    setError("");
    setStep("password");
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await login(email, password);
      if (!isOtpChallenge(result)) {
        saveSession(result);
        router.replace(destination(params));
        return;
      }
      await openOtp(result);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Unable to sign in. Check your email and password.");
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(event: FormEvent) {
    event.preventDefault();
    if (!challenge || otpValue(digits).length < 6) return;
    setBusy(true);
    setError("");
    try {
      saveSession(await verifyLoginOtp(challenge.challenge_id, otpValue(digits)));
      router.replace(destination(params));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "The verification code is incorrect.");
    } finally {
      setBusy(false);
    }
  }

  async function useOtpInstead() {
    setBusy(true);
    setError("");
    try {
      await openOtp(await requestLoginOtp(email));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Unable to send a verification code.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!challenge || resendIn > 0) return;
    setBusy(true);
    setError("");
    try {
      await openOtp(await resendOtp(challenge.challenge_id));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Unable to resend the code.");
    } finally {
      setBusy(false);
    }
  }

  const notice = params.get("expired") ? label("auth.sessionExpired") : params.get("reset") ? label("auth.passwordUpdated") : "";

  return (
    <AuthShell
      title={step === "otp" ? label("auth.otpTitle") : label("auth.signIn")}
      subtitle={step === "otp" ? `${label("auth.otpSent")} ${challenge?.masked_email ?? ""}` : label("auth.signInDescription")}
      footer={step === "email" ? <p>{label("auth.noAccount")} <Link href="/auth/signup">{label("auth.createAccount")}</Link></p> : null}
    >
      {notice ? <div className="wd-auth-note">{notice}</div> : null}
      {step === "email" ? (
        <form className="wd-auth-form" onSubmit={submitEmail}>
          <label>{label("auth.email")}
            <input className="wd-auth-input" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          {error ? <div className="imkan-alert imkan-alert-danger">{error}</div> : null}
          <button className="wd-auth-submit" type="submit">{label("auth.next")}</button>
          <div className="wd-auth-divider"><span>{label("auth.signInUsing")}</span></div>
          <GoogleButton label={label("auth.continueGoogle")} disabled={busy} onClick={google} />
        </form>
      ) : null}
      {step === "password" ? (
        <form className="wd-auth-form" onSubmit={submitPassword}>
          <div className="wd-auth-identity">
            <span>{email}</span>
            <button type="button" onClick={() => { setStep("email"); setPassword(""); setError(""); }}>{label("auth.change")}</button>
          </div>
          <label>{label("auth.password")}
            <span className="wd-auth-password">
              <input className="wd-auth-input" type={showPassword ? "text" : "password"} required minLength={8} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
              <button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? label("auth.hidePassword") : label("auth.showPassword")}</button>
            </span>
          </label>
          <div className="wd-auth-row">
            <Link href="/auth/forgot-password">{label("auth.forgotPassword")}</Link>
            <button type="button" onClick={useOtpInstead} disabled={busy}>{label("auth.signInWithOtp")}</button>
          </div>
          {error ? <div className="imkan-alert imkan-alert-danger">{error}</div> : null}
          <button className="wd-auth-submit" type="submit" disabled={busy}>{busy ? "…" : label("auth.signIn")}</button>
        </form>
      ) : null}
      {step === "otp" && challenge ? (
        <form className="wd-auth-form" onSubmit={submitOtp}>
          {challenge.dev_code ? <div className="wd-auth-note">{label("auth.devCode")} <strong>{challenge.dev_code}</strong></div> : null}
          <OtpCodeInput digits={digits} onChange={setDigits} disabled={busy} />
          {error ? <div className="imkan-alert imkan-alert-danger">{error}</div> : null}
          <button className="wd-auth-submit" type="submit" disabled={busy || otpValue(digits).length < 6}>{busy ? "…" : label("auth.verify")}</button>
          <div className="wd-auth-row">
            <button type="button" onClick={() => { setStep("password"); setError(""); }}>{label("auth.back")}</button>
            <button type="button" onClick={resend} disabled={busy || resendIn > 0}>{resendIn > 0 ? `${label("auth.resendIn")} ${resendIn}` : label("auth.resend")}</button>
          </div>
        </form>
      ) : null}
    </AuthShell>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<main className="wd-auth-page" />}><LoginForm /></Suspense>;
}
