"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { Icons } from "@/components/layout/icons";
import { me } from "@/lib/api/auth";
import { getToken } from "@/lib/api/jwt";
import { getOrganization, updateOrganization } from "@/lib/api/organization";
import {
  getAdminConsoleSettings,
  updateAdminConsoleSettings,
  getSecurityPolicy,
  updateSecurityPolicy,
  getRetentionPolicy,
  updateRetentionPolicy,
  type AdminConsoleSettings,
} from "@/lib/api/enterprise";

const TABS = [
  ["profile", "Profile", "الملف الشخصي", "users"],
  ["branding", "Branding", "الهوية والعلامة", "spark"],
  ["custom-domain", "Custom Domain", "النطاق المخصص", "globe"],
  ["viewpreferences", "View Preferences", "تفضيلات العرض", "compact"],
  ["content", "Content", "المحتوى", "doc"],
  ["sharing", "Sharing", "المشاركة", "share"],
  ["storage", "Storage", "التخزين", "cloudUp"],
  ["dataretention", "Data Retention", "الاحتفاظ بالبيانات", "trash"],
  ["roles", "Roles and Permissions", "الأدوار والصلاحيات", "gear"],
  ["workdrive-apps", "WorkDrive Apps", "تطبيقات WorkDrive", "grid"],
  ["workflows", "Workflows", "سير العمل", "flow"],
  ["zia", "Zia", "Zia", "bot"],
  ["file-suggestions", "File Suggestions", "اقتراحات الملفات", "spark"],
] as const;
type TabKey = typeof TABS[number][0];

