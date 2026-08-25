"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { resetPassword } from "../../../lib/api/auth";

export default function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();

  const token = params.get("token") || "";

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
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="auth-logo">I</span>

          <div>
            <strong>IMKAN</strong>
            <span>WorkDrive</span>
          </div>
        </div>

        <div className="auth-heading">
          <h1>Choose a new password</h1>
          <p>Use at least 8 characters.</p>
        </div>

        <form onSubmit={submit} className="auth-form">
          <label>
            New password

            <input
              className="imkan-input"
              type="password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && (
            <div className="imkan-alert imkan-alert-danger">
              {error}
            </div>
          )}

          <button className="imkan-button" type="submit">
            Update password
          </button>
        </form>

        <p className="auth-switch">
          <Link href="/auth/login">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}