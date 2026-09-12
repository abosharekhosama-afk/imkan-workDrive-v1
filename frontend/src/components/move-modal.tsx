"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale } from "./locale-provider";
import { Modal } from "./modal";
import { createFolder, getFolder, listRootContents } from "../lib/api/folders";
import { friendlyErrorMessageKey } from "../lib/friendly-error";
import { Icons } from "./layout/icons";

interface MoveModalProps {
  resourceName: string;
  mode?: "move" | "copy";
  onClose: () => void;
  onMove: (destinationFolderId: string | null) => Promise<void>;
}

type FlatFolder = { id: string; name: string; depth: number };

const SIDEBAR_ITEMS = [
  { key: "all", labelKey: "files.allFiles", icon: "folder" as const },
  { key: "favorites", labelKey: "nav.favorites", icon: "star" as const },
  { key: "myFolders", labelKey: "files.myFolders", icon: "folder" as const },
  { key: "sharedWithMe", labelKey: "nav.sharedWithMe", icon: "share" as const },
  { key: "teamFolders", labelKey: "nav.teamFolders", icon: "users" as const },
];

export function MoveModal({ resourceName, mode = "move", onClose, onMove }: MoveModalProps) {
  const { label } = useLocale();
  const [options, setOptions] = useState<FlatFolder[] | null>(null);
  const [destination, setDestination] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSection, setActiveSection] = useState<string>("all");

  const loadTree = async () => {
    try {
      const root = await listRootContents();
      const entries: FlatFolder[] = [];

      const walk = async (folders: Array<{ id: string; name: string }>, depth: number): Promise<void> => {
        for (const folder of folders) {
          entries.push({ id: folder.id, name: folder.name, depth });
          try {
            const detail = await getFolder(folder.id);
            if (detail.folders?.length) {
              await walk(detail.folders, depth + 1);
            }
          } catch {
            // تجاهل الخطأ في حالة المجلدات الفرعية المحمية
          }
        }
      };

      await walk(root.folders ?? [], 0);
      setOptions(entries);
    } catch {
      setError(label("error.generic"));
    }
  };

  useEffect(() => {
    void loadTree();
  }, []);

  async function createAndSelect() {
    const name = newName.trim();
    if (!name) return;
    try {
      setCreating(true);
      setError(null);
      const created = await createFolder(name, destination || undefined);
      setDestination(created.id);
      setNewName("");
      await loadTree();
    } catch (cause) {
      setError(label(friendlyErrorMessageKey(cause)));
    } finally {
      setCreating(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onMove(destination === "" ? null : destination);
      onClose();
    } catch (cause) {
      setError(label(friendlyErrorMessageKey(cause)));
    } finally {
      setSubmitting(false);
    }
  }

  const filteredOptions = options?.filter((o) => o.name.toLowerCase().includes(searchQuery.toLowerCase())) ?? [];

  return (
    <Modal title={`${label(mode === "copy" ? "menu.copyTo" : "files.moveTitle")} ${resourceName}`} onClose={onClose}>
      <form onSubmit={submit} className="text-[length:var(--imkan-font-size-ui)]">
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <Icons.search size={15} className="text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={label("search.placeholder")}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
          />
        </div>

        <div className="flex gap-4">
          <aside className="w-40 shrink-0 border-r border-slate-100">
            <nav className="flex flex-col gap-0.5">
              {SIDEBAR_ITEMS.map((item) => {
                const IconComponent = Icons[item.icon];
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveSection(item.key)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-start ${
                      activeSection === item.key
                        ? "bg-[var(--wd-primary-light)] font-medium text-[color:var(--wd-primary-ink)]"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {IconComponent ? (
                      <IconComponent
                        size={15}
                        className={activeSection === item.key ? "text-[color:var(--wd-primary)]" : "text-slate-400"}
                      />
                    ) : null}
                    {label(item.labelKey as never)}
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0 flex-1">
            <fieldset className="mb-3 flex max-h-48 flex-col gap-0.5 overflow-auto rounded-lg border border-slate-200 p-2">
              <label className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                <input
                  type="radio"
                  name="move-destination"
                  checked={destination === ""}
                  onChange={() => setDestination("")}
                  className="accent-[var(--wd-primary)]"
                />
                {label("files.rootFolder")}
              </label>

              {filteredOptions.map((option) => (
                <label
                  key={option.id}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
                    destination === option.id ? "bg-[var(--wd-primary-light)]" : "hover:bg-slate-50"
                  }`}
                  style={{ paddingInlineStart: 12 + option.depth * 20 }}
                >
                  <input
                    type="radio"
                    name="move-destination"
                    checked={destination === option.id}
                    onChange={() => setDestination(option.id)}
                    className="accent-[var(--wd-primary)]"
                  />
                  <Icons.folder size={13} className="shrink-0 text-[color:var(--wd-primary)]" />
                  <span className="truncate">{option.name}</span>
                </label>
              ))}
            </fieldset>

            <div className="mb-3 rounded-lg border border-dashed border-slate-300 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Icons.plus size={14} className="text-slate-400" />
                <span className="text-[13px] font-medium text-slate-700">{label("move.createNewFolder")}</span>
              </div>
              <div className="flex gap-2">
                <input
                  className="imkan-input flex-1"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={label("files.folderName")}
                />
                <button
                  type="button"
                  className="imkan-button-secondary"
                  disabled={creating || !newName.trim()}
                  onClick={() => void createAndSelect()}
                >
                  {creating ? "..." : label("common.create")}
                </button>
              </div>
            </div>
          </div>
        </div>

        {error ? <p className="mb-3 text-[13px] text-red-600">{error}</p> : null}

        <div className="flex items-center justify-between">
          <button
            type="button"
            className="flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-700"
            onClick={() => {
              /* التركيز على حقل إنشاء مجلد جديد */
            }}
          >
            <Icons.plus size={14} /> {label("files.newFolder")}
          </button>
          <div className="flex gap-2">
            <button type="button" className="imkan-button-secondary" onClick={onClose} disabled={submitting}>
              {label("share.cancel")}
            </button>
            <button
              type="submit"
              className="imkan-button !bg-[color:var(--wd-primary)] !text-white hover:!bg-[color:var(--wd-primary-dark)]"
              disabled={submitting || options === null}
            >
              {label(mode === "copy" ? "menu.copyTo" : "files.moveHere")}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}