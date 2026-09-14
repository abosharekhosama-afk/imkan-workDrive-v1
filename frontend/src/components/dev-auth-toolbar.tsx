"use client";

/**
 * Local-only helper for the application's existing browser token mechanism.
 * This is not an authentication provider and never displays or logs a token.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocale } from "./locale-provider";
import { getAccessToken } from "../lib/api/client";
import {
  clearDevAuthToken,
  isDevelopment,
  readDevAuthStatus,
  setDevAuthToken,
  TOKEN_STORAGE_KEY,
  type DevAuthStatus,
} from "./dev-auth-toolbar-logic";

export { clearDevAuthToken, isDevelopment, readDevAuthStatus, setDevAuthToken, TOKEN_STORAGE_KEY } from "./dev-auth-toolbar-logic";
export type { DevAuthStatus } from "./dev-auth-toolbar-logic";

export function DevAuthToolbar() {
  if (!isDevelopment()) return null;
  return <DevAuthToolbarInner />;
}

function DevAuthToolbarInner() {
  const { label } = useLocale();
  const [status, setStatus] = useState<DevAuthStatus>("loading");
  const [token, setToken] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);

  const syncStatus = useCallback(() => {
    void readDevAuthStatus(getAccessToken)
      .then((next) => setStatus(next))
      .catch(() => setStatus("unauthenticated"));
  }, []);
  useEffect(() => {
    syncStatus();
    const onStorage = (event: StorageEvent) => {
      if (event.key === TOKEN_STORAGE_KEY) syncStatus();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [syncStatus]);

  const submitToken = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidation(null);
    setStorageError(false);
    if (!token.trim()) {
      setValidation(label("devAuth.tokenRequired"));
      return;
    }
    try {
      setDevAuthToken(token);
      setToken("");
      syncStatus();
      window.location.reload();
    } catch {
      setStorageError(true);
    }
  };

  const clearSession = () => {
    try {
      clearDevAuthToken();
      setToken("");
      setValidation(null);
      setStorageError(false);
      setStatus("unauthenticated");
      window.location.reload();
    } catch {
      setStorageError(true);
    }
  };

  const statusLabel = status === "loading"
    ? label("devAuth.loading")
    : status === "authenticated"
      ? label("devAuth.authenticated")
      : label("devAuth.unauthenticated");

  return (
    <div role="toolbar" aria-label={label("devAuth.heading")} className="imkan-panel flex-wrap items-center gap-3 px-4 py-2 text-[length:var(--imkan-font-size-secondary)]">
      <span className="imkan-badge" aria-label={label("devAuth.heading")}>{label("devAuth.devIndicator")}</span>
      <span aria-live="polite">{statusLabel}</span>
      <form onSubmit={submitToken} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="dev-auth-token" className="imkan-meta">{label("devAuth.tokenLabel")}</label>
          <input id="dev-auth-token" name="dev-auth-token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder={label("devAuth.tokenPlaceholder")} className="imkan-input" aria-describedby={validation ? "dev-auth-message" : undefined} />
        </div>
        <button type="submit" className="imkan-button">{label("devAuth.setToken")}</button>
        <button type="button" className="imkan-button-secondary" onClick={clearSession}>{label("devAuth.clearSession")}</button>
      </form>
      {validation ? <span id="dev-auth-message" role="alert" className="imkan-muted">{validation}</span> : null}
      {storageError ? <span role="alert" className="imkan-muted">{label("devAuth.storageError")}</span> : null}
    </div>
  );
}
