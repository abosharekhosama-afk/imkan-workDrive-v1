"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "../../../components/auth/auth-shell";
import { useLocale } from "../../../components/locale-provider";
import { persistBrowserAccessToken } from "../../../components/auth-gate-logic";
import { saveSession } from "../../../lib/api/auth";

export default function AuthCallback() {
  const router = useRouter();
  const { label } = useLocale();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const refreshToken = params.get("refresh_token");
    if (token) {
      try {
        saveSession({
          access_token: token,
          refresh_token: refreshToken || undefined,
          user: { id: "", name: null, email: "", org_id: "", role: "" },
        });
      } catch {
        persistBrowserAccessToken(token);
      }
      // Prefer a soft navigation; /auth/me will fill user profile.
      router.replace("/files");
      return;
    }
    router.replace("/auth/login");
  }, [router]);
  return (
    <AuthShell title={label("auth.completing")}>
      <p className="wd-auth-sub">{label("auth.completing")}</p>
    </AuthShell>
  );
}
