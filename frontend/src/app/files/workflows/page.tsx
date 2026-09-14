"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SecondarySidebar } from "@/components/layout/secondary-sidebar";
import { useLocale } from "@/components/locale-provider";
import { activateWorkflow, deactivateWorkflow, deleteWorkflow, duplicateWorkflow, listWorkflows, type Workflow } from "@/lib/api/workflows";
import { Icons } from "@/components/layout/icons";

type CreateMode = "MANUAL" | "AUTOMATIC";
type ResourceType = "FILE" | "FOLDER";

export default function WorkflowsPage() {
  const { label } = useLocale();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [rows, setRows] = useState<Workflow[]>([]);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<CreateMode>("MANUAL");
  const [resourceType, setResourceType] = useState<ResourceType>("FILE");
  const [draftName, setDraftName] = useState("new workflow");
  const [draftDescription, setDraftDescription] = useState("");

  const load = () => void listWorkflows(scope === "all" ? undefined : scope).then(setRows).catch(() => setRows([]));
  useEffect(load, [scope]);
  const visible = useMemo(() => rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())), [rows, q]);

  const openBuilder = () => {
    const qs = new URLSearchParams({ name: draftName.trim() || "new workflow", mode, resourceType });
    if (draftDescription.trim()) qs.set("description", draftDescription.trim());
    router.push(`/files/workflows/builder?${qs.toString()}`);
    setCreateOpen(false);
  };
  const toggle = async (r: Workflow) => { setBusy(r.id); try { const next = r.status === "ACTIVE" ? await deactivateWorkflow(r.id) : await activateWorkflow(r.id); setRows((all) => all.map((x) => x.id === r.id ? { ...x, ...next } : x)); } finally { setBusy(null); } };
  const remove = async (r: Workflow) => { if (!window.confirm(label("workflows.confirmDelete"))) return; setBusy(r.id); try { await deleteWorkflow(r.id); setRows((all) => all.filter((x) => x.id !== r.id)); } finally { setBusy(null); } };
  const duplicate = async (r: Workflow) => { setBusy(r.id); try { const copy = await duplicateWorkflow(r.id); setRows((all) => [copy, ...all]); } finally { setBusy(null); } };

  return <div className="flex min-h-0 flex-1 bg-white">
    <SecondarySidebar section="workflows" />
    <main className="min-w-0 flex-1 overflow-y-auto">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-7 py-5"><div><h1 className="text-[20px] font-semibold text-slate-900">Workflows</h1></div><div className="flex items-center gap-2"><button type="button" onClick={() => setCreateOpen(true)} className="rounded-full bg-[#1B66EA] px-5 py-2.5 text-[12px] font-semibold text-white">＋ New workflow</button><button type="button" className="rounded-full border border-slate-300 px-4 py-2.5 text-[12px]">↕ Last Modified ▾</button></div></header>
      <div className="px-7 py-4"><div className="flex items-center gap-3"><div className="flex w-[290px] items-center gap-2 rounded-full border border-slate-300 px-3 py-2"><Icons.search size={15}/><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by workflow name" className="min-w-0 flex-1 text-[12px] outline-none"/></div></div><div className="mt-5 rounded-xl border border-slate-300 bg-[#FAFAFA] px-5 py-4 text-[12px] leading-5 text-slate-700"><b className="mr-2">ⓘ</b> Automate routine, content-specific business processes and streamline your team's workflow. To get started, enable one of the default workflows below or create a custom workflow tailored to your team's needs.</div></div>
      <div className="px-7"><div className="grid grid-cols-[minmax(300px,1.8fr)_150px_220px_150px_100px] border-b border-slate-200 px-3 py-3 text-[11px] font-medium text-slate-500"><span>Name</span><span>Type</span><span>Last modified</span><span>Active records</span><span>Status</span></div>{visible.length === 0 ? <div className="p-10 text-center text-[12px] text-slate-400">No workflows found.</div> : visible.map((r) => <div key={r.id} className="grid grid-cols-[minmax(300px,1.8fr)_150px_220px_150px_100px] items-center border-b border-slate-100 px-3 py-4 text-[12px] hover:bg-slate-50"><div className="min-w-0"><div className="flex items-center gap-2"><span className="text-[18px] text-slate-700">♧</span><Link href={`/files/workflows/builder?id=${r.id}`} className="truncate font-medium text-slate-900 hover:text-[#1B66EA]">{r.name}</Link>{r.status === "ACTIVE" && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px]">Active</span>}</div><div className="ml-7 mt-1 text-[10.5px] text-slate-500">Created by you · {new Date(r.createdAt).toLocaleString()}</div></div><div>{r.resourceType === "FOLDER" ? "Folder-based" : "File-based"}</div><div className="text-slate-500">{new Date(r.updatedAt).toLocaleString()}</div><div className="text-emerald-600">0</div><div><button disabled={busy === r.id} type="button" onClick={() => void toggle(r)} className={`relative h-6 w-11 rounded-full ${r.status === "ACTIVE" ? "bg-[#2F6FEB]" : "bg-slate-200"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow ${r.status === "ACTIVE" ? "right-0.5" : "left-0.5"}`}/></button><div className="mt-2 flex gap-1"><button type="button" onClick={() => void duplicate(r)} className="text-[9px] text-slate-500">Copy</button><button type="button" onClick={() => void remove(r)} className="text-[9px] text-red-600">Delete</button></div></div></div>)}</div>
      <div className="px-7 py-4"><div className="flex gap-2">{[["all", "All workflows"], ["mine", "My workflows"], ["drafts", "Drafts"]].map(([v, t]) => <button key={v} type="button" onClick={() => setScope(v)} className={`rounded-lg px-3 py-2 text-[11px] ${scope === v ? "bg-[#EEF4FF] text-[#1B66EA]" : "border border-slate-200 text-slate-600"}`}>{t}</button>)}<Link href="/files/workflows/tasks" className="rounded-lg border border-slate-200 px-3 py-2 text-[11px]">Waiting for my action</Link><Link href="/files/workflows/runs" className="rounded-lg border border-slate-200 px-3 py-2 text-[11px]">Run history</Link></div></div>

      {createOpen && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4"><div className="w-[min(720px,94vw)] rounded-2xl bg-white p-7 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-[20px] font-semibold text-slate-900">Create Workflow</h2><button type="button" onClick={() => setCreateOpen(false)} className="text-[22px] text-slate-500">×</button></div><div className="mt-5 flex rounded-full border border-slate-300 p-0.5 w-fit"><button type="button" onClick={() => setMode("MANUAL")} className={`rounded-full px-5 py-2 text-[11px] ${mode === "MANUAL" ? "bg-[#EEF4FF] text-[#1B66EA]" : "text-slate-600"}`}>Manual</button><button type="button" onClick={() => setMode("AUTOMATIC")} className={`rounded-full px-5 py-2 text-[11px] ${mode === "AUTOMATIC" ? "bg-[#EEF4FF] text-[#1B66EA]" : "text-slate-600"}`}>Automatic</button></div><p className="mt-2 text-[11px] text-slate-600">{mode === "MANUAL" ? "This workflow must be started manually from a file/folder." : "This workflow starts automatically when matching events occur."}</p><label className="mt-5 block text-[11px] font-medium">Name<input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[12px]"/></label><label className="mt-3 block text-[11px] font-medium">Description <span className="font-normal text-slate-400">(Optional)</span><textarea value={draftDescription} onChange={(e) => setDraftDescription(e.target.value)} placeholder="Add a short description about the workflow" rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[12px]"/></label><div className="mt-4 text-[11px] font-medium">Type</div><div className="mt-2 grid grid-cols-2 gap-3"><button type="button" onClick={() => setResourceType("FILE")} className={`rounded-xl border p-4 text-start ${resourceType === "FILE" ? "border-[#1B66EA] bg-[#EEF4FF]" : "border-slate-300"}`}><div className="text-[12px] font-semibold">◉ File-based</div><p className="mt-1 text-[10.5px] leading-4 text-slate-600">Automate file-based events. Start a review, request changes, or save a copy after approval.</p></button><button type="button" onClick={() => setResourceType("FOLDER")} className={`rounded-xl border p-4 text-start ${resourceType === "FOLDER" ? "border-[#1B66EA] bg-[#EEF4FF]" : "border-slate-300"}`}><div className="text-[12px] font-semibold">▱ Folder-based</div><p className="mt-1 text-[10.5px] leading-4 text-slate-600">Automate folder-based events. Create folder hierarchy or send it for review and approval.</p></button></div><div className="mt-7 flex justify-end gap-2"><button type="button" onClick={() => setCreateOpen(false)} className="rounded-full border border-slate-300 px-5 py-2.5 text-[11px]">Cancel</button><button type="button" onClick={openBuilder} className="rounded-full bg-[#1B66EA] px-5 py-2.5 text-[11px] font-semibold text-white">Create</button></div></div></div>}
    </main>
  </div>;
}
