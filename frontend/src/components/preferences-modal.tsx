"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../locale-provider";

type Props = { open: boolean; onClose: () => void };

type Prefs = {
  defaultView: "thumbnail" | "list" | "compact";
  defaultSort: "lastModified" | "name" | "timeCreated";
  sortOrder: "newest" | "az";
  defaultLanding: "suggestions" | "recent" | "favorites" | "myFolders" | "lastOpened";
  teamFolderListing: "all" | "integrated" | "pinned" | "none";
  includeMyFoldersInSuggestions: boolean;
  convertOnUpload: boolean;
  optionalColumns: { lastModified: boolean; timeCreated: boolean; size: boolean; type: boolean; extension: boolean };
  notifications: Record<string, { email: boolean; web: boolean; mobile: boolean }>;
};

const defaultPrefs: Prefs = {
  defaultView: "list",
  defaultSort: "lastModified",
  sortOrder: "newest",
  defaultLanding: "myFolders",
  teamFolderListing: "integrated",
  includeMyFoldersInSuggestions: true,
  convertOnUpload: false,
  optionalColumns: { lastModified: false, timeCreated: false, size: false, type: false, extension: false },
  notifications: {
    mentions: { email: true, web: true, mobile: true },
    sharedWithMe: { email: true, web: true, mobile: true },
    sharedToGroup: { email: true, web: true, mobile: true },
    addedToTeam: { email: false, web: true, mobile: true },
    roleChanges: { email: false, web: true, mobile: true },
    accessRequests: { email: true, web: true, mobile: true },
    newPublicTeam: { email: false, web: true, mobile: true },
  },
};

const STORAGE_KEY = "imkan_workdrive_preferences_v1";

