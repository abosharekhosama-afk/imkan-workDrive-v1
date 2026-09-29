"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "../../../components/auth/auth-shell";
import { useLocale } from "../../../components/locale-provider";
import { persistBrowserAccessToken } from "../../../components/auth-gate-logic";

export default function AuthCallback() {
  const router = useRouter();
  const { label } = useLocale();
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) {
      persistBrowserAccessToken(token);
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
