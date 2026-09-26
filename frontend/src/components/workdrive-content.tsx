"use client";
import type { ReactNode } from "react";
import { useLocale } from "./locale-provider";
import { usePathname } from "next/navigation";
import { ZohoWorkdriveLayout } from "./layout/zoho-workdrive-layout";
import { GlobalPreviewHost } from "./global-preview-host";
export function WorkdriveContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdminConsole = pathname === "/admin" || pathname.startsWith("/admin/");
  if (isAdminConsole) return <>{children}</>;
  return (
    <ZohoWorkdriveLayout>
      {children}
      <GlobalPreviewHost />
    </ZohoWorkdriveLayout>
  );
}
export function WorkdriveLocaleAnnouncer() {
  const { locale } = useLocale();
  return <span className="sr-only">{locale}</span>;
}