export function PreferencesModal({ open, onClose }: Props) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [tab, setTab] = useState<"general" | "notifications">("general");
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs);

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPrefs({ ...defaultPrefs, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, [open]);

  function save(next: Prefs) {
    setPrefs(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  function patch(p: Partial<Prefs>) {
    save({ ...prefs, ...p });
  }

  if (!open) return null;

  const notifRows: { key: keyof Prefs["notifications"]; label: string }[] = [
    { key: "mentions", label: ar ? "@الإشارات" : "@mentions" },
    { key: "sharedWithMe", label: ar ? "ملف أو مجلد تمت مشاركته معي" : "File or folder shared with me" },
    { key: "sharedToGroup", label: ar ? "ملف أو مجلد تمت مشاركته لمجموعة" : "File or folder shared to group" },
    { key: "addedToTeam", label: ar ? "إضافة إلى مجلد الفريق" : "Getting added to Team Folder" },
    { key: "roleChanges", label: ar ? "تغييرات أدوار مجلد الفريق" : "Team Folder role changes" },
    { key: "accessRequests", label: ar ? "طلبات الوصول" : "Access Requests" },
    { key: "newPublicTeam", label: ar ? "مجلدات فريق عامة جديدة" : "New Public Team Folders" },
  ];

  return (
    <div className="prefs-overlay" role="dialog" aria-modal="true" aria-label={ar ? "تفضيلاتي" : "My Preferences"}>
      <div className="prefs-panel" dir={ar ? "rtl" : "ltr"}>
        <div className="prefs-header">
          <div className="prefs-title-row">
            <span className="prefs-title-icon">⚙</span>
            <h2>{ar ? "تفضيلاتي" : "My Preferences"}</h2>
          </div>
          <button type="button" className="prefs-close" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"}>×</button>
        </div>
        <div className="prefs-body">
          <nav className="prefs-nav">
            <button type="button" className={tab === "general" ? "is-active" : ""} onClick={() => setTab("general")}>
              <span>⚙</span> {ar ? "عام" : "General"}
            </button>
            <button type="button" className={tab === "notifications" ? "is-active" : ""} onClick={() => setTab("notifications")}>
              <span>🔔</span> {ar ? "الإشعارات" : "Notifications"}
            </button>
          </nav>
          <div className="prefs-content">
            {tab === "general" ? (
              <>
                <section className="prefs-card">
                  <h3>{ar ? "العرض الافتراضي" : "Default view"}</h3>
                  <p className="prefs-desc">{ar ? "اختر التخطيط الافتراضي للعناصر عبر المجلدات والعروض." : "Choose a default layout for items across your folders and views."}</p>
                  <div className="prefs-radio-group">
                    {([
                      { id: "thumbnail" as const, label: ar ? "مصغرات" : "Thumbnail" },
                      { id: "list" as const, label: ar ? "قائمة" : "List" },
                      { id: "compact" as const, label: ar ? "مضغوط" : "Compact" },
                    ]).map((o) => (
                      <label key={o.id} className={`prefs-radio ${prefs.defaultView === o.id ? "is-active" : ""}`}>
                        <input type="radio" name="defaultView" checked={prefs.defaultView === o.id} onChange={() => patch({ defaultView: o.id })} />
                        {o.label}
                      </label>
                    ))}
                  </div>
                  <p className="prefs-note">*{ar ? "لن يغير المجلدات التي خصصتها مسبقاً." : "This won't change folders you've already customized."}</p>
                </section>

                <section className="prefs-card">
                  <h3>{ar ? "الترتيب الافتراضي" : "Default sorting"}</h3>
                  <p className="prefs-desc">{ar ? "اختر كيفية ترتيب الملفات والمجلدات افتراضياً." : "Choose how files and folders are sorted by default."}</p>
                  <div className="prefs-sort-cards">
                    {([
                      { id: "lastModified" as const, title: ar ? "آخر تعديل" : "Last Modified", desc: ar ? "ترتيب حسب تاريخ آخر تعديل" : "Arrange items by last modified date" },
                      { id: "name" as const, title: ar ? "الاسم" : "Name", desc: ar ? "ترتيب حسب الاسم" : "Arrange items by name" },
                      { id: "timeCreated" as const, title: ar ? "وقت الإنشاء" : "Time created", desc: ar ? "ترتيب حسب تاريخ الإنشاء" : "Arrange items by creation date" },
                    ]).map((o) => (
                      <button key={o.id} type="button" className={`prefs-sort-card ${prefs.defaultSort === o.id ? "is-active" : ""}`} onClick={() => patch({ defaultSort: o.id })}>
                        <strong>{o.title}</strong>
                        <span>{o.desc}</span>
                        {prefs.defaultSort === o.id ? (
                          <select value={prefs.sortOrder} onChange={(e) => patch({ sortOrder: e.target.value as Prefs["sortOrder"] })} onClick={(e) => e.stopPropagation()}>
                            <option value="newest">{ar ? "الأحدث أولاً" : "Newest first"}</option>
                            <option value="az">A → Z</option>
                          </select>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="prefs-card">
                  <h3>{ar ? "الأعمدة الاختيارية" : "Optional Columns"}</h3>
                  <p className="prefs-desc">{ar ? "تظهر فقط في عرض القائمة والمضغوط." : "Column settings apply only to List and Compact views."}</p>
                  {([
                    { key: "lastModified" as const, label: ar ? "آخر تعديل" : "Last Modified" },
                    { key: "timeCreated" as const, label: ar ? "وقت الإنشاء" : "Time Created" },
                    { key: "size" as const, label: ar ? "الحجم" : "Size" },
                    { key: "type" as const, label: ar ? "النوع" : "Type" },
                    { key: "extension" as const, label: ar ? "الامتداد" : "Extension" },
                  ]).map((c) => (
                    <label key={c.key} className="prefs-check-row">
                      <input type="checkbox" checked={prefs.optionalColumns[c.key]} onChange={(e) => patch({ optionalColumns: { ...prefs.optionalColumns, [c.key]: e.target.checked } })} />
                      {c.label}
                    </label>
                  ))}
                </section>

                <section className="prefs-card">
                  <h3>{ar ? "موقع الهبوط الافتراضي" : "Default Landing Location"}</h3>
                  <p className="prefs-desc">{ar ? "اختر الموقع الافتراضي عند تسجيل الدخول." : "Choose a default location to open when you sign in."}</p>
                  {([
                    { id: "suggestions" as const, label: ar ? "اقتراحات الملفات" : "File Suggestions" },
                    { id: "recent" as const, label: ar ? "الملفات الأخيرة" : "Recent Files" },
                    { id: "favorites" as const, label: ar ? "المفضلة" : "Favorites" },
                    { id: "myFolders" as const, label: ar ? "مجلداتي" : "My Folders" },
                    { id: "lastOpened" as const, label: ar ? "آخر مجلد مفتوح" : "Last Opened Folder" },
                  ]).map((o) => (
                    <label key={o.id} className="prefs-check-row">
                      <input type="radio" name="landing" checked={prefs.defaultLanding === o.id} onChange={() => patch({ defaultLanding: o.id })} />
                      {o.label}
                    </label>
                  ))}
                </section>

                <section className="prefs-card">
                  <h3>{ar ? "عرض مجلدات الفريق" : "Default Team Folder listing"}</h3>
                  {([
                    { id: "all" as const, label: ar ? "إظهار كل مجلدات الفريق" : "Show all Team Folders" },
                    { id: "integrated" as const, label: ar ? "إظهار حسب التطبيقات المتكاملة" : "Show Team Folders based on the integrated apps" },
                    { id: "pinned" as const, label: ar ? "إظهار المثبتة فقط" : "Show only pinned Team Folders" },
                    { id: "none" as const, label: ar ? "عدم إظهار أي مجلدات فريق" : "Don't show any Team Folders" },
                  ]).map((o) => (
                    <label key={o.id} className="prefs-check-row">
                      <input type="radio" name="teamListing" checked={prefs.teamFolderListing === o.id} onChange={() => patch({ teamFolderListing: o.id })} />
                      {o.label}
                    </label>
                  ))}
                </section>

                <section className="prefs-card prefs-toggle-card">
                  <div>
                    <h3>{ar ? "تضمين ملفات مجلداتي في الاقتراحات الذكية" : "Include My Folders files in Smart Suggestions"}</h3>
                    <p className="prefs-desc">{ar ? "عند التفعيل، يمكن للمتعاونين رؤية الملفات التي شاركتها." : "When enabled, collaborators can see files you've shared."}</p>
                  </div>
                  <button type="button" role="switch" aria-checked={prefs.includeMyFoldersInSuggestions} className={`prefs-switch ${prefs.includeMyFoldersInSuggestions ? "is-on" : ""}`} onClick={() => patch({ includeMyFoldersInSuggestions: !prefs.includeMyFoldersInSuggestions })} />
                </section>

                <section className="prefs-card prefs-toggle-card">
                  <div>
                    <h3>{ar ? "تحويل كل الملفات إلى تنسيق Zoho WorkDrive عند الرفع" : "Convert all files to Zoho WorkDrive's format when you upload to My Folders"}</h3>
                    <p className="prefs-desc">{ar ? "تحويل تلقائي للمستندات والجداول والعروض." : "Automatically convert documents, spreadsheets, and presentations."}</p>
                  </div>
                  <button type="button" role="switch" aria-checked={prefs.convertOnUpload} className={`prefs-switch ${prefs.convertOnUpload ? "is-on" : ""}`} onClick={() => patch({ convertOnUpload: !prefs.convertOnUpload })} />
                </section>
              </>
            ) : (
              <section className="prefs-card">
                <h3>{ar ? "الإشعارات" : "Notifications"}</h3>
                <p className="prefs-desc">{ar ? "اختر تفضيلاتك للبريد والويب والجوال." : "Select your preferences for email, web, and mobile notifications."}</p>
                <table className="prefs-notif-table">
                  <thead>
                    <tr>
                      <th>{ar ? "إظهار الإشعارات لـ" : "Show notifications for"}</th>
                      <th>{ar ? "البريد" : "Email"}</th>
                      <th>{ar ? "الويب" : "Web"}</th>
                      <th>{ar ? "الجوال" : "Mobile"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifRows.map((row) => (
                      <tr key={row.key}>
                        <td>{row.label}</td>
                        {(["email", "web", "mobile"] as const).map((ch) => (
                          <td key={ch}>
                            <input
                              type="checkbox"
                              checked={prefs.notifications[row.key][ch]}
                              onChange={(e) => {
                                const next = { ...prefs.notifications, [row.key]: { ...prefs.notifications[row.key], [ch]: e.target.checked } };
                                patch({ notifications: next });
                              }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