function text(ar: boolean, en: string, arText: string) { return ar ? arText : en; }
function sectionFor(tab: TabKey) {
  if (["profile", "branding", "custom-domain", "viewpreferences"].includes(tab)) return "Identity & Appearance";
  if (["content", "sharing", "storage", "dataretention"].includes(tab)) return "Files & Sharing";
  if (["roles", "workdrive-apps"].includes(tab)) return "Access & Apps";
  return "Automation & AI";
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={() => onChange(!checked)} aria-pressed={checked} className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-[#2f6ee5]" : "bg-[#d7d9dc]"} ${disabled ? "opacity-50" : ""}`}><span className={`absolute top-[3px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition ${checked ? "end-[3px]" : "start-[3px]"}`} /></button>;
}

function SettingCard({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[16px] border border-[#e8e8e8] bg-white shadow-[0_1px_2px_rgba(0,0,0,.03)] ${className}`}>{title ? <div className="px-6 pb-2 pt-5"><h2 className="text-[15px] font-semibold text-[#202124]">{title}</h2></div> : null}{children}</section>;
}

function Choice({ checked, label, description, onClick }: { checked: boolean; label: string; description?: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex w-full items-start gap-3 rounded-[12px] border p-3 text-start transition ${checked ? "border-[#6c9bf2] bg-[#f7faff]" : "border-transparent hover:bg-[#fafafa]"}`}><span className={`mt-[2px] grid h-4 w-4 place-items-center rounded-full border ${checked ? "border-[#2f6ee5]" : "border-[#b8bcc3]"}`}><span className={`h-2 w-2 rounded-full ${checked ? "bg-[#2f6ee5]" : "bg-transparent"}`} /></span><span><span className="block text-[13px] font-medium text-[#202124]">{label}</span>{description ? <span className="mt-1 block text-[11px] leading-5 text-[#6b6f76]">{description}</span> : null}</span></button>;
}

function SwitchRow({ title, description, checked, onChange }: { title: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <div className="flex items-start justify-between gap-6 py-4"><div className="min-w-0"><div className="text-[13px] font-medium text-[#202124]">{title}</div>{description ? <div className="mt-1 max-w-[760px] text-[11px] leading-5 text-[#6b6f76]">{description}</div> : null}</div><Toggle checked={checked} onChange={onChange} /></div>;
}

export default function AdminSettingsPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("settingtab") || "profile";
  const tab = (TABS.some((x) => x[0] === requested) ? requested : "profile") as TabKey;
  const [settings, setSettings] = useState<AdminConsoleSettings | null>(null);
  const [policy, setPolicy] = useState<any>(null);
  const [retention, setRetention] = useState<any>(null);
  const [org, setOrg] = useState<any>(null);
  const [profileName, setProfileName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const logoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const token = getToken();
      const [s, p, r, o, u] = await Promise.all([getAdminConsoleSettings(), getSecurityPolicy(), getRetentionPolicy(), getOrganization(), token ? me(token) : Promise.reject(new Error("Missing token"))]);
      if (!live) return;
      setSettings(s); setPolicy(p); setRetention(r); setOrg(o); setProfileName(o.name); setOwnerEmail(u.email);
    })().catch(() => { if (live) setError(text(ar, "Unable to load organization settings.", "تعذر تحميل إعدادات المؤسسة.")); });
    return () => { live = false; };
  }, [ar]);

  const update = async (patch: Partial<AdminConsoleSettings>) => {
    setSaving(true); setError(""); setMessage("");
    try { const next = await updateAdminConsoleSettings(patch); setSettings(next); setMessage(text(ar, "Settings saved successfully.", "تم حفظ الإعدادات بنجاح.")); }
    catch (e) { setError(e instanceof Error ? e.message : text(ar, "Unable to save settings.", "تعذر حفظ الإعدادات.")); }
    finally { setSaving(false); }
  };
  const updatePolicy = async (patch: any) => {
    setSaving(true); setError(""); setMessage("");
    try { const next = await updateSecurityPolicy(patch); setPolicy(next); setMessage(text(ar, "Sharing policy saved.", "تم حفظ سياسة المشاركة.")); }
    catch (e) { setError(e instanceof Error ? e.message : text(ar, "Unable to save policy.", "تعذر حفظ السياسة.")); }
    finally { setSaving(false); }
  };
  const updateRetention = async (patch: any) => {
    setSaving(true); setError(""); setMessage("");
    try { const next = await updateRetentionPolicy(patch); setRetention(next); setMessage(text(ar, "Retention settings saved.", "تم حفظ إعدادات الاحتفاظ.")); }
    catch (e) { setError(e instanceof Error ? e.message : text(ar, "Unable to save retention.", "تعذر حفظ إعدادات الاحتفاظ.")); }
    finally { setSaving(false); }
  };
  const saveProfile = async () => {
    setSaving(true); setError(""); setMessage("");
    try { const next = await updateOrganization(profileName.trim()); setOrg(next); setMessage(text(ar, "Team details saved.", "تم حفظ بيانات الفريق.")); }
    catch (e) { setError(e instanceof Error ? e.message : text(ar, "Unable to save team details.", "تعذر حفظ بيانات الفريق.")); }
    finally { setSaving(false); }
  };
  const navigate = (key: TabKey) => { router.push(`/admin/settings?settingtab=${key}`); };

  if (!settings || !policy || !retention || !org) return <div className="flex h-full items-center justify-center bg-[#f7f7f7] text-[13px] text-[#6b6f76]">{text(ar, "Loading settings…", "جارٍ تحميل الإعدادات…")}</div>;

  return <div className="flex h-full min-h-0 bg-[#f7f7f7]" dir={ar ? "rtl" : "ltr"}>
    <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-e border-[#e7e7e7] bg-white px-4 py-5 lg:block">
      <div className="px-2 pb-3 text-[12px] font-semibold text-[#202124]">{text(ar, "Settings", "الإعدادات")}</div>
      {[["Identity & Appearance", ["profile", "branding", "custom-domain", "viewpreferences"]], ["Files & Sharing", ["content", "sharing", "storage", "dataretention"]], ["Access & Apps", ["roles", "workdrive-apps"]], ["Automation & AI", ["workflows", "zia", "file-suggestions"]]].map(([section, keys]) => <div key={section as string} className="mb-5"><div className="px-3 pb-2 text-[10px] font-semibold text-[#8b8f95]">{text(ar, section as string, section === "Identity & Appearance" ? "الهوية والمظهر" : section === "Files & Sharing" ? "الملفات والمشاركة" : section === "Access & Apps" ? "الوصول والتطبيقات" : "الأتمتة والذكاء الاصطناعي")}</div>{(keys as string[]).map((key) => { const item = TABS.find((x) => x[0] === key)!; const active = tab === key; const Icon = (Icons as any)[item[3]]; return <button key={key} type="button" onClick={() => navigate(key as TabKey)} className={`mb-0.5 flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-start text-[12px] font-medium ${active ? "bg-[#e8efff] text-[#2f61b7]" : "text-[#33373c] hover:bg-[#f5f6f7]"}`}><Icon size={15} /><span>{text(ar, item[1], item[2])}</span></button>; })}</div>)}
    </aside>

    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f7f7]">
      <div className="flex h-[52px] items-center justify-between border-b border-[#e7e7e7] bg-white px-6"><span className="text-[15px] font-semibold text-[#202124]">{text(ar, "Settings", "الإعدادات")}</span><div className="flex items-center gap-3 text-[11px] font-semibold text-[#202124]"><span>IMKAN</span><span className="grid h-7 w-7 place-items-center rounded-full bg-[#e7efff] text-[9px] text-[#315da8]">IM</span></div></div>
      <div className="mx-auto w-full max-w-[1050px] px-6 py-7 lg:px-8">
        {message ? <div className="mb-4 rounded-[10px] border border-[#b8e2d6] bg-[#effaf6] px-4 py-3 text-[12px] text-[#176a55]">{message}</div> : null}
        {error ? <div className="mb-4 rounded-[10px] border border-[#f1c5c5] bg-[#fff5f5] px-4 py-3 text-[12px] text-[#a52a2a]">{error}</div> : null}
        <div className="mb-5 rounded-[14px] bg-white px-6 py-4 shadow-[0_1px_2px_rgba(0,0,0,.02)]"><h1 className="text-[18px] font-semibold text-[#202124]">{text(ar, TABS.find((x) => x[0] === tab)?.[1] ?? "Settings", TABS.find((x) => x[0] === tab)?.[2] ?? "الإعدادات")}</h1></div>

        {tab === "profile" ? <ProfileTab ar={ar} org={org} profileName={profileName} setProfileName={setProfileName} ownerEmail={ownerEmail} saving={saving} save={saveProfile} /> : null}
        {tab === "branding" ? <BrandingTab ar={ar} settings={settings} inputRef={logoInput} onUpload={(logoDataUrl) => void update({ logoDataUrl })} saving={saving} /> : null}
        {tab === "custom-domain" ? <CustomDomainTab ar={ar} settings={settings} saving={saving} onSave={(customDomain) => void update({ customDomain })} /> : null}
        {tab === "viewpreferences" ? <ViewPreferencesTab ar={ar} settings={settings} saving={saving} onUpdate={update} /> : null}
        {tab === "content" ? <ContentTab ar={ar} settings={settings} saving={saving} onUpdate={update} /> : null}
        {tab === "sharing" ? <SharingTab ar={ar} settings={settings} policy={policy} saving={saving} onUpdate={update} onPolicy={updatePolicy} /> : null}
        {tab === "storage" ? <StorageTab ar={ar} settings={settings} retention={retention} saving={saving} onUpdate={update} onRetention={updateRetention} /> : null}
        {tab === "dataretention" ? <RetentionTab ar={ar} retention={retention} saving={saving} onSave={updateRetention} /> : null}
        {tab === "roles" ? <RolesTab ar={ar} settings={settings} saving={saving} onUpdate={update} /> : null}
        {tab === "workdrive-apps" ? <InfoTab ar title="WorkDrive Apps" body="Administer the applications exposed to this organization. Existing application surfaces remain available from the Admin Console sidebar." /> : null}
        {tab === "workflows" ? <InfoTab ar title="Workflows" body="Workflow administration remains available from the dedicated Admin Console page and uses the existing runtime." href="/admin/workflows" /> : null}
        {tab === "zia" ? <InfoTab ar title="Zia" body="Zia is intentionally not enabled in this IMKAN build. No synthetic AI controls are presented here." /> : null}
        {tab === "file-suggestions" ? <InfoTab ar title="File Suggestions" body="File suggestion controls can be added when the corresponding runtime is enabled; this page does not expose fake controls." /> : null}
      </div>
    </main>
  </div>;
}

function ProfileTab({ ar, org, profileName, setProfileName, ownerEmail, saving, save }: any) {
  return <div className="space-y-5"><SettingCard title={text(ar, "Team details", "بيانات الفريق")}><div className="space-y-5 px-6 pb-6 pt-3"><Field label={text(ar, "Team Name", "اسم الفريق")}><input className="zoho-admin-input" value={profileName} onChange={(e) => setProfileName(e.target.value)} /></Field><Field label={text(ar, "Plan Details", "تفاصيل الخطة")}><div className="zoho-admin-input flex items-center justify-between text-[#70747a]"><span>IMKAN WorkDrive</span><span className="text-[11px]">{text(ar, "Self-hosted", "مستضاف ذاتياً")}</span></div></Field><Field label={text(ar, "Super Admin Contact", "جهة اتصال المسؤول العام")}><div className="flex"><input className="zoho-admin-input rounded-e-none" value={ownerEmail} disabled /><span className="inline-flex items-center border border-s-0 border-[#d8dadd] bg-[#fafafa] px-4 text-[11px] text-[#6b6f76]">{text(ar, "Owner", "المالك")}</span></div></Field><div className="rounded-[10px] bg-[#edf4ff] px-4 py-3 text-[11px] leading-5 text-[#315da8]">{text(ar, "The organization owner is protected by the backend authorization rules. Only authorized administrators can change organization settings.", "مالك المؤسسة محمي بقواعد التفويض في الخادم، ولا يمكن تغيير الإعدادات إلا للمسؤولين المصرح لهم.")}</div><div className="flex justify-end"><button type="button" disabled={saving} onClick={save} className="zoho-admin-primary">{saving ? text(ar, "Saving…", "جارٍ الحفظ…") : text(ar, "Save", "حفظ")}</button></div></div></SettingCard><SettingCard title={text(ar, "Delete Team", "حذف الفريق")}><div className="px-6 pb-6 pt-3 text-[12px] leading-6 text-[#6b6f76]">{text(ar, "Team deletion is intentionally not exposed as a destructive one-click operation. It must follow the organization lifecycle and ownership controls already enforced by the backend.", "حذف الفريق ليس عملية تدميرية مباشرة؛ يجب أن يخضع لدورة حياة المؤسسة وضوابط الملكية المطبقة في الخادم.")}</div></SettingCard></div>;
}

function BrandingTab({ ar, settings, inputRef, onUpload, saving }: any) {
  return <SettingCard title={text(ar, "Team logo", "شعار الفريق")}><div className="grid gap-6 px-6 pb-6 pt-3 lg:grid-cols-[1fr_1fr]"><div><button type="button" disabled={saving} onClick={() => inputRef.current?.click()} className="flex h-[110px] w-full items-center justify-center rounded-[4px] border border-dashed border-[#cfd2d6] bg-white hover:bg-[#fafafa]">{settings.logoDataUrl ? <img src={settings.logoDataUrl} alt="" className="max-h-[70px] max-w-[260px] object-contain" /> : <div className="grid place-items-center text-[#2f78c9]"><Icons.upload size={28} /><span className="mt-2 text-[11px]">{text(ar, "Upload logo", "رفع الشعار")}</span></div>}</button><input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/jpg" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 5 * 1024 * 1024) { window.alert(text(ar, "Maximum logo size is 5 MB.", "الحد الأقصى للشعار 5 ميجابايت.")); return; } const reader = new FileReader(); reader.onload = () => onUpload(String(reader.result)); reader.readAsDataURL(file); e.currentTarget.value = ""; }} /><div className="mt-3 rounded-[10px] bg-[#f6f6f6] px-3 py-3 text-[10px] leading-5 text-[#666b72]"><b>{text(ar, "Specifications", "المواصفات")}</b><br />• PNG, JPEG, JPG<br />• {text(ar, "Recommended: 256 × 48 px", "المقاس الموصى به: 256 × 48 بكسل")}<br />• {text(ar, "Maximum size: 5 MB", "الحد الأقصى: 5 ميجابايت")}</div></div><div><div className="text-[12px] font-semibold text-[#33373c]">{text(ar, "Preview", "المعاينة")}</div><div className="mt-3 overflow-hidden rounded-[12px] border border-[#dedfe1]"><div className="h-[18px] bg-[#f5f5f5] px-2"><span className="me-1 inline-block h-2 w-2 rounded-full bg-[#aaa]" /><span className="me-1 inline-block h-2 w-2 rounded-full bg-[#bbb]" /><span className="inline-block h-2 w-2 rounded-full bg-[#ccc]" /></div><div className="flex h-[125px]"><div className="w-[38%] bg-[#252525] p-4">{settings.logoDataUrl ? <img src={settings.logoDataUrl} alt="" className="max-h-8 max-w-full object-contain object-left" /> : <div className="text-[11px] font-semibold text-white">IMKAN WorkDrive</div>}<div className="mt-5 h-1.5 w-4/5 bg-white/20" /><div className="mt-3 h-1.5 w-3/5 bg-white/20" /></div><div className="flex-1 bg-[#fafafa]" /></div></div><div className="mt-3 rounded-[10px] bg-[#edf4ff] px-3 py-3 text-[10px] leading-5 text-[#315da8]">{text(ar, "The saved logo is organization-scoped and can be reused by the Admin Console shell.", "يُحفظ الشعار على مستوى المؤسسة ويمكن استخدامه في واجهة وحدة الإدارة.")}</div></div></div></SettingCard>;
}

function CustomDomainTab({ ar, settings, saving, onSave }: any) {
  const [domain, setDomain] = useState(settings.customDomain ?? "");
  return <SettingCard title={text(ar, "Custom Domain", "النطاق المخصص")}><div className="px-6 pb-6 pt-3"><p className="text-[12px] leading-6 text-[#6b6f76]">{text(ar, "Configure the organization domain used for future WorkDrive entry points. Saving stores the domain in the organization configuration; DNS/TLS activation still depends on the deployment infrastructure.", "قم بإعداد نطاق المؤسسة لنقاط دخول WorkDrive المستقبلية. حفظ النطاق يتم فعلياً في إعدادات المؤسسة، بينما تفعيل DNS/TLS يعتمد على بنية النشر.")}</p><div className="mt-5 flex max-w-[720px]"><input className="zoho-admin-input rounded-e-none" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="drive.example.com" /><button type="button" disabled={saving} onClick={() => void onSave(domain.trim() || null)} className="zoho-admin-primary rounded-s-none">{text(ar, "Save", "حفظ")}</button></div>{domain ? <div className="mt-3 text-[11px] text-[#2b6e58]">● {text(ar, "Configured", "مُكوّن")}</div> : null}</div></SettingCard>;
}

function ViewPreferencesTab({ ar, settings, saving, onUpdate }: any) {
  return <div className="space-y-5"><SettingCard title={text(ar, "Set a default view for your Team", "تعيين العرض الافتراضي للفريق")}><div className="px-6 pb-6 pt-3"><p className="mb-4 text-[11px] leading-5 text-[#6b6f76]">{text(ar, "This default applies to Team Folders and their views. Members can still change their personal view.", "يطبق هذا الافتراضي على مجلدات الفريق وعروضها، ويمكن للأعضاء تغيير عرضهم الشخصي.")}</p><div className="grid gap-2 md:grid-cols-3">{([["THUMBNAIL", "Thumbnail"], ["LIST", "List"], ["COMPACT", "Compact"]] as const).map(([v, label]) => <Choice key={v} checked={settings.defaultView === v} label={text(ar, label, v === "THUMBNAIL" ? "مصغرات" : v === "LIST" ? "قائمة" : "مضغوط")} onClick={() => void onUpdate({ defaultView: v })} />)}</div><div className="mt-6 flex items-center gap-4"><span className="text-[12px] font-medium">{text(ar, "Default thumbnail size", "حجم المصغرات الافتراضي")}</span><input type="range" min="1" max="5" value={settings.thumbnailSize} onChange={(e) => void onUpdate({ thumbnailSize: Number(e.target.value) })} className="w-full max-w-[520px] accent-[#2f6ee5]" /><span className="text-[11px] text-[#6b6f76]">{settings.thumbnailSize}/5</span></div></div></SettingCard><SettingCard title={text(ar, "Default right panel view for file preview", "العرض الافتراضي للوحة الجانبية")}><div className="px-6 pb-6 pt-3">{([["PREVIEW", "Only Preview"], ["DETAILS", "File Details"], ["COMMENTS", "Comments"], ["DATA_TEMPLATE", "Data Template"]] as const).map(([v, label]) => <Choice key={v} checked={settings.previewPanel === v} label={text(ar, label, v === "PREVIEW" ? "المعاينة فقط" : v === "DETAILS" ? "تفاصيل الملف" : v === "COMMENTS" ? "التعليقات" : "قالب البيانات")} onClick={() => void onUpdate({ previewPanel: v })} />)}</div></SettingCard></div>;
}

function ContentTab({ ar, settings, onUpdate }: any) {
  return <div className="space-y-5"><SettingCard title={text(ar, "Content", "المحتوى")}><div className="divide-y divide-[#ededed] px-6"><SwitchRow title={text(ar, "Convert files to IMKAN WorkDrive format on upload", "تحويل الملفات إلى صيغة IMKAN عند الرفع")} description={text(ar, "The setting is organization-scoped and can be used by upload/conversion flows.", "الإعداد على مستوى المؤسسة ويمكن لعمليات الرفع والتحويل استخدامه.")} checked={settings.convertOnUpload} onChange={(v) => void onUpdate({ convertOnUpload: v })} /></div></SettingCard><SettingCard title={text(ar, "Edit non-IMKAN files in Office Suite", "تحرير الملفات غير التابعة لـ IMKAN داخل Office")}><div className="divide-y divide-[#ededed] px-6"><SwitchRow title="Writer" description="DOC/DOCX and supported text documents." checked={settings.allowNonZohoWriter} onChange={(v) => void onUpdate({ allowNonZohoWriter: v })} /><SwitchRow title="Sheet" description="XLS/XLSX/CSV and supported spreadsheets." checked={settings.allowNonZohoSheet} onChange={(v) => void onUpdate({ allowNonZohoSheet: v })} /><SwitchRow title="Show" description="PPT/PPTX and supported presentations." checked={settings.allowNonZohoShow} onChange={(v) => void onUpdate({ allowNonZohoShow: v })} /></div></SettingCard><SettingCard><div className="px-6"><SwitchRow title={text(ar, "Save newly created Team Folder Office files as drafts", "حفظ ملفات Office الجديدة في مجلدات الفريق كمسودات")} checked={settings.saveNewFilesAsDrafts} onChange={(v) => void onUpdate({ saveNewFilesAsDrafts: v })} /></div><div className="border-t border-[#ededed] px-6 pb-5 pt-4"><label className="text-[12px] font-medium">{text(ar, "Additional OCR search language", "لغة OCR إضافية")}</label><select className="zoho-admin-input mt-2 max-w-[430px]" value={settings.ocrLanguage} onChange={(e) => void onUpdate({ ocrLanguage: e.target.value })}><option value="NONE">None</option><option value="AR">Arabic</option><option value="EN">English</option><option value="FR">French</option><option value="TR">Turkish</option></select></div></SettingCard></div>;
}

function SharingTab({ ar, settings, policy, onUpdate, onPolicy }: any) {
  return <div className="space-y-5"><SettingCard><div className="px-6"><SwitchRow title={text(ar, "Allow files and folders to be shared outside this team", "السماح بمشاركة الملفات والمجلدات خارج الفريق")} description={text(ar, "This is enforced by the sharing backend and Team Folder ACLs.", "يتم فرض هذا الخيار فعلياً من خلال خادم المشاركة وصلاحيات مجلدات الفريق.")} checked={policy.allowExternalSharing} onChange={(v) => void onPolicy({ allowExternalSharing: v })} /></div></SettingCard><SettingCard><div className="px-6"><SwitchRow title={text(ar, "Allow direct sharing via email addresses", "السماح بالمشاركة المباشرة عبر البريد الإلكتروني")} checked={settings.allowDirectEmailSharing} onChange={(v) => void onUpdate({ allowDirectEmailSharing: v })} />{settings.allowDirectEmailSharing ? <div className="border-t border-[#ededed] py-4"><div className="mb-2 text-[12px] font-medium">{text(ar, "Allow direct sharing to", "السماح بالمشاركة إلى")}</div><div className="grid gap-2 md:grid-cols-2"><Choice checked={settings.directSharingScope === "ANY_EXTERNAL_USER"} label={text(ar, "Any external users", "أي مستخدمين خارجيين")} onClick={() => void onUpdate({ directSharingScope: "ANY_EXTERNAL_USER" })} /><Choice checked={settings.directSharingScope === "SPECIFIC_DOMAINS"} label={text(ar, "Specific domains and external users", "نطاقات ومستخدمون خارجيون محددون")} onClick={() => void onUpdate({ directSharingScope: "SPECIFIC_DOMAINS" })} /></div></div> : null}</div></SettingCard><SettingCard><div className="px-6"><SwitchRow title={text(ar, "Allow sharing via external share links", "السماح بروابط المشاركة الخارجية")} checked={settings.allowExternalShareLinks && policy.allowPublicLinks} onChange={(v) => void Promise.all([onUpdate({ allowExternalShareLinks: v }), onPolicy({ allowPublicLinks: v })])} /><SwitchRow title={text(ar, "Enforce passwords", "فرض كلمات مرور")} checked={settings.enforceSharePasswords} onChange={(v) => void onUpdate({ enforceSharePasswords: v })} /><SwitchRow title={text(ar, "Set a default expiration period", "تعيين مدة انتهاء افتراضية")} checked={settings.defaultShareExpiryDays != null} onChange={(v) => void onUpdate({ defaultShareExpiryDays: v ? 30 : null })} />{settings.defaultShareExpiryDays != null ? <select className="zoho-admin-input mb-3 max-w-[220px]" value={settings.defaultShareExpiryDays} onChange={(e) => void onUpdate({ defaultShareExpiryDays: Number(e.target.value) })}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="120">120 days</option></select> : null}<SwitchRow title={text(ar, "Set default user info collection", "جمع معلومات المستخدم الخارجي افتراضياً")} checked={settings.collectExternalUserInfo} onChange={(v) => void onUpdate({ collectExternalUserInfo: v })} /></div></SettingCard><SettingCard><div className="px-6"><SwitchRow title={text(ar, "Allow sharing via download links", "السماح بروابط التنزيل")} checked={settings.allowDownloadLinks} onChange={(v) => void onUpdate({ allowDownloadLinks: v })} />{settings.allowDownloadLinks ? <div className="border-t border-[#ededed] py-4"><SwitchRow title={text(ar, "Allow download links to expire by default", "انتهاء روابط التنزيل افتراضياً")} checked={settings.downloadLinkExpiryDays != null} onChange={(v) => void onUpdate({ downloadLinkExpiryDays: v ? 30 : null })} /></div> : null}</div></SettingCard><SettingCard><div className="px-6"><SwitchRow title={text(ar, "Allow permalink settings and embed codes", "السماح بإعدادات الروابط الدائمة والتضمين")} checked={settings.allowPermalinkEmbeds} onChange={(v) => void onUpdate({ allowPermalinkEmbeds: v })} /><SwitchRow title={text(ar, "Allow download and print for embedded files and folders", "السماح بالتنزيل والطباعة للمحتوى المضمّن")} checked={settings.allowEmbedDownloadPrint} onChange={(v) => void onUpdate({ allowEmbedDownloadPrint: v })} /></div></SettingCard><SettingCard title={text(ar, "Enable collections", "تمكين المجموعات")}><div className="px-6"><SwitchRow title={text(ar, "Enable collections", "تمكين المجموعات")} checked={settings.allowCollections} onChange={(v) => void onUpdate({ allowCollections: v })} />{settings.allowCollections ? <><div className="border-t border-[#ededed] py-4"><div className="mb-2 text-[12px] font-medium">{text(ar, "Set who can create and manage collections", "تحديد من يمكنه إنشاء وإدارة المجموعات")}</div><div className="grid gap-2 md:grid-cols-2"><Choice checked={settings.collectionManagerScope === "ANYONE_ON_TEAM"} label={text(ar, "Anyone on the Team", "أي شخص في الفريق")} onClick={() => void onUpdate({ collectionManagerScope: "ANYONE_ON_TEAM" })} /><Choice checked={settings.collectionManagerScope === "TEAM_ADMINS_ONLY"} label={text(ar, "Team Admins only", "مسؤولو الفريق فقط")} onClick={() => void onUpdate({ collectionManagerScope: "TEAM_ADMINS_ONLY" })} /></div></div></> : null}</div></SettingCard></div>;
}

function StorageTab({ ar, settings, retention, onUpdate, onRetention }: any) {
  return <div className="space-y-5"><SettingCard><div className="px-6"><SwitchRow title={text(ar, "Set storage limit in My Folders", "تحديد حد التخزين في مجلداتي")} checked={settings.myFoldersLimitBytes != null} onChange={(v) => void onUpdate({ myFoldersLimitBytes: v ? String(10737418240) : null })} />{settings.myFoldersLimitBytes != null ? <div className="pb-4"><div className="flex max-w-[420px] items-center gap-2"><input className="zoho-admin-input" type="number" min="0" value={Math.round(Number(settings.myFoldersLimitBytes) / 1073741824)} onChange={(e) => void onUpdate({ myFoldersLimitBytes: String(Math.max(0, Number(e.target.value)) * 1073741824) })} /><span className="text-[12px] text-[#6b6f76]">GB</span></div></div> : null}</div></SettingCard><SettingCard title={text(ar, "Manage file versions", "إدارة إصدارات الملفات")}><div className="space-y-2 px-6 pb-6 pt-3"><Choice checked={settings.versionMode === "ALL"} label={text(ar, "Retain all versions", "الاحتفاظ بكل الإصدارات")} description={text(ar, "No automatic version count limit is applied.", "لا يتم تطبيق حد تلقائي لعدد الإصدارات.")} onClick={() => { void onUpdate({ versionMode: "ALL", versionLimit: null }); void onRetention({ versionLimit: null }); }} /><Choice checked={settings.versionMode === "LIMITED"} label={text(ar, "Retain latest versions up to a particular number", "الاحتفاظ بأحدث الإصدارات حتى عدد محدد")} onClick={() => { if (settings.versionMode !== "LIMITED") { void onUpdate({ versionMode: "LIMITED", versionLimit: 10 }); void onRetention({ versionLimit: 10 }); } }} />{settings.versionMode === "LIMITED" ? <div className="flex items-center gap-2 ps-8"><input className="zoho-admin-input max-w-[180px]" type="number" min="1" value={settings.versionLimit ?? 10} onChange={(e) => { const n = Math.max(1, Number(e.target.value)); void onUpdate({ versionLimit: n }); void onRetention({ versionLimit: n }); }} /><span className="text-[11px] text-[#6b6f76]">versions</span></div> : null}</div></SettingCard></div>;
}

function RetentionTab({ ar, retention, saving, onSave }: any) {
  return <SettingCard><div className="px-6 pb-6 pt-3"><p className="text-[12px] leading-6 text-[#6b6f76]">{text(ar, "Set how often files and folders are automatically deleted from Trash and Deleted Items. These values are persisted in the organization retention policy.", "حدد متى يتم حذف الملفات والمجلدات تلقائياً من سلة المهملات والعناصر المحذوفة. يتم حفظ هذه القيم فعلياً في سياسة احتفاظ المؤسسة.")}</p><div className="mt-6 grid gap-7 md:grid-cols-2"><Field label={text(ar, "Trash in My Folders and Team Folders", "سلة المهملات في مجلداتي ومجلدات الفريق")}><select className="zoho-admin-input" value={retention.trashDays} onChange={(e) => void onSave({ trashDays: Number(e.target.value) })} disabled={saving}><option value="7">7 days</option><option value="15">15 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="120">120 days</option></select></Field><Field label={text(ar, "Deleted Items in Admin Console", "العناصر المحذوفة في وحدة الإدارة")}><select className="zoho-admin-input" value={retention.deletedItemsDays} onChange={(e) => void onSave({ deletedItemsDays: Number(e.target.value) })} disabled={saving}><option value="30">30 days</option><option value="90">90 days</option><option value="120">120 days</option><option value="365">365 days</option><option value="730">2 years</option><option value="3650">10 years</option></select></Field></div><div className="mt-6 rounded-[12px] bg-[#eaf2ff] px-4 py-3 text-[11px] leading-5 text-[#315da8]">{text(ar, `Current policy: ${retention.trashDays} days in Trash · ${retention.deletedItemsDays} days in Deleted Items.`, `السياسة الحالية: ${retention.trashDays} يوماً في السلة · ${retention.deletedItemsDays} يوماً في العناصر المحذوفة.`)}</div></div></SettingCard>;
}

function RolesTab({ ar, settings, onUpdate }: any) {
  return <div className="space-y-5"><SettingCard><div className="px-6 pb-6 pt-3"><Field label={text(ar, "Set who can create Public Team Folders on your team", "تحديد من يمكنه إنشاء مجلدات فريق عامة")}><div className="grid gap-2 md:grid-cols-2"><Choice checked={settings.publicTeamFolderCreator === "ADMINS_ONLY"} label={text(ar, "Team Admins Only", "مسؤولو الفريق فقط")} onClick={() => void onUpdate({ publicTeamFolderCreator: "ADMINS_ONLY" })} /><Choice checked={settings.publicTeamFolderCreator === "ANYONE"} label={text(ar, "Anyone on the Team", "أي شخص في الفريق")} onClick={() => void onUpdate({ publicTeamFolderCreator: "ANYONE" })} /></div></Field><div className="my-6 border-t border-[#ededed]" /><Field label={text(ar, "Set who can create Private Team Folders on your team", "تحديد من يمكنه إنشاء مجلدات فريق خاصة")}><div className="grid gap-2 md:grid-cols-2"><Choice checked={settings.privateTeamFolderCreator === "ADMINS_ONLY"} label={text(ar, "Team Admins Only", "مسؤولو الفريق فقط")} onClick={() => void onUpdate({ privateTeamFolderCreator: "ADMINS_ONLY" })} /><Choice checked={settings.privateTeamFolderCreator === "ANYONE"} label={text(ar, "Anyone on the Team", "أي شخص في الفريق")} onClick={() => void onUpdate({ privateTeamFolderCreator: "ANYONE" })} /></div></Field></div></SettingCard><SettingCard><div className="px-6"><SwitchRow title={text(ar, "Allow users with the same domain name to join this team", "السماح لمستخدمي نفس النطاق بالانضمام للفريق")} description={text(ar, "When enabled, matching domains can be used by the organization onboarding flow.", "عند التمكين يمكن لتدفق انضمام المؤسسة استخدام النطاق المطابق.")} checked={settings.sameDomainJoinEnabled} onChange={(v) => void onUpdate({ sameDomainJoinEnabled: v })} /></div></SettingCard><SettingCard title={text(ar, "Team Folder roles and permissions", "أدوار وصلاحيات مجلدات الفريق")}><div className="grid gap-3 px-6 pb-6 pt-3 md:grid-cols-5">{[["Viewer", "View access + extra permissions"], ["Commenter", "Comment access + extra permissions"], ["Editor", "Edit access + extra permissions"], ["Organizer", "Organize access + extra permissions"], ["Admin", "Full access + extra permissions"]].map(([role, desc]) => <div key={role} className="rounded-[12px] border border-[#e7e7e7] p-3"><div className="text-[12px] font-semibold">{role}</div><div className="mt-2 rounded-lg bg-[#eaf7ef] px-2 py-2 text-[9px] leading-4 text-[#267044]">{desc}</div></div>)}</div></SettingCard></div>;
}

function InfoTab({ ar, title, body, href }: { ar: boolean; title: string; body: string; href?: string }) {
  return <SettingCard title={text(ar, title, title)}><div className="px-6 pb-7 pt-3"><p className="max-w-[760px] text-[12px] leading-6 text-[#6b6f76]">{text(ar, body, body)}</p>{href ? <a href={href} className="mt-5 inline-flex rounded-full bg-[#2f6ee5] px-4 py-2 text-[11px] font-semibold text-white">{text(ar, "Open Admin surface", "فتح واجهة الإدارة")}</a> : null}</div></SettingCard>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-[12px] font-medium text-[#33373c]">{label}</span>{children}</label>; }
