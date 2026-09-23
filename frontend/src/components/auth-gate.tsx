"use client";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, me, SessionCheckError } from "../lib/api/auth";
import { IMKAN_ACCESS_TOKEN_KEY, readBrowserAccessToken, shouldEndImkanSession } from "./auth-gate-logic";

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = readBrowserAccessToken(localStorage, document.cookie);
    if (!token) {
      router.replace(`/auth/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!localStorage.getItem(IMKAN_ACCESS_TOKEN_KEY)) {
      localStorage.setItem(IMKAN_ACCESS_TOKEN_KEY, token);
    }
    me(token)
      .then((user) => {
        if (cancelled) return;
        localStorage.setItem("workdrive_user", JSON.stringify(user));
        setReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const status = error instanceof SessionCheckError ? error.status : 0;
        if (!shouldEndImkanSession(status)) {
          setReady(true);
          return;
        }
        clearSession();
        router.replace("/auth/login");
      });
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
