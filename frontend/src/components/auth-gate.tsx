"use client";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, me, SessionCheckError } from "../lib/api/auth";
import {
  authCheckRetryDelayMs,
  buildAuthGateDiagnostic,
  buildAuthLoginNextPath,
  persistBrowserAccessToken,
  readBrowserAccessToken,
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
    const token = readBrowserAccessToken(localStorage, cookie);
    const oauthParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();

    logAuthGate("initialization", buildAuthGateDiagnostic({
      stage: "initialization",
      hasAccessToken: Boolean(token),
      hasCookie: /(?:^| )workdrive_access_token=/.test(cookie),
      oauthResult: oauthParams.get("oauth"),
      provider: oauthParams.get("provider"),
      connectionId: oauthParams.get("connectionId"),
    }));

    if (!token) {
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

    const validate = (attempt: number) => {
      me(token)
        .then((user) => {
          if (cancelled) return;
          localStorage.setItem("workdrive_user", JSON.stringify(user));
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
    };

    validate(0);
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

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
