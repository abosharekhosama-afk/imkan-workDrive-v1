"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "../../../components/locale-provider";
import { createCollection, deleteCollection, listCollections, listCollectionSubmissions, updateCollection, type FileCollection, type CollectionSubmission } from "../../../lib/api/collections";
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
      setToken(result.token); setShow(false); resetForm(); await refresh();
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

  const visiblePickerFolders = useMemo(() => pickerFolders.filter(folder => folder.name.toLocaleLowerCase(ar ? "ar" : "en").includes(pickerSearch.trim().toLocaleLowerCase(ar ? "ar" : "en"))), [pickerFolders, pickerSearch, ar]);
  const selectedSizeLabel = useMemo(() => SIZE_OPTIONS.find(o => o.value === maxFileSizeBytes)?.label ?? "100 MB", [maxFileSizeBytes]);
  const text = (en: string, arabic: string) => ar ? arabic : en;
  const fieldLabel = "mb-1 block text-[13px] font-medium text-slate-700";
  const checkRow = "flex min-h-8 items-start gap-2.5 text-[12.5px] leading-6 text-slate-700";
  const check = "mt-1 h-4 w-4 shrink-0 accent-[var(--wd-primary)]";

  return <main className="wd-page" dir={ar ? "rtl" : "ltr"}>
    <header className="wd-page-head"><div className="wd-page-head-titles"><h1>{label("nav.collectFiles")}</h1><p>{text("Collect files from team members and external people into a selected WorkDrive folder.", "اجمع الملفات من أعضاء الفريق والأشخاص الخارجيين داخل مجلد محدد في WorkDrive.")}</p></div><button className="wd-primary-button" onClick={() => setShow(true)}>＋ {text("Create Collection", "إنشاء مجموعة تجميع")}</button></header>
    {error && <div className="wd-alert" role="alert">{error}</div>}
    {token && <div className="wd-alert" role="status">{text("Collection created. Save this one-time link token:", "تم إنشاء المجموعة. احتفظ برمز الرابط لمرة واحدة:")} <strong dir="ltr">{token}</strong> <button onClick={() => setToken("")}>{text("Dismiss", "إغلاق")}</button></div>}
    {loading ? <div className="wd-card p-6">{text("Loading collections…", "جارٍ تحميل المجموعات…")}</div> : rows.length === 0 ? <section className="wd-card"><div className="wd-empty"><div className="wd-empty-icon">⇧</div><h2>{text("No collections yet", "لا توجد مجموعات بعد")}</h2><p>{text("Create a collection to receive files from employees, clients, or suppliers.", "أنشئ مجموعة لاستلام الملفات من الموظفين أو العملاء أو الموردين.")}</p><button className="wd-primary-button" onClick={() => setShow(true)}>{text("Create Collection", "إنشاء مجموعة")}</button></div></section> : <div className="wd-card overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-start">{[text("Collection", "المجموعة"),text("Type", "النوع"),text("Destination", "الموقع"),text("Submissions", "الإرسالات"),text("Files", "الملفات"),text("Status", "الحالة"),text("Actions", "الإجراءات")].map(v=><th key={v} className="p-4 text-start">{v}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-b last:border-0"><td className="p-4"><strong>{r.name}</strong><div className="text-xs text-slate-500">{r.description}</div></td><td className="p-4">{r.type === "INTERNAL" ? text("Internal", "داخلي") : text("External", "خارجي")}</td><td className="p-4">{r.folder.name}</td><td className="p-4"><button className="underline" onClick={() => { setSelected(r); setSubmissionsLoading(true); void listCollectionSubmissions(r.id).then(setSubmissions).catch(e=>setError(e instanceof Error?e.message:text("Unable to load submissions", "تعذر تحميل الإرسالات"))).finally(()=>setSubmissionsLoading(false)); }}>{r.submissionsCount} · {text("View", "عرض")}</button></td><td className="p-4">{r.filesCount}</td><td className="p-4"><span className="wd-badge wd-badge-green">{r.status}</span></td><td className="p-4"><div className="flex gap-2"><button onClick={()=>void updateCollection(r.id,{status:r.status==="ACTIVE"?"DISABLED":"ACTIVE"}).then(refresh)}>{r.status==="ACTIVE"?text("Disable", "تعطيل"):text("Enable", "تفعيل")}</button><button className="text-red-600" onClick={()=>{if(confirm(text("Delete this collection?", "هل تريد حذف هذه المجموعة؟")))void deleteCollection(r.id).then(refresh);}}>{text("Delete", "حذف")}</button></div></td></tr>)}</tbody></table></div>}

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
          <label className={checkRow}><input className={check} type="checkbox" checked={notifyOnSubmission} onChange={e=>setNotifyOnSubmission(e.target.checked)}/><span>{text("Notify me on every user submission", "إشعاري عند كل عملية إرسال من المستخدمين")} <InfoTip text={text("Send a notification to the collection owner when files are submitted.", "إرسال إشعار إلى مالك المجموعة عند إرسال الملفات.")}/></span></label>
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" className="wd-secondary-button" onClick={()=>setShow(false)}>{text("Cancel", "إلغاء")}</button><button type="button" className="wd-primary-button min-w-16 disabled:cursor-not-allowed disabled:opacity-50" disabled={!name.trim()||!folderId||creating||(expiryEnabled&&!expiresAt)} onClick={()=>void create()}>{creating?text("Creating…", "جارٍ الإنشاء…"):text("Create", "إنشاء")}</button></div>
      </section>
    </div>}

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
