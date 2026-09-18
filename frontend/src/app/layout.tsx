import type { Metadata } from "next";
import { directionFor, isLocale, type Locale } from "../i18n";
import { LocaleProvider } from "../components/locale-provider";
import { AppearanceProvider } from "../components/appearance-provider";
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
const appearanceBootstrapScript = `(function(){try{var raw=localStorage.getItem("workdrive_appearance");if(!raw)return;var a=JSON.parse(raw)||{};var r=document.documentElement;var dark=a.themeMode==="dark"||(a.themeMode==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);r.dataset.theme=dark?"dark":"light";r.dataset.themeMode=a.themeMode||"light";r.dataset.themeColor=a.themeColor||"blue";r.dataset.fontFamily=a.fontFamily||"Zoho Puvi";r.dataset.sidebarLight=a.lighterSidebar?"true":"false";var c={blue:["#2C66DD","#184091","#254993","#EFF6FF"],green:["#16A085","#087F69","#08735F","#EAF9F5"],red:["#EF3340","#C41F2A","#A61B24","#FFF0F1"],yellow:["#F5B301","#C68A00","#946700","#FFF8DE"]}[a.themeColor]||["#2C66DD","#184091","#254993","#EFF6FF"];r.style.setProperty("--user-accent-primary",c[0]);r.style.setProperty("--user-accent-dark",c[1]);r.style.setProperty("--user-accent-ink",c[2]);r.style.setProperty("--user-accent-light",c[3]);r.style.setProperty("--user-font-family",JSON.stringify(a.fontFamily||"Zoho Puvi"));}catch(e){}})();`;

export default function RootLayout({children}:{children:React.ReactNode}) { const locale=localeFromEnv(); return <html lang={locale} dir={directionFor(locale)} className="h-full antialiased"><body className="min-h-full bg-background text-foreground font-sans"><script dangerouslySetInnerHTML={{ __html: localeBootstrapScript }} /><script dangerouslySetInnerHTML={{ __html: appearanceBootstrapScript }} /><LocaleProvider initialLocale={locale}><AppearanceProvider><div className="min-h-screen bg-background text-foreground">{process.env.NODE_ENV !== "production" ? <DevAuthToolbar/> : null}<WorkdriveContent>{children}</WorkdriveContent><WorkdriveLocaleAnnouncer/></div></AppearanceProvider></LocaleProvider></body></html> }
