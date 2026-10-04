"use client";

import { useRef, useState } from "react";
import { fileToAvatarDataUrl } from "../lib/avatar-image-logic";

export function rememberAccountProfile(patch: { name?: string | null; email?: string; avatarUrl?: string | null; role?: string; organizationName?: string | null }) {
  if (typeof window === "undefined") return;
  let current: Record<string, unknown> = {};
  try { current = JSON.parse(localStorage.getItem("workdrive_user") || "{}") as Record<string, unknown>; } catch { current = {}; }
  const next = { ...current, ...patch };
  localStorage.setItem("workdrive_user", JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("workdrive:profile", { detail: next }));
}

function initials(name: string, email: string) {
  const source = (name || email.split("@")[0] || "U").trim();
  return source.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export function AccountAvatar({
  name,
  email,
  avatarUrl,
  size = 88,
  editable = false,
  changeLabel,
  removeLabel,
  onChange,
}: {
  name: string;
  email: string;
  avatarUrl?: string | null;
  size?: number;
  editable?: boolean;
  changeLabel: string;
  removeLabel: string;
  onChange?: (avatarUrl: string | null) => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function apply(next: string | null) {
    if (!onChange) return;
    setBusy(true);
    setError("");
    try {
      await onChange(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the photo.");
    } finally {
      setBusy(false);
    }
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      await apply(await fileToAvatarDataUrl(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the photo.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="account-avatar-block">
      <div className="account-avatar-wrap" style={{ width: size, height: size }}>
        <div className="account-profile-avatar" style={{ width: size, height: size, margin: 0 }}>
          {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(name, email)}
        </div>
        {editable ? (
          <button type="button" className="account-avatar-edit" disabled={busy} onClick={() => inputRef.current?.click()} aria-label={changeLabel} title={changeLabel}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
          </button>
        ) : null}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void pick(event.target.files?.[0])} />
      </div>
      {editable && avatarUrl ? <button type="button" className="account-avatar-remove" disabled={busy} onClick={() => void apply(null)}>{removeLabel}</button> : null}
      {error ? <div className="account-avatar-error">{error}</div> : null}
    </div>
  );
}
