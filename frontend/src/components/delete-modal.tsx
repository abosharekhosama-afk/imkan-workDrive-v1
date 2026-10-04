"use client";

import { ConfirmActionModal } from "./confirm-action-modal";
import { useLocale } from "./locale-provider";

export function DeleteModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const { label, locale } = useLocale();
  return (
    <ConfirmActionModal
      title={locale === "ar" ? "نقل إلى سلة المهملات" : "Move to Trash"}
      description={locale === "ar" ? "سيتم نقل العنصر إلى سلة المهملات ويمكن استعادته لاحقًا وفق سياسة الاحتفاظ." : "The item will be moved to Trash and can be restored later according to the retention policy."}
      confirmLabel={label("files.delete")}
      cancelLabel={label("share.cancel")}
      onClose={onClose}
      onConfirm={onConfirm}
      tone="danger"
    />
  );
}
