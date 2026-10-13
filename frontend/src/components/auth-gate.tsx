"use client";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, me, redeemOAuthResume, refreshSession, saveSession, SessionCheckError } from "../lib/api/auth";
import { getWorkspaceBootstrap } from "../lib/api/bootstrap";
import {
  authCheckRetryDelayMs,
  buildAuthGateDiagnostic,
  buildAuthLoginNextPath,
  persistBrowserAccessToken,
  readBrowserAccessToken,
  authGatePhase,
  readOAuthResumeToken,
  restoreBrowserAccessTokenAfterOAuth,
  shouldRedirectToLogin,
  shouldEndImkanSession,
  shouldRetryAuthCheck,
} from "./auth-gate-logic";

function logAuthGate(stage: string, detail: ReturnType<typeof buildAuthGateDiagnostic>) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[AuthGate]", stage, detail);
}

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cookie = typeof document !== "undefined" ? document.cookie : "";
    const oauthParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const resumeCode = typeof window !== "undefined" ? readOAuthResumeToken(window.location.hash) : null;
    if (resumeCode && typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    }
    const restoredOAuthToken = (oauthParams.get("oauth") || oauthParams.get("connectionId"))
      ? restoreBrowserAccessTokenAfterOAuth()
      : null;
    const storedToken = restoredOAuthToken ?? readBrowserAccessToken(localStorage, document.cookie);
    const finish = (token: string | null) => {
      if (cancelled) return;
      const phase = authGatePhase({ exchanging: false, hasToken: Boolean(token), meStatus: token ? null : 0 });
      logAuthGate("initialization", buildAuthGateDiagnostic({
      stage: "initialization",
      hasAccessToken: Boolean(token),
      hasCookie: /(?:^| )workdrive_access_token=/.test(cookie),
      oauthResult: oauthParams.get("oauth"),
      provider: oauthParams.get("provider"),
      connectionId: oauthParams.get("connectionId"),
    }));

    if (shouldRedirectToLogin(phase) || !token) {
      const next = buildAuthLoginNextPath(pathname, window.location.search);
      logAuthGate("redirect_login_missing_token", buildAuthGateDiagnostic({
        stage: "redirect_login_missing_token",
        hasAccessToken: false,
        hasCookie: /(?:^| )workdrive_access_token=/.test(cookie),
        redirectTarget: next,
        oauthResult: oauthParams.get("oauth"),
      }));
      router.replace(`/auth/login?next=${encodeURIComponent(next)}`);
      return;
    }

    persistBrowserAccessToken(token);
    logAuthGate("token_restored", buildAuthGateDiagnostic({
      stage: "token_restored",
      hasAccessToken: true,
      hasCookie: /(?:^| )workdrive_access_token=/.test(cookie),
    }));

    // Keep cookie in sync with localStorage so a new tab always inherits the session.
    try { persistBrowserAccessToken(token); } catch { /* noop */ }
    // Optimistic ready: as soon as we have a stored token, render the workspace.
    // /auth/me still validates in the background; only 401 clears the session.
    // Previously we waited for a cached workdrive_user blob, which left a long
    // blank screen on first login after token restore / hard refresh.
    setReady(true);

    const validate = (attempt: number) => {
      // Prefer /bootstrap (user + root + favorites + quota + teams + policy in one RTT).
      // Fall back to /auth/me when bootstrap is unavailable.
      const loadUser = () =>
        getWorkspaceBootstrap()
          .then((boot) => boot.user)
          .catch(() => me(token));

      loadUser()
        .then((user) => {
          if (cancelled) return;
          localStorage.setItem("workdrive_user", JSON.stringify(user));
          try { persistBrowserAccessToken(token); } catch { /* noop */ }
          logAuthGate("auth_state_restored", buildAuthGateDiagnostic({
            stage: "auth_state_restored",
            hasAccessToken: true,
            hasCookie: /(?:^| )workdrive_access_token=/.test(cookie),
            authMeStatus: 200,
          }));
          setReady(true);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          const status = error instanceof SessionCheckError ? error.status : 0;
          logAuthGate("auth_me_failed", buildAuthGateDiagnostic({
            stage: "auth_me_failed",
            hasAccessToken: true,
            hasCookie: /(?:^| )workdrive_access_token=/.test(cookie),
            authMeStatus: status,
          }));

          if (!shouldEndImkanSession(status)) {
            if (shouldRetryAuthCheck(status, attempt)) {
              window.setTimeout(() => validate(attempt + 1), authCheckRetryDelayMs(attempt));
              return;
            }
            setReady(true);
            return;
          }

          // Access token expired/invalid — try silent refresh before forcing login.
          void refreshSession().then((refreshed) => {
            if (cancelled) return;
            if (refreshed?.access_token) {
              logAuthGate("auth_refreshed", buildAuthGateDiagnostic({
                stage: "auth_refreshed",
                hasAccessToken: true,
                hasCookie: true,
                authMeStatus: 200,
              }));
              setReady(true);
              return;
            }
            logAuthGate("auth_state_cleared", buildAuthGateDiagnostic({
              stage: "auth_state_cleared",
              hasAccessToken: false,
              hasCookie: false,
              authMeStatus: status,
            }));
            clearSession();
            const next = buildAuthLoginNextPath(pathname, window.location.search);
            router.replace(`/auth/login?next=${encodeURIComponent(next)}`);
          });
        });
    };

    validate(0);
    };
    if (resumeCode) {
      void redeemOAuthResume(resumeCode).then((result) => {
        try { saveSession(result); } catch { persistBrowserAccessToken(result.access_token); }
        finish(result.access_token);
      }).catch(() => finish(storedToken));
    } else finish(storedToken);
    return () => {
      cancelled = true;
    };
  // Session check runs once on mount. Re-running on every pathname change caused
  // brief ready=false flashes and could clear the session on a single flaky /auth/me.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return (
      <div className="auth-page">
        <section className="auth-card auth-loading">
          <div className="auth-logo">I</div>
          <p>Loading workspace…</p>
        </section>
      </div>
    );
  }
  return <>{children}</>;
}
