"use client";

import { useState } from "react";
import { useLocale } from "./locale-provider";
import { Modal } from "./modal";
import { friendlyErrorMessageKey } from "../lib/friendly-error";

export function DeleteModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const { label } = useLocale();
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    try {
      await onConfirm();
      onClose();
    } catch (cause) {
      setError(label(friendlyErrorMessageKey(cause)));
    }
  }

  return (
    <Modal title={label("files.delete")} onClose={onClose}>
      <div className="text-[length:var(--imkan-font-size-ui)]">
        <p className="mb-3 text-[length:var(--imkan-font-size-secondary)]">
          {label("files.deleteConfirm")}
        </p>
        {error ? <p className="mb-3">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="imkan-button-secondary" onClick={onClose}>{label("share.cancel")}</button>
          <button type="button" className="imkan-button-destructive" onClick={() => void confirm()}>{label("files.delete")}</button>
        </div>
      </div>
    </Modal>
  );
}
