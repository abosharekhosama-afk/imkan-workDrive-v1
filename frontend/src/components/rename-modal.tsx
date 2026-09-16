"use client";

import { useState, type FormEvent } from "react";
import { useLocale } from "./locale-provider";
import { Modal } from "./modal";
import { friendlyErrorMessageKey } from "../lib/friendly-error";

export function RenameModal({
  currentName,
  onClose,
  onSubmit,
}: {
  currentName: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const { label } = useLocale();
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onSubmit(name);
      onClose();
    } catch (cause) {
      setError(label(friendlyErrorMessageKey(cause)));
    }
  }

  return (
    <Modal title={label("files.rename")} onClose={onClose}>
      <form onSubmit={submit} className="text-[length:var(--imkan-font-size-ui)]">
        <label className="mb-3 flex flex-col gap-1">
          {label("files.folderName")}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="imkan-input"
          />
        </label>
        {error ? <p className="mb-3">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="imkan-button-secondary" onClick={onClose}>{label("share.cancel")}</button>
          <button type="submit" className="imkan-button">{label("files.rename")}</button>
        </div>
      </form>
    </Modal>
  );
}
