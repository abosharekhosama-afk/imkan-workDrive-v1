"use client";
import { useEffect, useState } from "react";
import { useLocale } from "./locale-provider";
import { Modal } from "./modal";
import { createFolder, getFolder, listRootContents } from "../lib/api/folders";
import { friendlyErrorMessageKey } from "../lib/friendly-error";
import { Icons } from "./layout/icons";

type FlatFolder = { id: string; name: string; depth: number };

const SIDE_SECTIONS: Array<{ key: string; labelKey: string; icon: React.ReactNode }> = [
  { key: "favorites", labelKey: "files.favorite", icon: <Icons.star size={14} className="text-[color:var(--wd-primary)]" /> },
  { key: "myFolders", labelKey: "files.rootFolder", icon: <Icons.folder size={14} className="text-[color:var(--wd-primary)]" /> },
  { key: "shared", labelKey: "inspector.sharedWith", icon: <Icons.users size={14} className="text-[color:var(--wd-primary)]" /> },
  { key: "team", labelKey: "admin.teamFolders", icon: <Icons.inbox size={14} className="text-[color:var(--wd-primary)]" /> },
];

export function MoveModal({ resourceName, mode = "move", onClose, onMove }: {
  resourceName: string; mode?: "move" | "copy"; onClose: () => void; onMove: (destinationFolderId: string | null) => Promise<void>;
}) {
  const { label } = useLocale();
  const [folders, setFolders] = useState<FlatFolder[]>([]);
  const [destination, setDestination] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("myFolders");
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadTree = async () => {
    setLoading(true); setError(null);
    try {
      const root = await listRootContents();
      const entries: FlatFolder[] = [];
      const walk = async (list: Array<{ id: string; name: string }>, depth: number): Promise<void> => {
        for (const folder of list) {
          entries.push({ id: folder.id, name: folder.name, depth });
          try {
            const detail = await getFolder(folder.id);
            if (detail.folders?.length) await walk(detail.folders, depth + 1);
          } catch { /* skip unreadable subtree */ }
        }
      };
      await walk(root.folders ?? [], 0);
      setFolders(entries);
    } catch (cause) {
      setError(label(friendlyErrorMessageKey(cause)));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void loadTree(); }, [label]);

  const filtered = search.trim()
    ? folders.filter((f) => f.name.toLowerCase().includes(search.trim().toLowerCase()))
    : folders;

  async function createNewFolder() {
    const name = newName.trim(); if (!name) return;
    setCreating(true); setError(null);
    try {
      const created = await createFolder(name, destination ?? undefined);
      setDestination(created.id);
      setNewName("");
      await loadTree();
    } catch (cause) {
      setError(label(friendlyErrorMessageKey(cause)));
    } finally {
      setCreating(false);
    }
  }

  async function submit() {
    setSubmitting(true); setError(null);
    try { await onMove(destination); onClose(); }
    catch (cause) { setError(label(friendlyErrorMessageKey(cause))); }
    finally { setSubmitting(false); }
  }

  const title = mode === "copy" ? `${label("menu.copyTo")} ${resourceName}` : `${label("files.moveTitle")} ${resourceName}`;
return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-3" style={{ width: "min(92vw, 560px)" }}>
        <div className="relative">
          <Icons.search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={label("files.searchPlaceholder")}
            aria-label={label("files.search")}
            className="w-full rounded-[var(--wd-menu-radius)] border border-slate-200 bg-slate-50 py-2 pe-3 ps-9 text-[13px] text-slate-700 outline-none transition-colors focus:border-[color:var(--wd-primary)] focus:ring-2 focus:ring-[var(--wd-active)]"
          />
        </div>
        <div className="flex gap-2">
          <nav className="flex w-44 shrink-0 flex-col gap-0.5" aria-label={label("nav.details")}>
            {SIDE_SECTIONS.map((section) => (
              <button key={section.key} type="button" onClick={() => { setActiveSection(section.key); setSearch(""); }}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-start ${activeSection === section.key ? "bg-[var(--wd-primary-light)] font-medium text-[color:var(--wd-primary-ink)]" : "text-slate-600 hover:bg-slate-50"}`}>
                {section.icon}
                <span className="truncate">{label(section.labelKey as never)}</span>
              </button>
            ))}
          </nav>
          <div className="flex-1">
            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 p-1.5">
              <button type="button" onClick={() => setDestination(null)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-[13px] ${destination === null ? "bg-[var(--wd-primary-light)] font-medium text-[color:var(--wd-primary-ink)]" : "text-slate-700 hover:bg-slate-50"}`}>
                <Icons.folder size={14} className="shrink-0 text-[color:var(--wd-primary)]" />
                <span className="flex-1 truncate">{label("files.rootFolder")}</span>
                {destination === null ? <Icons.check size={13} className="text-[color:var(--wd-primary)]" /> : null}
              </button>
              {loading ? <p className="px-2.5 py-3 text-[13px] text-slate-400">...</p> : null}
              {!loading && filtered.length === 0 ? <p className="px-2.5 py-3 text-[13px] text-slate-400">{label("filter.all")}</p> : null}
              {!loading && filtered.length > 0 ? (
                <ul className="flex flex-col gap-0.5">
                  {filtered.map((folder) => {
                    const selected = destination === folder.id;
                    return (
                      <li key={folder.id}>
                        <button type="button" onClick={() => setDestination(folder.id)}
                          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-[13px] ${selected ? "bg-[var(--wd-primary-light)] font-medium text-[color:var(--wd-primary-ink)]" : "text-slate-700 hover:bg-slate-50"}`}
                          style={{ paddingInlineStart: 10 + folder.depth * 18 }}>
                          <Icons.folder size={14} className="shrink-0 text-[color:var(--wd-primary)]" />
                          <span className="flex-1 truncate">{folder.name}</span>
                          {selected ? <Icons.check size={13} className="text-[color:var(--wd-primary)]" /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
<div className="mt-2 flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void createNewFolder(); }}
            placeholder={label("files.newFolder")}
            aria-label={label("files.newFolder")}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-700 outline-none focus:border-[color:var(--wd-primary)] focus:ring-2 focus:ring-[var(--wd-active)]"
          />
          <button type="button" disabled={creating || !newName.trim()} onClick={() => void createNewFolder()}
            className="rounded-lg bg-[color:var(--wd-primary)] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[color:var(--wd-primary-dark)] disabled:opacity-50">
            {creating ? "..." : label("files.newFolder")}
          </button>
        </div>
    {error ? <p className="text-[13px] text-red-600">{error}</p> : null}
    <div className="flex items-center justify-center gap-2 border-t border-slate-100 pt-3">
      <button type="button" className="rounded-full border border-slate-200 px-4 py-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50" onClick={onClose} disabled={submitting}>{label("share.cancel")}</button>
      <button type="button" onClick={() => void submit()} disabled={submitting || loading}
        className="rounded-full bg-[color:var(--wd-primary)] px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[color:var(--wd-primary-dark)] disabled:opacity-50">
        {submitting ? "..." : label(mode === "copy" ? "menu.copyTo" : "files.moveHere")}
      </button>
    </div>
  </div>
  </Modal>
  );
}
