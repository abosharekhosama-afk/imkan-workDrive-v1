"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary for folder browsing. Catches anything the
 * session-expiry guard does not intercept (network failures, 5xx, render
 * errors) and offers a retry instead of a dead white page.
 */
export default function FolderError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for diagnostics while the user sees the friendly fallback.
    console.error("[folder-page]", error);
  }, [error]);

  return (
    <div className="wd-card" role="alert">
      <div className="wd-empty">
        <span className="wd-empty-icon" aria-hidden="true">⚠</span>
        <h2>Something went wrong</h2>
        <p>This folder could not be loaded. Your session may have expired — try signing in again.</p>
        <div className="wd-page-head-actions" style={{ justifyContent: "center" }}>
          <button type="button" className="wd-btn wd-btn-primary" onClick={reset}>
            Try again
          </button>
          <a className="wd-btn wd-btn-ghost" href="/auth/login?expired=true">
            Sign in
          </a>
        </div>
      </div>
    </div>
  );
}
