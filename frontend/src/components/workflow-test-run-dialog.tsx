"use client";

import { useEffect, useState } from "react";
import { getFolder, listRootContents } from "@/lib/api/folders";
import { startWorkflowTestRun } from "@/lib/api/workflows";
import type { FileRecord, FolderRecord } from "@/lib/api/types";

export function WorkflowTestRunDialog({
  workflowId,
  resourceType,
  ar,
  onClose,
  onStarted,
}: {
  workflowId: string;
  resourceType: "FILE" | "FOLDER";
  ar: boolean;
  onClose: () => void;
  onStarted: (runId: string) => void;
}) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState(ar ? "جذر WorkDrive" : "WorkDrive root");
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const load = async (id: string | null) => {
    setLoading(true); setError(""); setSelectedId(""); setSelectedName("");
    try {
      const data = id ? await getFolder(id) : await listRootContents();
      setFolders(data.folders ?? []);
      setFiles(data.files ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : (ar ? "تعذر تحميل محتوى WorkDrive." : "Unable to load WorkDrive contents."));
      setFolders([]); setFiles([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(null); }, []);

  const openFolder = (folder: FolderRecord) => {
    setFolderId(folder.id); setFolderName(folder.name); void load(folder.id);
  };
  const goRoot = () => { setFolderId(null); setFolderName(ar ? "جذر WorkDrive" : "WorkDrive root"); void load(null); };
  const choose = (id: string, name: string) => { setSelectedId(id); setSelectedName(name); };

  const start = async () => {
    if (!selectedId || starting) return;
    setStarting(true); setError("");
    try {
      const result = await startWorkflowTestRun(workflowId, {
        resourceId: selectedId,
        fileId: selectedId,
        resourceType,
        name: selectedName,
        mimeType: resourceType === "FILE" ? (files.find(f => f.id === selectedId)?.mimeType ?? "application/octet-stream") : undefined,
        fileType: resourceType === "FILE" ? (files.find(f => f.id === selectedId)?.fileType ?? "DOCUMENT") : undefined,
        extension: resourceType === "FILE" ? (files.find(f => f.id === selectedId)?.extension ?? "") : undefined,
        folderId,
      });
      onStarted(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : (ar ? "تعذر بدء الاختبار." : "Unable to start the test run."));
    } finally { setStarting(false); }
  };

  return <div className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
    <div className="w-[min(720px,96vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" dir={ar ? "rtl" : "ltr"}>
      <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
        <div><div className="text-[9px] font-semibold uppercase tracking-[.15em] text-[var(--wd-primary)]">{ar ? "تشغيل حقيقي" : "Real execution"}</div><h2 className="mt-1 text-[16px] font-semibold text-slate-900">{ar ? "اختبار سير العمل" : "Test workflow"}</h2><p className="mt-1 max-w-xl text-[10px] leading-5 text-slate-500">{ar ? "اختر ملفاً أو مجلداً موجوداً. سيُنشئ النظام Workflow Run حقيقياً وينفذ الإجراءات المكونة، وليس محاكاة." : "Choose an existing WorkDrive resource. This creates a real Workflow Run and executes the configured actions; it is not a simulation."}</p></div>
        <button type="button" onClick={onClose} className="h-8 w-8 rounded-lg text-slate-500 hover:bg-slate-100">×</button>
      </div>
      <div className="p-5">
        <div className="mb-3 flex items-center gap-2 text-[10px] text-slate-500"><button type="button" onClick={goRoot} className="font-semibold text-[var(--wd-primary)]">{ar ? "WorkDrive" : "WorkDrive"}</button>{folderId && <><span>›</span><span className="font-medium text-slate-700">{folderName}</span></>}</div>
        {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[10px] text-red-700">{error}</div>}
        <div className="max-h-[48vh] overflow-y-auto rounded-xl border border-slate-200">
          {loading ? <div className="p-10 text-center text-[10.5px] text-slate-500">{ar ? "جارٍ تحميل WorkDrive…" : "Loading WorkDrive…"}</div> : <>
            {folders.length > 0 && <div className="border-b border-slate-100"><div className="px-3 py-2 text-[8px] font-semibold uppercase tracking-[.14em] text-slate-400">{ar ? "مجلدات" : "Folders"}</div>{folders.map(folder => <button key={folder.id} type="button" onDoubleClick={() => openFolder(folder)} onClick={() => resourceType === "FOLDER" ? choose(folder.id, folder.name) : openFolder(folder)} className="flex w-full items-center gap-3 px-3 py-2.5 text-start hover:bg-slate-50"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">📁</span><span className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-slate-800">{folder.name}</span><span className="text-[9px] text-slate-400">›</span></button>)}</div>}
            {resourceType === "FILE" && <div><div className="px-3 py-2 text-[8px] font-semibold uppercase tracking-[.14em] text-slate-400">{ar ? "ملفات" : "Files"}</div>{files.map(file => <button key={file.id} type="button" onClick={() => choose(file.id, file.name)} className={`flex w-full items-center gap-3 border-t border-slate-100 px-3 py-2.5 text-start ${selectedId === file.id ? "bg-[var(--wd-primary-light)]" : "hover:bg-slate-50"}`}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">📄</span><span className="min-w-0 flex-1"><span className="block truncate text-[10.5px] font-medium text-slate-800">{file.name}</span><span className="text-[8.5px] text-slate-400">{file.mimeType || file.fileType || "File"}</span></span>{selectedId === file.id && <span className="text-[var(--wd-primary)]">✓</span>}</button>)}</div>}
                        {!folders.length && !files.length && <div className="p-10 text-center text-[10.5px] text-slate-500">{ar ? "لا توجد عناصر في هذا الموقع." : "No resources are available here."}</div>}
          </>}
        </div>
        {resourceType === "FOLDER" && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-[9.5px] text-slate-500">{ar ? "لاختبار Workflow للمجلدات، اختر مجلداً من القائمة بالضغط عليه." : "For folder workflows, choose a folder from the list by clicking it."}</div>}
        {selectedName && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10px] text-emerald-800">{ar ? "المورد المحدد:" : "Selected resource:"} <b>{selectedName}</b></div>}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4"><div className="text-[9px] text-slate-400">{ar ? "لن يبدأ الاختبار إلا بعد اختيار مورد." : "The test starts only after a resource is selected."}</div><div className="flex gap-2"><button type="button" onClick={onClose} className="wd-pill wd-pill-record">{ar ? "إلغاء" : "Cancel"}</button><button type="button" disabled={!selectedId || starting} onClick={() => void start()} className="wd-pill wd-pill-new disabled:opacity-40">{starting ? (ar ? "جارٍ التشغيل…" : "Starting…") : (ar ? "تشغيل الاختبار" : "Run test")}</button></div></div>
    </div>
  </div>;
}
