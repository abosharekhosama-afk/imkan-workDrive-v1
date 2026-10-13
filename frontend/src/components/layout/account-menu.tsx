"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "../locale-provider";
import { useAppearance, type Appearance } from "../appearance-provider";
import { getAppearancePreferences } from "../../lib/api/auth";
import { clearSession, logout as apiLogout } from "../../lib/api/auth";
import { AccountAvatar, rememberAccountProfile } from "../account-avatar";
import { updateProfile } from "../../lib/api/settings";
import { PreferencesModal } from "./preferences-modal";
import { KeyboardShortcutsModal } from "./keyboard-shortcuts-modal";
import { AccessibilityControlsModal } from "./accessibility-controls-modal";
import { TeamDetailsModal } from "./team-details-modal";

type AccountInfo = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl?: string | null;
  role: string;
  organizationName?: string | null;
  joinedAt?: string | null;
  lastLoginAt?: string | null;
};

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
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const { themeMode, themeColor, fontFamily, lighterSidebar, setAppearance } = useAppearance();
  const [open, setOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);
  const [a11yOpen, setA11yOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    getAppearancePreferences().then((u) => {
      if (!live) return;
      setAccount({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl, role: u.role, organizationName: u.organizationName, joinedAt: u.joinedAt, lastLoginAt: u.lastLoginAt });
      rememberAccountProfile({ name: u.name, email: u.email, avatarUrl: u.avatarUrl, role: u.role, organizationName: u.organizationName });
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
  async function changePhoto(next: string | null) {
    const saved = await updateProfile({ avatarUrl: next });
    setAccount((currentAccount) => ({ ...(currentAccount ?? { id: "", name: name || null, email: "", role: "MEMBER" }), avatarUrl: saved.avatarUrl ?? null, name: saved.name }));
    rememberAccountProfile({ name: saved.name, avatarUrl: saved.avatarUrl ?? null });
  }

  const current: AccountInfo = account ?? { id: "", name: name || null, email: "", avatarUrl: avatarUrl ?? null, role: "MEMBER" };
  const displayName = current.name || name || current.email.split("@")[0] || "User";
  const teamName = current.organizationName || "IMKAN";

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => { setOpen((v) => !v); setAppearanceOpen(false); }} aria-expanded={open} aria-haspopup="dialog" aria-label={displayName} className="zoho-avatar overflow-hidden">
        {current.avatarUrl ? <img src={current.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(displayName, current.email || name)}
      </button>

      {open ? (
        <>
          <div className="account-drawer-backdrop" onClick={() => { setOpen(false); setAppearanceOpen(false); }} />
          <div className="account-drawer" dir={ar ? "rtl" : "ltr"} data-admin={adminMode || undefined} role="dialog" aria-label={ar ? "حسابي" : "My account"}>
            {!appearanceOpen ? (
              <>
                <div className="account-drawer-head">
                  <button type="button" className="account-drawer-close" onClick={() => setOpen(false)} aria-label={ar ? "إغلاق" : "Close"}>×</button>
                </div>
                <div className="account-drawer-scroll">
                  <div className="account-profile">
                    <AccountAvatar name={displayName} email={current.email || name} avatarUrl={current.avatarUrl} editable changeLabel={ar ? "تغيير الصورة" : "Change photo"} removeLabel={ar ? "إزالة الصورة" : "Remove photo"} onChange={changePhoto} />
                    <div className="account-profile-name">{displayName}</div>
                    <span className="account-profile-badge">{roleLabel(current.role, ar)}</span>
                    {current.email ? <div className="account-profile-line">{current.email}<button type="button" onClick={() => void navigator.clipboard?.writeText(current.email)} aria-label={ar ? "نسخ البريد" : "Copy email"}>▣</button></div> : null}
                    {current.id ? <div className="account-profile-line">{ar ? "معرف المستخدم:" : "User ID:"} {current.id}<button type="button" onClick={() => void navigator.clipboard?.writeText(current.id)} aria-label={ar ? "نسخ المعرف" : "Copy ID"}>▣</button></div> : null}
                    <button type="button" className="account-my-account" onClick={() => { setOpen(false); router.push("/settings"); }}>{ar ? "حسابي" : "My Account"}</button>
                  </div>

                  <div className="account-referral">
                    <span className="account-referral-icon">🎁</span>
                    <div>{ar ? "أحِل واربح 15% من الاشتراك" : "Refer and earn 15% of the subscription"} <a href="https://www.zoho.com/workdrive/referral/" target="_blank" rel="noreferrer">{ar ? "معرفة المزيد" : "Learn more about Zoho WorkDrive referral program"}</a></div>
                  </div>

                  <section className="account-section">
                    <div className="account-section-title">{ar ? "WorkDrive الخاص بي" : "My WorkDrive"}</div>
                    <div className="account-action-grid">
                      <button type="button" className="account-action" onClick={() => { setOpen(false); setPrefsOpen(true); }}><span className="account-action-icon">⚙</span>{ar ? "تفضيلاتي" : "My Preferences"}</button>
                      <button type="button" className="account-action" onClick={() => { setOpen(false); setKbOpen(true); }}><span className="account-action-icon">⌨</span>{ar ? "اختصارات لوحة المفاتيح" : "Keyboard shortcuts"}</button>
                      <button type="button" className="account-action" onClick={() => setAppearanceOpen(true)}><span className="account-action-icon">🎨</span>{ar ? "المظهر" : "Appearance"}</button>
                      <button type="button" className="account-action" onClick={() => { setOpen(false); setA11yOpen(true); }}><span className="account-action-icon">♿</span>{ar ? "إعدادات إمكانية الوصول" : "Accessibility Controls"}</button>
                    </div>
                  </section>

                  <section className="account-section">
                    <div className="account-section-title">{ar ? `فريقي (${teamName})` : `My Team (${teamName})`}</div>
                    <div className="account-action-grid">
                      <button type="button" className="account-action" onClick={() => { setOpen(false); router.push("/admin"); }}><span className="account-action-icon">🛠</span>{ar ? "وحدة تحكم المسؤول" : "Admin Console"}</button>
                      <button type="button" className="account-action" onClick={() => { setOpen(false); router.push("/admin/members"); }}><span className="account-action-icon">👤+</span>{ar ? "دعوة أعضاء جدد" : "Invite new members"}</button>
                      <button type="button" className="account-action" onClick={() => { setOpen(false); setTeamOpen(true); }}><span className="account-action-icon">ℹ</span>{ar ? "تفاصيل الفريق" : "Team Details"}</button>
                    </div>
                  </section>

                  <section className="account-section">
                    <div className="account-section-title">{ar ? "الاشتراك" : "Subscription"}</div>
                    <p className="account-sub-text">{ar ? "أنت حالياً على تجربة Zoho One." : "You're currently on the Zoho One Trial."}</p>
                    <p className="account-sub-text">{ar ? "المسؤول العام:" : "Super Admin:"} {current.email || "—"}</p>
                    <button type="button" className="account-upgrade-btn" onClick={() => window.open("https://www.zoho.com/workdrive/pricing.html", "_blank")}>{ar ? "ترقية" : "Upgrade"}</button>
                  </section>

                  <section className="account-section">
                    <div className="account-section-title">{ar ? "الموارد" : "Resources"}</div>
                    <div className="account-action-grid">
                      <a className="account-action" href="https://help.zoho.com/portal/en/kb/workdrive" target="_blank" rel="noreferrer"><span className="account-action-icon">❓</span>{ar ? "مركز المساعدة" : "Help Center"}</a>
                      <a className="account-action" href="https://www.zoho.com/workdrive/whats-new.html" target="_blank" rel="noreferrer"><span className="account-action-icon">🎁</span>{ar ? "ما الجديد" : "What's New"}</a>
                      <button type="button" className="account-action"><span className="account-action-icon">▶</span>{ar ? "جولة سريعة" : "Take a Quick Tour"}</button>
                      <a className="account-action" href="https://help.zoho.com/portal/en/community/workdrive" target="_blank" rel="noreferrer"><span className="account-action-icon">💬</span>{ar ? "المجتمع" : "Community"}</a>
                      <a className="account-action" href="https://www.zoho.com/workdrive/videos.html" target="_blank" rel="noreferrer"><span className="account-action-icon">🎬</span>{ar ? "فيديوهات تعليمية" : "How-to Videos"}</a>
                      <a className="account-action" href="https://www.zoho.com/workdrive/developer/" target="_blank" rel="noreferrer"><span className="account-action-icon">{"</>"}</span>{ar ? "واجهة المطور" : "Developer API"}</a>
                    </div>
                  </section>

                  <section className="account-section">
                    <div className="account-section-title">{ar ? "تحتاج مساعدة؟" : "Need help?"}</div>
                    <div className="account-action-grid">
                      <a className="account-action" href="https://www.zoho.com/workdrive/webinar.html" target="_blank" rel="noreferrer"><span className="account-action-icon">📡</span>{ar ? "حضور ندوة مباشرة" : "Attend a Live Webinar"}</a>
                      <a className="account-action" href="https://www.zoho.com/contactus.html" target="_blank" rel="noreferrer"><span className="account-action-icon">📞</span>{ar ? "اتصل بالدعم" : "Contact Support"}</a>
                      <a className="account-action" href="https://www.zoho.com/workdrive/demo.html" target="_blank" rel="noreferrer"><span className="account-action-icon">📅</span>{ar ? "حجز عرض توضيحي" : "Book a Demo"}</a>
                      <button type="button" className="account-action"><span className="account-action-icon">📎</span>{ar ? "مشاركة التسجيل" : "Share recording"}</button>
                    </div>
                  </section>

                  <section className="account-section">
                    <div className="account-section-title">{ar ? "الإضافات" : "Add-ons"}</div>
                    <div className="account-action-grid">
                      <a className="account-action" href="https://www.zoho.com/writer/" target="_blank" rel="noreferrer"><span className="account-action-icon">📄</span> Writer</a>
                      <a className="account-action" href="#"><span className="account-action-icon">📧</span> Gmail</a>
                      <a className="account-action" href="#"><span className="account-action-icon">📊</span> Microsoft Office</a>
                      <a className="account-action" href="#"><span className="account-action-icon">📩</span> Microsoft Outlook</a>
                      <a className="account-action" href="https://zapier.com/apps/zoho-workdrive/integrations" target="_blank" rel="noreferrer"><span className="account-action-icon">⚡</span> Zapier Integration</a>
                    </div>
                  </section>

                  <div className="account-download">
                    <div className="account-section-title">{ar ? "تحميل التطبيقات" : "Download Apps"}</div>
                    <div className="account-download-grid">
                      <div className="account-download-item"><span style={{fontSize:28}}>💻</span>Desktop (Linux)</div>
                      <div className="account-download-item"><span style={{fontSize:28}}>📱</span>iPhone/iPad</div>
                      <div className="account-download-item"><span style={{fontSize:28}}>🤖</span>Android</div>
                      <div className="account-qr" title="QR Code" />
                    </div>
                  </div>
                </div>
                <button type="button" className="account-signout" onClick={() => void out()}><span>⇱</span>{ar ? "تسجيل الخروج" : "Sign Out"}</button>
              </>
            ) : (
              <>
                <div className="account-appearance-head">
                  <button type="button" className="account-back" onClick={() => setAppearanceOpen(false)} aria-label={ar ? "رجوع" : "Back"}>‹</button>
                  <span>{ar ? "المظهر والثيمات" : "Appearance & Themes"}</span>
                  <button type="button" className="account-drawer-close ms-auto" onClick={() => { setOpen(false); setAppearanceOpen(false); }} aria-label={ar ? "إغلاق" : "Close"}>×</button>
                </div>
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

      <PreferencesModal open={prefsOpen} onClose={() => setPrefsOpen(false)} />
      <KeyboardShortcutsModal open={kbOpen} onClose={() => setKbOpen(false)} />
      <AccessibilityControlsModal open={a11yOpen} onClose={() => setA11yOpen(false)} />
      <TeamDetailsModal open={teamOpen} onClose={() => setTeamOpen(false)} teamName={teamName} />
    </div>
  );
}
