"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../../../components/locale-provider";
import { createCollection, deleteCollection, emailCollectionLink, listCollections, listCollectionSubmissions, regenerateCollectionLink, updateCollection, type FileCollection, type CollectionSubmission } from "../../../lib/api/collections";
import { createFolder, getFolder, listRootContents } from "../../../lib/api/folders";
import type { FolderRecord } from "../../../lib/api/types";

const SIZE_OPTIONS = [
  { value: 100 * 1024 * 1024, label: "100 MB" },
  { value: 250 * 1024 * 1024, label: "250 MB" },
  { value: 500 * 1024 * 1024, label: "500 MB" },
  { value: 1024 * 1024 * 1024, label: "1 GB" },
  { value: 2 * 1024 * 1024 * 1024, label: "2 GB" },
];

export default function CollectionsPage() {
  const { label, locale } = useLocale();
  const ar = locale === "ar";
  const [rows, setRows] = useState<FileCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState("");
  const [folderName, setFolderName] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [type, setType] = useState<"INTERNAL" | "EXTERNAL">("INTERNAL");
  const [collectName, setCollectName] = useState(true);
  const [collectPhone, setCollectPhone] = useState(false);
  const [collectEmail, setCollectEmail] = useState(false);
  const [separateFolder, setSeparateFolder] = useState(false);
  const [sizeLimitEnabled, setSizeLimitEnabled] = useState(false);
  const [maxFileSizeBytes, setMaxFileSizeBytes] = useState<number>(SIZE_OPTIONS[0].value);
  const [maxFilesEnabled, setMaxFilesEnabled] = useState(false);
  const [maxFiles, setMaxFiles] = useState(10);
  const [expiryEnabled, setExpiryEnabled] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [sameNameAsVersion, setSameNameAsVersion] = useState(false);
  const [notifyOnSubmission, setNotifyOnSubmission] = useState(true);
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const [maxFilesMenuOpen, setMaxFilesMenuOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [token, setToken] = useState("");
  const [selected, setSelected] = useState<FileCollection | null>(null);
  const [submissions, setSubmissions] = useState<CollectionSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFolderId, setPickerFolderId] = useState<string | null>(null);
  const [pickerPath, setPickerPath] = useState<FolderRecord[]>([]);
  const [pickerFolders, setPickerFolders] = useState<FolderRecord[]>([]);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [linkCollection, setLinkCollection] = useState<FileCollection | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkTokens, setLinkTokens] = useState<Record<string,string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const parsed = JSON.parse(window.localStorage.getItem("wd-collection-link-tokens") || "{}") as Record<string, string>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch { return {}; }
  });
  const [emailTo, setEmailTo] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailNotice, setEmailNotice] = useState("");
  const [detail, setDetail] = useState<FileCollection | null>(null);
  const [settings, setSettings] = useState<FileCollection | null>(null);
  const [settingsName, setSettingsName] = useState("");
  const [settingsDescription, setSettingsDescription] = useState("");
  const [settingsExpires, setSettingsExpires] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);

  const refresh = useCallback(() => listCollections().then(setRows).catch(e => setError(e instanceof Error ? e.message : (ar ? "تعذر تحميل مجموعات التجميع" : "Unable to load collections"))).finally(() => setLoading(false)), [ar]);
  useEffect(() => { void refresh(); }, [refresh]);

  const resetForm = () => {
    setName(""); setFolderId(""); setFolderName(""); setDescription(""); setNotes(""); setType("INTERNAL");
    setCollectName(true); setCollectPhone(false); setCollectEmail(false); setSeparateFolder(false);
    setSizeLimitEnabled(false); setMaxFileSizeBytes(SIZE_OPTIONS[0].value); setMaxFilesEnabled(false); setMaxFiles(10);
    setExpiryEnabled(false); setExpiresAt(""); setSameNameAsVersion(false); setNotifyOnSubmission(true);
  };

  async function create() {
    if (!name.trim() || !folderId || creating) return;
    setCreating(true); setError("");
    try {
      const result = await createCollection({
        name: name.trim(), folderId, description: description.trim(), notes: notes.trim(), type,
        collectName: type === "EXTERNAL" ? collectName : true,
        collectPhone: type === "EXTERNAL" && collectPhone,
        collectEmail: type === "EXTERNAL" && collectEmail,
        separateFolderPerUser: separateFolder,
        maxFileSizeBytes: sizeLimitEnabled ? maxFileSizeBytes : null,
        maxFiles: type === "EXTERNAL" && maxFilesEnabled ? maxFiles : null,
        expiresAt: expiryEnabled && expiresAt ? new Date(expiresAt).toISOString() : null,
        sameNameAsVersion,
        notifyOnSubmission,
      });
      setLinkTokens(current => {
        const next = { ...current, [result.id]: result.token };
        try { window.localStorage.setItem("wd-collection-link-tokens", JSON.stringify(next)); } catch { /* ignore quota */ }
        return next;
      });
      setLinkUrl(`${window.location.origin}${result.publicPath}`);
      setLinkCollection({ ...result, submissionsCount: 0, filesCount: 0 });
      setEmailTo(""); setEmailMessage(""); setEmailNotice("");
      setShow(false); resetForm(); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : (ar ? "تعذر إنشاء المجموعة" : "Unable to create collection")); }
    finally { setCreating(false); }
  }

  async function loadPicker(id: string | null, path: FolderRecord[] = []) {
    setPickerLoading(true); setPickerError("");
    try {
      const contents = id ? await getFolder(id) : await listRootContents();
      setPickerFolderId(id); setPickerPath(path); setPickerFolders(contents.folders ?? []);
    } catch (e) { setPickerError(e instanceof Error ? e.message : (ar ? "تعذر تحميل المجلدات" : "Unable to load folders")); setPickerFolders([]); }
    finally { setPickerLoading(false); }
  }
  function openPicker() { setPickerOpen(true); void loadPicker(null, []); }
  function navigatePicker(folder: FolderRecord) { void loadPicker(folder.id, [...pickerPath, folder]); }
  function chooseCurrentFolder() {
    setFolderId(pickerFolderId ?? ""); setFolderName(pickerPath.at(-1)?.name ?? (ar ? "ملفاتي" : "My Folders")); setPickerOpen(false);
  }
  async function addFolder() {
    if (!newFolderName.trim() || creatingFolder) return;
    setCreatingFolder(true); setPickerError("");
    try {
      const created = await createFolder(newFolderName.trim(), pickerFolderId ?? undefined);
      setNewFolderName(""); setNewFolderOpen(false);
      await loadPicker(pickerFolderId, pickerPath);
      // Keep the newly created folder highlighted as the location to select.
      setFolderId(created.id); setFolderName(created.name); setPickerOpen(false);
    } catch (e) { setPickerError(e instanceof Error ? e.message : (ar ? "تعذر إنشاء المجلد" : "Unable to create folder")); }
    finally { setCreatingFolder(false); }
  }

  async function sendCollectionEmail() {
    if (!linkCollection || !linkUrl || emailBusy) return;
    const token = linkUrl.split("/collect/")[1] ?? "";
    setEmailBusy(true); setEmailNotice("");
    try {
      const result = await emailCollectionLink(linkCollection.id, { emails: emailTo, message: emailMessage.trim(), token });
      const invalid = result.invalid.length ? ` ${text("Skipped", "تم تجاهل")}: ${result.invalid.join(", ")}` : "";
      setEmailNotice((result.delivered ? text(`Email sent to ${result.sent}.`, `تم إرسال البريد إلى ${result.sent}.`) : text("Email was not delivered because SMTP is not configured.", "لم يُسلَّم البريد لأن خادم SMTP غير مهيأ.")) + invalid);
      if (result.delivered) setEmailTo("");
    } catch (e) { setEmailNotice(e instanceof Error ? e.message : text("Unable to send the collection email.", "تعذر إرسال بريد المجموعة.")); }
    finally { setEmailBusy(false); }
  }
  async function showCollectionLink(row: FileCollection) {
    setMenuFor(null); setLinkCollection(row); setLinkUrl(""); setLinkBusy(true);
    try {
      let token = linkTokens[row.id];
      if (!token) {
        const result = await regenerateCollectionLink(row.id);
        token = result.token;
        setLinkTokens(current => {
          const next = { ...current, [row.id]: token! };
          try { window.localStorage.setItem("wd-collection-link-tokens", JSON.stringify(next)); } catch { /* ignore quota */ }
          return next;
        });
      }
      const url = `${window.location.origin}/collect/${token}`;
      setLinkUrl(url);
      setEmailTo(""); setEmailMessage(""); setEmailNotice("");
    } catch (e) { setError(e instanceof Error ? e.message : text("Unable to generate collection link", "تعذر إنشاء رابط المجموعة")); setLinkCollection(null); }
    finally { setLinkBusy(false); }
  }
  async function openSubmissions(row: FileCollection) {
    setMenuFor(null); setSelected(row); setSubmissionsLoading(true); setSubmissions([]);
    try { setSubmissions(await listCollectionSubmissions(row.id)); }
    catch (e) { setError(e instanceof Error ? e.message : text("Unable to load submissions", "تعذر تحميل الإرسالات")); }
    finally { setSubmissionsLoading(false); }
  }
  function openSettings(row: FileCollection) {
    setMenuFor(null); setSettings(row); setSettingsName(row.name); setSettingsDescription(row.description ?? "");
    setSettingsExpires(row.expiresAt ? new Date(row.expiresAt).toISOString().slice(0,16) : "");
  }
  async function saveSettings() {
    if (!settings || !settingsName.trim() || settingsBusy) return;
    setSettingsBusy(true);
    try { await updateCollection(settings.id, { name: settingsName.trim(), description: settingsDescription.trim(), expiresAt: settingsExpires ? new Date(settingsExpires).toISOString() : null }); setSettings(null); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : text("Unable to save settings", "تعذر حفظ الإعدادات")); }
    finally { setSettingsBusy(false); }
  }

  const visiblePickerFolders = useMemo(() => pickerFolders.filter(folder => folder.name.toLocaleLowerCase(ar ? "ar" : "en").includes(pickerSearch.trim().toLocaleLowerCase(ar ? "ar" : "en"))), [pickerFolders, pickerSearch, ar]);
  const selectedSizeLabel = useMemo(() => SIZE_OPTIONS.find(o => o.value === maxFileSizeBytes)?.label ?? "100 MB", [maxFileSizeBytes]);
  const text = (en: string, arabic: string) => ar ? arabic : en;
  const fieldLabel = "mb-1 block text-[13px] font-medium text-slate-700";
  const checkRow = "flex min-h-8 items-start gap-2.5 text-[12.5px] leading-6 text-slate-700";
  const check = "mt-1 h-4 w-4 shrink-0 accent-[var(--wd-primary)]";

  useEffect(() => {
    if (!menuFor) return;
    const close = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-collection-menu], [data-collection-menu-button]")) return;
      setMenuFor(null);
      setMenuAnchor(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuFor]);

  return <main className="wd-page theme-aware-page flex min-h-0 flex-1 flex-col" dir={ar ? "rtl" : "ltr"} style={{ fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif", color: "var(--wd-text, #212121)", background: "var(--wd-canvas, #fff)" }}>
    <header className="wd-page-head"><div className="wd-page-head-titles"><h1>{label("nav.collectFiles")}</h1><p>{text("Collect files from team members and external people into a selected WorkDrive folder.", "اجمع الملفات من أعضاء الفريق والأشخاص الخارجيين داخل مجلد محدد في WorkDrive.")}</p></div><button className="wd-primary-button" onClick={() => setShow(true)}>＋ {text("Create Collection", "إنشاء مجموعة تجميع")}</button></header>
    {error && <div className="wd-alert" role="alert">{error}</div>}
    {token && <div className="wd-alert" role="status">{text("Collection created. Save this one-time link token:", "تم إنشاء المجموعة. احتفظ برمز الرابط لمرة واحدة:")} <strong dir="ltr">{token}</strong> <button onClick={() => setToken("")}>{text("Dismiss", "إغلاق")}</button></div>}
    {loading ? <div className="wd-card flex flex-1 items-center justify-center p-6">{text("Loading collections…", "جارٍ تحميل المجموعات…")}</div> : rows.length === 0 ? <section className="wd-card flex flex-1 items-center justify-center"><div className="wd-empty"><div className="wd-empty-icon">⇧</div><h2>{text("No collections yet", "لا توجد مجموعات بعد")}</h2><p>{text("Create a collection to receive files from employees, clients, or suppliers.", "أنشئ مجموعة لاستلام الملفات من الموظفين أو العملاء أو الموردين.")}</p><button className="wd-primary-button" onClick={() => setShow(true)}>{text("Create Collection", "إنشاء مجموعة")}</button></div></section> : <div className="grid flex-1 grid-cols-1 content-start gap-4 sm:grid-cols-2 xl:grid-cols-3">{rows.map(r=><article key={r.id} onClick={()=>{setDetail(r);setMenuFor(null);}} className="group relative min-h-[188px] cursor-pointer rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg text-slate-700">▣</div><div className="min-w-0 flex-1"><h2 className="truncate text-[15px] font-semibold text-slate-800">{r.name}</h2><p className="mt-1 text-[11px] text-slate-500">{text("Created by you on", "أنشأتها في")} {new Date(r.createdAt).toLocaleString(ar?"ar":"en",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</p></div>
      <div className="relative" onClick={e=>e.stopPropagation()}><button type="button" aria-label={text("Collection settings", "إعدادات المجموعة")} title={text("Settings", "الإعدادات")} data-collection-menu-button onClick={(event)=>{event.stopPropagation(); if(menuFor===r.id){setMenuFor(null);setMenuAnchor(null);return;} const rect=event.currentTarget.getBoundingClientRect(); const menuWidth=208; const menuHeight=292; const top=window.innerHeight-rect.bottom<menuHeight+8?Math.max(8, rect.top-menuHeight-6):rect.bottom+6; const left=Math.min(Math.max(8, ar?rect.left:rect.right-menuWidth), window.innerWidth-menuWidth-8); setMenuAnchor({top,left}); setMenuFor(r.id);}} className={`flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 ${menuFor===r.id?"opacity-100":"opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}>⚙</button>
      {menuFor===r.id&&menuAnchor&&createPortal((<div data-collection-menu style={{position:"fixed",top:menuAnchor.top,left:menuAnchor.left,width:208}} className="z-[80] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl" role="menu">{[["copy",text("Copy link","نسخ الرابط"),"▢"],["view",text("View submissions","عرض الإرسالات"),"♧"],["email",text("Email link","إرسال الرابط بالبريد"),"✉"],["settings",text("Change settings","تغيير الإعدادات"),"⚙"],["toggle",r.status==="ACTIVE"?text("Disable collection","تعطيل المجموعة"):text("Enable collection","تفعيل المجموعة"),r.status==="ACTIVE"?"⊗":"✓"],["delete",text("Delete collection","حذف المجموعة"),"⌫"]].map(([key,label,ico])=><button key={key} role="menuitem" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-[12px] text-slate-700 hover:bg-blue-50 hover:text-blue-800" onClick={()=>{if(key==="copy")void showCollectionLink(r);else if(key==="view")void openSubmissions(r);else if(key==="email")void showCollectionLink(r,true);else if(key==="settings"){setMenuFor(null);setMenuAnchor(null);openSettings(r);}else if(key==="toggle"){setMenuFor(null);void updateCollection(r.id,{status:r.status==="ACTIVE"?"DISABLED":"ACTIVE"}).then(refresh).catch(e=>setError(e instanceof Error?e.message:"Update failed"));}else{setMenuFor(null);if(confirm(text("Delete this collection? This cannot be undone.","هل تريد حذف هذه المجموعة؟ لا يمكن التراجع عن ذلك.")))void deleteCollection(r.id).then(refresh).catch(e=>setError(e instanceof Error?e.message:"Delete failed"));}}}><span className="w-4 text-center">{ico}</span>{label}</button>)}</div>), document.body)}</div></div>
      {r.description&&<p className="mt-4 line-clamp-2 text-[12px] text-slate-500">{r.description}</p>}
      <p className="mt-3 text-[11px] text-slate-500">{text("Notes not available", "لا توجد ملاحظات متاحة")}</p>
      <div className="mt-5 flex items-center gap-5 border-t border-slate-100 pt-3 text-[12px] text-slate-600"><button onClick={e=>{e.stopPropagation();void openSubmissions(r);}} className="inline-flex items-center gap-2 hover:text-blue-700"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white">↑</span>{r.submissionsCount} {text("users submitted","مستخدم أرسل")}</button><span className="inline-flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white">▤</span>{r.filesCount} {text("files uploaded","ملف مرفوع")}</span></div>
      <span className={`absolute bottom-3 ${ar?"left-4":"right-4"} rounded-full px-2 py-0.5 text-[10px] ${r.status==="ACTIVE"?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-500"}`}>{r.status==="ACTIVE"?text("Active","نشطة"):text("Disabled","معطلة")}</span>
    </article>)}</div>}


    {selected && <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/40 p-4"><section dir={ar?"rtl":"ltr"} className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">{text("Submissions", "الإرسالات")} · {selected.name}</h2><button onClick={()=>setSelected(null)}>{text("Close", "إغلاق")}</button></div>{submissionsLoading?<p>{text("Loading…", "جارٍ التحميل…")}</p>:submissions.length===0?<p className="text-sm text-slate-500">{text("No submissions yet.", "لا توجد إرسالات بعد.")}</p>:<div className="max-h-[60vh] overflow-auto"><table className="w-full text-sm"><thead><tr>{[text("Submitter", "المرسل"),text("File", "الملف"),text("Status", "الحالة"),text("Received", "تاريخ الاستلام")].map(v=><th key={v} className="p-2 text-start">{v}</th>)}</tr></thead><tbody>{submissions.map(s=><tr key={s.id} className="border-t"><td className="p-2">{s.submitterName||s.submitterEmail||text("External submitter", "مرسل خارجي")}</td><td className="p-2">{s.file?.name||"—"}</td><td className="p-2">{s.status}</td><td className="p-2">{s.submittedAt?new Date(s.submittedAt).toLocaleString(ar?"ar":"en"):"—"}</td></tr>)}</tbody></table></div>}</section></div>}

    {show && <div className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-[1px]" onMouseDown={e=>{if(e.target===e.currentTarget)setShow(false);}}>
      <section dir={ar?"rtl":"ltr"} className="relative max-h-[min(92dvh,900px)] w-[min(510px,96vw)] overflow-y-auto rounded-[18px] border border-slate-200 bg-white px-5 py-5 shadow-2xl sm:px-6" role="dialog" aria-modal="true" aria-labelledby="collection-create-title">
        <div className="mb-3 flex items-center justify-between"><h2 id="collection-create-title" className="text-[18px] font-semibold text-slate-900">{text("Create Collection", "إنشاء مجموعة تجميع")}</h2><button type="button" onClick={()=>setShow(false)} aria-label={text("Close", "إغلاق")} className="h-8 w-8 rounded-full text-xl text-slate-500 hover:bg-slate-100">×</button></div>
        <div className="mb-1 inline-flex rounded-xl border border-slate-200 p-0.5"><button type="button" onClick={()=>setType("INTERNAL")} className={`rounded-lg px-3 py-1.5 text-[11px] ${type==="INTERNAL"?"border border-blue-200 bg-blue-50 font-semibold text-blue-800 shadow-sm":"text-slate-700 hover:bg-slate-50"}`}>{text("Internal", "داخلي")}</button><button type="button" onClick={()=>setType("EXTERNAL")} className={`rounded-lg px-3 py-1.5 text-[11px] ${type==="EXTERNAL"?"border border-blue-200 bg-blue-50 font-semibold text-blue-800 shadow-sm":"text-slate-700 hover:bg-slate-50"}`}>{text("External", "خارجي")}</button></div>
        <p className="mb-4 text-[11px] leading-5 text-slate-500">{type==="INTERNAL"?text("Collect files from your team members (sign-in required)", "اجمع الملفات من أعضاء فريقك (يتطلب تسجيل الدخول)"):text("Collect files from external users, i.e., anyone on the internet (sign-in not required)", "اجمع الملفات من مستخدمين خارجيين، أي من أي شخص على الإنترنت (لا يلزم تسجيل الدخول)")}</p>
        <div className="space-y-3.5">
          <label className="block"><span className={fieldLabel}>{text("Collection name", "اسم المجموعة")}</span><input autoFocus className="wd-input w-full" value={name} onChange={e=>setName(e.target.value)} placeholder={text("Please enter a collection name", "يرجى إدخال اسم المجموعة")} maxLength={180}/></label>
          <label className="block"><span className={fieldLabel}>{type==="INTERNAL"?text("Collection details for internal users", "تفاصيل المجموعة للمستخدمين الداخليين"):text("Collection details for external users", "تفاصيل المجموعة للمستخدمين الخارجيين")}</span><textarea className="wd-input min-h-[58px] w-full resize-y" value={description} onChange={e=>setDescription(e.target.value)} placeholder={text("Description", "الوصف")}/></label>
          <label className="block"><span className={fieldLabel}>{text("Notes", "ملاحظات")} <InfoTip text={text("Notes are for the collection owner.", "الملاحظات خاصة بمالك المجموعة.")}/></span><textarea className="wd-input min-h-[50px] w-full resize-y" value={notes} onChange={e=>setNotes(e.target.value)} placeholder={text("Notes", "ملاحظات")}/></label>
          <div><span className={fieldLabel}>{text("Folder location to store uploaded files", "موقع المجلد لحفظ الملفات المرفوعة")}</span><div className="flex min-h-[50px] items-center gap-2 rounded-xl border border-slate-200 px-3 py-2"><span className="text-slate-500">▱</span><span className="min-w-0 flex-1 truncate text-[12px] text-slate-600">{folderName||text("Select a folder", "اختر مجلداً")}</span><button type="button" onClick={openPicker} className="shrink-0 px-1 text-[12px] font-medium text-[var(--wd-primary)] hover:underline">{text("Change", "تغيير")}</button></div></div>
          {type==="EXTERNAL"&&<div><span className={fieldLabel}>{text("Request user data", "طلب بيانات المستخدم") } <InfoTip text={text("Choose which details the uploader must provide.", "حدد البيانات التي يجب على رافع الملفات إدخالها.")}/></span><div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 px-3 py-2"><label className="flex items-center gap-1.5 text-[12px]"><input className={check} type="checkbox" checked={collectName} onChange={e=>setCollectName(e.target.checked)}/>{text("Name", "الاسم")}</label><label className="flex items-center gap-1.5 text-[12px]"><input className={check} type="checkbox" checked={collectPhone} onChange={e=>setCollectPhone(e.target.checked)}/>{text("Phone", "الهاتف")}</label><label className="flex items-center gap-1.5 text-[12px]"><input className={check} type="checkbox" checked={collectEmail} onChange={e=>setCollectEmail(e.target.checked)}/>{text("Email", "البريد الإلكتروني")}</label></div></div>}
          <label className={checkRow}><input className={check} type="checkbox" checked={separateFolder} onChange={e=>setSeparateFolder(e.target.checked)}/><span>{text("Create a separate folder for every unique user based on their name", "إنشاء مجلد منفصل لكل مستخدم فريد بناءً على اسمه")}　<InfoTip text={text("Uploaded files are placed in a user-specific folder inside the selected destination.", "توضع الملفات المرفوعة في مجلد خاص بالمستخدم داخل موقع الحفظ المحدد.")}/></span></label>
          {type==="EXTERNAL"&&<div className="space-y-1"><label className={checkRow}><input className={check} type="checkbox" checked={maxFilesEnabled} onChange={e=>setMaxFilesEnabled(e.target.checked)}/><span>{text("Set a limit on the number of files each user can upload", "تحديد عدد الملفات التي يمكن لكل مستخدم رفعها")} <span className="text-slate-500">({text("default: no limit", "الافتراضي: بلا حد")})</span> <InfoTip text={text("Maximum number of files accepted for this collection.", "العدد الأقصى للملفات المقبولة في هذه المجموعة.")}/></span></label>{maxFilesEnabled&&<div className="relative ms-6 w-40"><button type="button" onClick={()=>setMaxFilesMenuOpen(v=>!v)} className="wd-pill wd-pill-record flex w-full items-center justify-between" aria-expanded={maxFilesMenuOpen}><span>{maxFiles}</span><span>⌄</span></button>{maxFilesMenuOpen&&<div className="wd-menu absolute start-0 top-full z-[260] mt-1 w-full">{[1,5,10,20,50,100,250,500,1000].map(n=><button key={n} type="button" className="wd-menu-item" data-active={maxFiles===n} onClick={()=>{setMaxFiles(n);setMaxFilesMenuOpen(false);}}>{n}</button>)}</div>}</div>}</div>}
          <div className="space-y-1"><label className={checkRow}><input className={check} type="checkbox" checked={sizeLimitEnabled} onChange={e=>setSizeLimitEnabled(e.target.checked)}/><span>{text("Set a limit on upload size", "تحديد الحد الأقصى لحجم الملف")} <span className="text-slate-500">({text("default: 100 MB", "الافتراضي: 100 ميجابايت")})</span> <InfoTip text={text("Maximum size allowed for each uploaded file.", "أقصى حجم مسموح به لكل ملف مرفوع.")}/></span></label>{sizeLimitEnabled&&<div className="relative ms-6 w-40"><button type="button" onClick={()=>setSizeMenuOpen(v=>!v)} className="wd-pill wd-pill-record flex w-full items-center justify-between" aria-expanded={sizeMenuOpen}><span>{selectedSizeLabel}</span><span>⌄</span></button>{sizeMenuOpen&&<div className="wd-menu absolute start-0 top-full z-[260] mt-1 w-full">{SIZE_OPTIONS.map(o=><button key={o.value} type="button" className="wd-menu-item" data-active={maxFileSizeBytes===o.value} onClick={()=>{setMaxFileSizeBytes(o.value);setSizeMenuOpen(false);}}>{o.label}</button>)}</div>}</div>}</div>
          <div className="space-y-1"><label className={checkRow}><input className={check} type="checkbox" checked={expiryEnabled} onChange={e=>setExpiryEnabled(e.target.checked)}/><span>{text("Set expiration", "تحديد تاريخ انتهاء الصلاحية")} <InfoTip text={text("The collection link stops accepting uploads after this date.", "يتوقف رابط المجموعة عن قبول الملفات بعد هذا التاريخ.")}/></span></label>{expiryEnabled&&<div className="ms-6"><input aria-label={text("Expiration date", "تاريخ الانتهاء")} type="datetime-local" className="wd-input max-w-[250px]" value={expiresAt} onChange={e=>setExpiresAt(e.target.value)} min={new Date().toISOString().slice(0,16)}/></div>}</div>
          {type==="INTERNAL"&&<label className={checkRow}><input className={check} type="checkbox" checked={sameNameAsVersion} onChange={e=>setSameNameAsVersion(e.target.checked)}/><span>{text("Upload files with the same name as versions to an existing file", "رفع الملفات التي تحمل الاسم نفسه كإصدارات لملف موجود")} <InfoTip text={text("Use the existing file's version history when the name matches.", "استخدم سجل إصدارات الملف الموجود عند تطابق الاسم.")}/></span></label>}
          <label className={checkRow}><input className={check} type="checkbox" checked={notifyOnSubmission} onChange={e=>setNotifyOnSubmission(e.target.checked)}/><span>{text("Notify me by email and in the app on every user submission", "إشعاري بالبريد وفي التطبيق عند كل عملية إرسال")}</span></label>
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" className="wd-secondary-button" onClick={()=>setShow(false)}>{text("Cancel", "إلغاء")}</button><button type="button" className="wd-primary-button min-w-16 disabled:cursor-not-allowed disabled:opacity-50" disabled={!name.trim()||!folderId||creating||(expiryEnabled&&!expiresAt)} onClick={()=>void create()}>{creating?text("Creating…", "جارٍ الإنشاء…"):text("Create", "إنشاء")}</button></div>
      </section>
    </div>}

    {linkCollection&&<div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setLinkCollection(null);}}><section dir={ar?"rtl":"ltr"} role="dialog" aria-modal="true" className="w-full max-w-[470px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"><header className="flex items-center justify-between px-6 py-4"><h2 className="text-[17px] font-semibold">{text("Collect Files", "جمع الملفات")} ▣ {linkCollection.name}</h2><button onClick={()=>setLinkCollection(null)} className="text-xl text-slate-500">×</button></header><div className="px-6 pb-5"><p className="mb-3 text-[13px] text-slate-600">{text("Copy and share this collection link", "انسخ رابط المجموعة وشاركه") } ↗</p><div className="flex overflow-hidden rounded-xl border border-slate-300"><input readOnly value={linkBusy?text("Generating link…","جارٍ إنشاء الرابط…"):linkUrl} className="min-w-0 flex-1 px-3 py-2 text-[12px]" dir="ltr"/><button disabled={!linkUrl} onClick={()=>void navigator.clipboard.writeText(linkUrl)} className="border-s border-slate-300 px-4 text-[12px] text-blue-700 disabled:opacity-40">{text("Copy","نسخ")}</button></div><p className="mt-3 text-[11px] text-slate-500">{text("Created by you", "أنشأتها أنت")} · {new Date(linkCollection.createdAt).toLocaleString(ar?"ar":"en")}</p><div className="mt-4 border-t border-slate-100 pt-4"><p className="mb-2 text-[13px] font-medium text-slate-800">{text("Email collection link", "إرسال رابط المجموعة بالبريد")}</p><textarea className="wd-input min-h-[64px] w-full" value={emailTo} onChange={e=>setEmailTo(e.target.value)} placeholder={text("Add email addresses, separated by commas", "أضف عناوين البريد، مفصولة بفواصل")}/><textarea className="wd-input mt-2 min-h-[64px] w-full" value={emailMessage} onChange={e=>setEmailMessage(e.target.value)} placeholder={text("Add a message (optional)", "أضف رسالة (اختياري)")} maxLength={2000}/>{emailNotice&&<p className="mt-2 text-[12px] text-slate-600">{emailNotice}</p>}</div></div><footer className="flex items-center justify-between border-t border-slate-100 px-6 py-4"><button onClick={()=>void sendCollectionEmail()} disabled={!linkUrl||emailBusy||!emailTo.trim()} className="text-[12px] font-medium text-blue-700 disabled:opacity-40">{emailBusy?text("Sending…","جارٍ الإرسال…"):text("Send email","إرسال البريد")}</button><button onClick={()=>{setLinkCollection(null);openSettings(linkCollection);}} className="text-[12px] font-medium text-blue-700">{text("Link Settings","إعدادات الرابط")}</button></footer></section></div>}
    {settings&&<div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/50 p-4"><section dir={ar?"rtl":"ltr"} role="dialog" aria-modal="true" className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl"><header className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold">{text("Collection settings","إعدادات المجموعة")}</h2><button onClick={()=>setSettings(null)} className="text-xl text-slate-500">×</button></header><div className="space-y-4"><label className="block text-[12px]">{text("Collection name","اسم المجموعة")}<input className="wd-input mt-1 w-full" value={settingsName} onChange={e=>setSettingsName(e.target.value)}/></label><label className="block text-[12px]">{text("Description","الوصف")}<textarea className="wd-input mt-1 w-full" value={settingsDescription} onChange={e=>setSettingsDescription(e.target.value)}/></label><label className="block text-[12px]">{text("Expiration","تاريخ الانتهاء")}<input type="datetime-local" className="wd-input mt-1 w-full" value={settingsExpires} onChange={e=>setSettingsExpires(e.target.value)}/></label><p className="text-[11px] text-slate-500">{text("Changing link settings does not change the destination folder.","تغيير إعدادات الرابط لا يغير مجلد الوجهة.")}</p></div><footer className="mt-6 flex justify-end gap-2"><button className="wd-secondary-button" onClick={()=>setSettings(null)}>{text("Cancel","إلغاء")}</button><button className="wd-primary-button" disabled={!settingsName.trim()||settingsBusy} onClick={()=>void saveSettings()}>{settingsBusy?text("Saving…","جارٍ الحفظ…"):text("Save","حفظ")}</button></footer></section></div>}
    {detail&&<div className="fixed inset-0 z-[230] flex flex-col bg-white" dir={ar?"rtl":"ltr"}><header className="flex min-h-[76px] items-center gap-3 border-b border-slate-200 px-4 sm:px-7"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">▣</span><div className="min-w-0 flex-1"><h2 className="truncate text-[14px] font-semibold">{detail.name}</h2><p className="text-[11px] text-slate-500">{text("Created by you on","أنشأتها في")} {new Date(detail.createdAt).toLocaleString(ar?"ar":"en")}</p></div><button onClick={()=>void openSubmissions(detail)} className="flex items-center gap-2 rounded-full bg-blue-500 px-3 py-2 text-[11px] text-white"><span>↑</span>{detail.submissionsCount} {text("users submitted","مستخدم أرسل")}</button><span className="hidden items-center gap-2 rounded-full bg-blue-500 px-3 py-2 text-[11px] text-white sm:flex">▤ {detail.filesCount} {text("files uploaded","ملف مرفوع")}</span><button onClick={()=>setDetail(null)} className="ms-2 text-2xl text-slate-500">×</button></header><div className="flex justify-end p-4"><button onClick={()=>{window.location.href=detail.folder.id?`/files/${encodeURIComponent(detail.folder.id)}`:"/files";}} className="wd-primary-button">{text("Open folder","فتح المجلد")}</button></div><div className="flex flex-1 items-center justify-center text-center text-[13px] text-slate-500">{detail.submissionsCount===0?text("No user submissions made yet","لم يتم استلام أي ملفات بعد"):text("Select the submissions count to review received files","اختر عدد الإرسالات لمراجعة الملفات المستلمة")}</div></div>}

    {pickerOpen&&<div className="fixed inset-0 z-[270] flex items-center justify-center bg-slate-950/55 p-2 sm:p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setPickerOpen(false);}}><section dir={ar?"rtl":"ltr"} className="flex h-[min(82dvh,720px)] w-[min(820px,98vw)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="collection-folder-picker-title">
      <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4"><h3 id="collection-folder-picker-title" className="min-w-0 flex-1 text-[17px] font-semibold">{text("Choose destination folder", "اختيار مجلد الوجهة")}</h3><div className="hidden w-52 sm:block"><input className="wd-input !py-2" value={pickerSearch} onChange={e=>setPickerSearch(e.target.value)} placeholder={text("Search", "بحث")}/></div><button type="button" onClick={()=>setPickerOpen(false)} className="h-8 w-8 rounded-lg text-xl text-slate-500 hover:bg-slate-100" aria-label={text("Close", "إغلاق")}>×</button></header>
      <div className="grid min-h-0 flex-1 grid-cols-[190px_minmax(0,1fr)] sm:grid-cols-[265px_minmax(0,1fr)]"><aside className="overflow-y-auto border-e border-slate-200 p-3"><button type="button" onClick={()=>void loadPicker(null,[])} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-start text-[12px] ${!pickerFolderId?"bg-blue-100 font-semibold text-blue-900":"text-slate-700 hover:bg-slate-50"}`}><span>▱</span>{text("My Folders", "ملفاتي")}</button><div className="mt-4 text-[11px] font-semibold text-slate-500">{text("Current path", "المسار الحالي")}</div><div className="mt-2 space-y-1">{pickerPath.map((f,i)=><button key={f.id} type="button" onClick={()=>void loadPicker(f.id,pickerPath.slice(0,i+1))} className={`block w-full truncate rounded-lg px-3 py-2 text-start text-[11px] ${i===pickerPath.length-1?"bg-slate-100 font-semibold":"text-slate-600 hover:bg-slate-50"}`}>📁 {f.name}</button>)}</div></aside>
        <div className="flex min-h-0 flex-col"><div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-[11px] text-slate-500"><button type="button" onClick={()=>void loadPicker(null,[])} className="font-medium text-[var(--wd-primary)]">WorkDrive</button>{pickerPath.map((f,i)=><span key={f.id} className="flex min-w-0 items-center gap-2"><span>›</span><button type="button" onClick={()=>void loadPicker(f.id,pickerPath.slice(0,i+1))} className="max-w-32 truncate hover:underline">{f.name}</button></span>)}</div>
        {pickerError&&<div className="m-3 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">{pickerError}</div>}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{pickerLoading?<div className="p-10 text-center text-sm text-slate-500">{text("Loading folders…", "جارٍ تحميل المجلدات…")}</div>:visiblePickerFolders.length===0?<div className="p-10 text-center text-sm text-slate-500">{pickerSearch?text("No matching folders.", "لا توجد مجلدات مطابقة."):text("No folders in this location.", "لا توجد مجلدات في هذا الموقع.")}</div>:<div className="space-y-1">{visiblePickerFolders.map(f=><div key={f.id} className="flex items-center gap-2 rounded-xl border border-transparent hover:border-slate-100 hover:bg-slate-50"><button type="button" onClick={()=>navigatePicker(f)} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-start"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-lg text-blue-600">📁</span><span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-700">{f.name}</span><span className="text-slate-400">›</span></button><button type="button" onClick={()=>{setFolderId(f.id);setFolderName(f.name);setPickerOpen(false);}} className="me-2 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] text-slate-600 hover:border-blue-300 hover:bg-blue-50">{text("Select", "اختيار")}</button></div>)}</div>}</div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3"><button type="button" onClick={()=>setNewFolderOpen(true)} className="rounded-lg border border-blue-200 px-3 py-2 text-[11px] font-medium text-blue-800 hover:bg-blue-50">＋ {text("New Folder", "مجلد جديد")}</button><div className="flex gap-2"><button type="button" onClick={()=>setPickerOpen(false)} className="wd-secondary-button">{text("Cancel", "إلغاء")}</button><button type="button" onClick={chooseCurrentFolder} className="wd-primary-button">{text("Choose", "اختيار")}</button></div></div>
      </div></div>
      {newFolderOpen&&<div className="fixed inset-0 z-[290] flex items-center justify-center bg-black/40 p-4"><section dir={ar?"rtl":"ltr"} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"><h4 className="mb-3 text-base font-semibold">{text("Create new folder", "إنشاء مجلد جديد")}</h4><label className="mb-4 block text-[12px]">{text("Folder name", "اسم المجلد")}<input autoFocus className="wd-input mt-1 w-full" value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void addFolder();}}/></label><div className="flex justify-end gap-2"><button className="wd-secondary-button" onClick={()=>setNewFolderOpen(false)}>{text("Cancel", "إلغاء")}</button><button className="wd-primary-button" disabled={!newFolderName.trim()||creatingFolder} onClick={()=>void addFolder()}>{creatingFolder?text("Creating…", "جارٍ الإنشاء…"):text("Create", "إنشاء")}</button></div></section></div>}
    </section></div>}
  </main>;
}

function InfoTip({text}:{text:string}) { return <span className="relative ms-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-400 text-[10px] font-semibold leading-none text-slate-500" title={text} aria-label={text}>i</span>; }
