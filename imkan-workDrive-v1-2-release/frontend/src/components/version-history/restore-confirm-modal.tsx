"use client";

import { useState } from "react";
import { useLocale } from "../locale-provider";
import { Modal } from "../modal";

interface RestoreConfirmModalProps {
  versionNumber: number;
  fileName: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function RestoreConfirmModal({
  versionNumber,
  fileName,
  onConfirm,
  onCancel,
}: RestoreConfirmModalProps) {
  const { label } = useLocale();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsConfirming(true);
    setError(null);
    try {
      await onConfirm();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : label("error.generic"),
      );
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Modal
      title={label("versionHistory.restoreConfirmTitle")}
      onClose={onCancel}
      closeLabel={label("preview.close")}
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="text-center">
          <p className="text-[length:var(--imkan-font-size-ui)]">
            {label("versionHistory.restoreConfirmMessage").replace("{version}", String(versionNumber)).replace("{fileName}", fileName)}
          </p>
          <p className="text-sm text-[color:var(--imkan-color-muted)] mt-2">
            {label("versionHistory.restoreWarning")}
          </p>
        </div>

        {error && (
          <div className="p-3 bg-[color:var(--imkan-color-error)]/10 border border-[color:var(--imkan-color-error)] rounded-sm text-sm text-[color:var(--imkan-color-error)]">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="imkan-button-secondary"
            onClick={onCancel}
            disabled={isConfirming}
          >
            {label("share.cancel")}
          </button>
          <button
            type="button"
            className="imkan-button"
            onClick={handleConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? label("versionHistory.restoring") : label("versionHistory.restore")}
          </button>
        </div>
      </div>
    </Modal>
  );
}