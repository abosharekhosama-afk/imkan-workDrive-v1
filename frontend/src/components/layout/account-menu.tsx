"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "../locale-provider";
import { useAppearance, type Appearance } from "../appearance-provider";
import { getAppearancePreferences } from "../../lib/api/auth";
import { clearSession, logout as apiLogout } from "../../lib/api/auth";
import { Icons } from "./icons";

type AccountInfo = { id: string; name: string | null; email: string; avatarUrl?: string | null; role: string };

type Props = { name: string; avatarUrl?: string | null; adminMode?: boolean };

function roleLabel(role: string, ar: boolean) {
  if (role === "SUPER_ADMIN") return ar ? "مسؤول عام" : "Super Admin";
  if (role === "ADMIN") return ar ? "مسؤول" : "Admin";
  return ar ? "عضو" : "Member";
}
const fontPreviewStacks: Record<Appearance["fontFamily"], string> = {
  "Zoho Puvi": '"Zoho Puvi", Arial, "IBM Plex Sans Arabic", sans-serif',
  Lato: 'Lato, "IBM Plex Sans Arabic", Arial, sans-serif',
  Roboto: 'Roboto, "IBM Plex Sans Arabic", Arial, sans-serif',
  "PT Sans": '"PT Sans", "IBM Plex Sans Arabic", Arial, sans-serif',
  Arial: 'Arial, "IBM Plex Sans Arabic", sans-serif',
};

