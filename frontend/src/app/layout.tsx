import type { Metadata } from "next";
import { directionFor, isLocale, type Locale } from "../i18n";
import { LocaleProvider } from "../components/locale-provider";
import { DevAuthToolbar } from "../components/dev-auth-toolbar";
import { WorkdriveContent, WorkdriveLocaleAnnouncer } from "../components/workdrive-content";
import "./globals.css";
export const metadata: Metadata = { title: "IMKAN WorkDrive", description: "IMKAN WorkDrive" };
function localeFromEnv(): Locale { const value = process.env.NEXT_PUBLIC_DEFAULT_LOCALE; return isLocale(value) ? value : "en"; }
export default function RootLayout({children}:{children:React.ReactNode}) { const locale=localeFromEnv(); return <html lang={locale} dir={directionFor(locale)} className="h-full antialiased"><body className="min-h-full bg-background text-foreground font-sans"><LocaleProvider initialLocale={locale}><div className="min-h-screen bg-background text-foreground">{process.env.NODE_ENV !== "production" ? <DevAuthToolbar/> : null}<WorkdriveContent>{children}</WorkdriveContent><WorkdriveLocaleAnnouncer/></div></LocaleProvider></body></html> }
