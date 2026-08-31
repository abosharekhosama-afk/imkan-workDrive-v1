"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale } from "./locale-provider";
import { Modal } from "./modal";
import { createFolder, getFolder, listRootContents } from "../lib/api/folders";
import { friendlyErrorMessageKey } from "../lib/friendly-error";

interface MoveModalProps { resourceName: string; onClose: () => void; onMove: (destinationFolderId: string | null) => Promise<void>; }
type FlatFolder = { id: string; name: string; depth: number };

export function MoveModal({ resourceName, onClose, onMove }: MoveModalProps) {
  const { label } = useLocale();
  const [options, setOptions] = useState<FlatFolder[] | null>(null);
  const [destination, setDestination] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadTree = async () => {
    const root = await listRootContents();
    const entries: FlatFolder[] = [];
    const walk = async (folders: Array<{id:string;name:string}>, depth: number): Promise<void> => {
      for (const folder of folders) {
        entries.push({ id: folder.id, name: folder.name, depth });
        const detail = await getFolder(folder.id);
        if (detail.folders?.length) await walk(detail.folders, depth + 1);
      }
    };
    await walk(root.folders ?? [], 0);
    setOptions(entries);
  };

  useEffect(() => { void loadTree().catch(() => setError(label("error.generic"))); }, [label]);

  async function createAndSelect() {
    const name = newName.trim(); if (!name) return;
    try {
      setCreating(true); setError(null);
      const created = await createFolder(name, destination || undefined);
      setDestination(created.id); setNewName(""); await loadTree();
    } catch (cause) { setError(label(friendlyErrorMessageKey(cause))); }
    finally { setCreating(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSubmitting(true); setError(null);
    try { await onMove(destination === "" ? null : destination); onClose(); }
    catch (cause) { setError(label(friendlyErrorMessageKey(cause))); }
    finally { setSubmitting(false); }
  }

  return <Modal title={label("files.moveTitle")} onClose={onClose}>
    <form onSubmit={submit} className="text-[length:var(--imkan-font-size-ui)]">
      <p className="mb-3 text-[length:var(--imkan-font-size-secondary)]">{resourceName}</p>
      <fieldset className="mb-3 max-h-64 overflow-auto rounded-lg border border-[color:var(--imkan-color-border)] p-2 flex flex-col gap-1">
        <legend className="px-1 text-[length:var(--imkan-font-size-secondary)]">{label("files.moveTo")}</legend>
        {options === null ? <p className="imkan-muted py-2">…</p> : <>
          <label className="flex items-center gap-2 py-1"><input type="radio" name="move-destination" checked={destination === ""} onChange={() => setDestination("")} />{label("files.rootFolder")}</label>
          {options.map((option) => <label key={option.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-[color:var(--imkan-color-surface)]" style={{ paddingInlineStart: 12 + option.depth * 20 }}><input type="radio" name="move-destination" checked={destination === option.id} onChange={() => setDestination(option.id)} />📁 {option.name}</label>)}
        </>}
      </fieldset>
      <div className="mb-3 rounded-lg border border-dashed border-[color:var(--imkan-color-border)] p-2">
        <div className="mb-1 text-sm font-medium">{label("move.createAndMove")}</div>
        <div className="flex gap-2"><input className="imkan-input flex-1" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={label("files.folderName")} /><button type="button" className="imkan-button-secondary" disabled={creating || !newName.trim()} onClick={() => void createAndSelect()}>{creating ? "…" : label("common.create")}</button></div>
      </div>
      {error ? <p className="mb-3 text-red-600">{error}</p> : null}
      <div className="flex justify-end gap-2"><button type="button" className="imkan-button-secondary" onClick={onClose} disabled={submitting}>{label("share.cancel")}</button><button type="submit" className="imkan-button" disabled={submitting || options === null}>{label("files.moveHere")}</button></div>
    </form>
  </Modal>;
}