function initials(name: string, email: string) {
  const source = (name || email.split("@")[0] || "U").trim();
  return source.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

export function AccountMenu({ name, avatarUrl, adminMode = false }: Props) {
  const { label, locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const { themeMode, themeColor, fontFamily, lighterSidebar, setAppearance } = useAppearance();
  const [open, setOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    getAppearancePreferences().then((u) => {
      if (!live) return;
      setAccount({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl, role: u.role });
    }).catch(() => undefined);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setAppearanceOpen(false); } };
    document.addEventListener("keydown", onKey);
    return () => { live = false; document.removeEventListener("keydown", onKey); };
  }, [open]);

  async function update(patch: Partial<Appearance>) {
    setError("");
    try { await setAppearance(patch); }
    catch { setError(ar ? "تعذر حفظ التخصيص. حاول مرة أخرى." : "Unable to save the appearance preference."); }
  }
  async function out() {
    const token = localStorage.getItem("workdrive_access_token");
    try { if (token) await apiLogout(token); } catch { /* noop */ }
    finally { clearSession(); setOpen(false); router.replace("/auth/login"); }
  }

  const current: AccountInfo = account ?? { id: "", name: name || null, email: "", avatarUrl: avatarUrl ?? null, role: "MEMBER" };
  const displayName = current.name || name || current.email.split("@")[0] || "User";

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => { setOpen((v) => !v); setAppearanceOpen(false); }} aria-expanded={open} aria-haspopup="dialog" aria-label={displayName}
        className="zoho-avatar overflow-hidden">
        {current.avatarUrl ? <img src={current.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(displayName, current.email || name)}
      </button>
      {open ? (
        <>
          <div className="account-drawer" dir={ar ? "rtl" : "ltr"} role="dialog" aria-label={ar ? "حسابي" : "My account"}>
            {!appearanceOpen ? (
              <>
                <div className="account-drawer-head"><button type="button" className="account-drawer-close" onClick={() => setOpen(false)} aria-label={ar ? "إغلاق" : "Close"}>×</button></div>
                <div className="account-drawer-scroll">
                  <div className="account-profile">
                    <div className="account-profile-avatar">{current.avatarUrl ? <img src={current.avatarUrl} alt="" /> : initials(displayName, current.email || name)}</div>
                    <div className="account-profile-name">{displayName}</div>
                    <span className="account-profile-badge">{roleLabel(current.role, ar)}</span>
                    {current.email ? <div className="account-profile-line">{current.email}<button type="button" onClick={() => void navigator.clipboard?.writeText(current.email)} aria-label={ar ? "نسخ البريد" : "Copy email"}>▣</button></div> : null}
                    {current.id ? <div className="account-profile-line">{ar ? "معرف المستخدم:" : "User ID:"} {current.id}<button type="button" onClick={() => void navigator.clipboard?.writeText(current.id)} aria-label={ar ? "نسخ المعرف" : "Copy ID"}>▣</button></div> : null}
                    <button type="button" className="account-my-account" onClick={() => { setOpen(false); router.push(adminMode ? "/admin/settings?settingtab=profile" : "/settings"); }}>{ar ? "حسابي" : "My Account"}</button>
                  </div>

                  <div className="account-referral"><span className="account-referral-icon">♧</span><span>{ar ? <>ادعُ زملاءك واحصل على 15% من الاشتراك. <b>تعرّف على برنامج الإحالة.</b></> : <>Refer and earn 15% of the subscription. <b>Learn more about Zoho WorkDrive referral program</b></>}</span></div>

                  <section className="account-section">
                    <div className="account-section-title">{ar ? "WorkDrive الخاص بي" : "My WorkDrive"}</div>
                    <div className="account-action-grid">
                      <button type="button" className="account-action" onClick={() => { setOpen(false); router.push(adminMode ? "/admin/settings?settingtab=profile" : "/settings"); }}><span className="account-action-icon">☷</span>{ar ? "تفضيلاتي" : "My Preferences"}</button>
                      <button type="button" className="account-action" onClick={() => setAppearanceOpen(true)}><span className="account-action-icon">◉</span>{ar ? "المظهر" : "Appearance"}</button>
                      <button type="button" className="account-action" onClick={() => { setOpen(false); router.push(adminMode ? "/admin/settings?settingtab=profile" : "/settings?tab=accessibility"); }}><span className="account-action-icon">◉</span>{ar ? "إعدادات إمكانية الوصول" : "Accessibility Controls"}</button>
                    </div>
                  </section>

                  <section className="account-download">
                    <div className="account-section-title">{ar ? "تنزيل التطبيقات" : "Download Apps"}</div>
                    <div className="account-download-grid">
                      <div className="account-download-item"><span aria-hidden="true">▱</span><div>{ar ? "سطح المكتب (Windows)" : "Desktop (Windows)"}</div></div>
                      <div className="account-download-item"><span aria-hidden="true">●</span><div>{ar ? "iPhone/iPad" : "iPhone/iPad"}</div></div>
                      <div className="account-qr" aria-label="QR code" />
                      <div className="account-download-item"><span aria-hidden="true">♙</span><div>{ar ? "Android" : "Android"}</div></div>
                    </div>
                  </section>
                </div>
                <button type="button" className="account-signout" onClick={() => void out()}><span>⇱</span>{ar ? "تسجيل الخروج" : "Sign Out"}</button>
              </>
            ) : (
              <>
                <div className="account-appearance-head"><button type="button" className="account-back" onClick={() => setAppearanceOpen(false)} aria-label={ar ? "رجوع" : "Back"}>‹</button><span>{ar ? "المظهر والثيمات" : "Appearance & Themes"}</span><button type="button" className="account-drawer-close ms-auto" onClick={() => { setOpen(false); setAppearanceOpen(false); }} aria-label={ar ? "إغلاق" : "Close"}>×</button></div>
                <div className="account-drawer-scroll">
                  <div className="appearance-card">
                    <div className="appearance-title">{ar ? "المظهر" : "Appearance"}</div>
                    <div className="appearance-desc">{ar ? "اختر الوضع الذي تريد استخدامه لعرض حسابك في WorkDrive." : "Choose the mode in which you want to view your WorkDrive account."}</div>
                    <div className="appearance-modes">
                      {(["light", "dark", "system"] as const).map((mode) => (
                        <button key={mode} type="button" className={`appearance-mode ${mode} ${themeMode === mode ? "is-active" : ""}`} onClick={() => void update({ themeMode: mode })}>
                          <span className="appearance-preview"><span className="appearance-preview-left"/><span className="appearance-preview-main"/></span>
                          {mode === "light" ? (ar ? "الوضع الفاتح" : "Light Mode") : mode === "dark" ? (ar ? "الوضع الداكن" : "Dark Mode") : (ar ? "افتراضي النظام" : "System Default")}
                        </button>
                      ))}
                    </div>
                    <label className="appearance-check"><input type="checkbox" checked={lighterSidebar} onChange={(e) => void update({ lighterSidebar: e.target.checked })}/>{ar ? "اجعل اللوحة اليسرى أفتح" : "Make the left panel lighter"}</label>
                  </div>

                  <div className="appearance-subcard"><div className="appearance-subtitle">{ar ? "لون الثيم" : "Theme Color"}</div><div className="appearance-desc">{ar ? "اختر لوناً لحساب WorkDrive الخاص بك" : "Choose a color for your WorkDrive account"}</div><div className="appearance-colors">{(["blue","green","red","yellow"] as const).map((c)=><button key={c} type="button" className={`appearance-color ${c} ${themeColor===c?"is-active":""}`} onClick={()=>void update({themeColor:c})} aria-label={c}>{themeColor===c?<span className="text-white">✓</span>:null}</button>)}</div></div>

                  <div className="appearance-subcard"><div className="appearance-subtitle">{ar ? "الخط" : "Font"}</div><div className="appearance-desc">{ar ? "اختر خطاً لحساب WorkDrive الخاص بك" : "Choose a font for your WorkDrive account"}</div><div className="appearance-fonts">{(["Zoho Puvi","Lato","Roboto","PT Sans","Arial"] as const).map((font)=><button key={font} type="button" className={`appearance-font ${fontFamily===font?"is-active":""}`} style={{fontFamily:fontPreviewStacks[font]}} onClick={()=>void update({fontFamily:font})}>{font}</button>)}</div><div className="mt-4 rounded-lg bg-slate-50 p-4 text-[22px] font-semibold text-slate-800" style={{fontFamily:fontPreviewStacks[fontFamily]}}>Hello.</div></div>
                  {error ? <div className="px-4 pb-5 text-[12px] text-red-600">{error}</div> : null}
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
