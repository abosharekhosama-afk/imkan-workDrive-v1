import type { Metadata } from "next";
import { directionFor, isLocale, type Locale } from "../i18n";
import { LocaleProvider } from "../components/locale-provider";
import { DevAuthToolbar } from "../components/dev-auth-toolbar";
import { WorkdriveContent, WorkdriveLocaleAnnouncer } from "../components/workdrive-content";
import "./globals.css";
export const metadata: Metadata = { title: "IMKAN WorkDrive", description: "IMKAN WorkDrive" };
function localeFromEnv(): Locale { const value = process.env.NEXT_PUBLIC_DEFAULT_LOCALE; return isLocale(value) ? value : "en"; }

/**
 * Pre-paint locale restore: applies the persisted user locale to <html
 * lang/dir> before the first paint so a refresh never flashes the wrong
 * direction. LocaleProvider then hydrates the message catalog with the same
 * value (hydration-safe — the server still renders the env default).
 */
const localeBootstrapScript = `(function(){try{var l=localStorage.getItem("workdrive_locale");if(l==="en"||l==="ar"){document.documentElement.lang=l;document.documentElement.dir=l==="ar"?"rtl":"ltr";}}catch(e){}})();`;

export default function RootLayout({children}:{children:React.ReactNode}) { const locale=localeFromEnv(); return <html lang={locale} dir={directionFor(locale)} className="h-full antialiased"><body className="min-h-full bg-background text-foreground font-sans"><script dangerouslySetInnerHTML={{ __html: localeBootstrapScript }} /><LocaleProvider initialLocale={locale}><div className="min-h-screen bg-background text-foreground">{process.env.NODE_ENV !== "production" ? <DevAuthToolbar/> : null}<WorkdriveContent>{children}</WorkdriveContent><WorkdriveLocaleAnnouncer/></div></LocaleProvider></body></html> }
