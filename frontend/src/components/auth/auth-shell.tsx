"use client";

import type { ReactNode } from "react";
import { useLocale } from "../locale-provider";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { locale } = useLocale();
  return (
    <main className="wd-auth-page" dir={locale === "ar" ? "rtl" : "ltr"}>
      <section className="wd-auth-card">
        <div className="wd-auth-brand">
          <span className="wd-auth-mark" aria-hidden>I</span>
          <span>IMKAN WorkDrive</span>
        </div>
        <h1>{title}</h1>
        {subtitle ? <p className="wd-auth-sub">{subtitle}</p> : null}
        {children}
        {footer ? <div className="wd-auth-footer">{footer}</div> : null}
      </section>
    </main>
  );
}
