"use client";

import { useEffect, useState } from "react";
import { ZohoWorkdriveLayout } from "@/components/layout/zoho-workdrive-layout";
import { useLocale } from "@/components/locale-provider";
import { listSharedByMe, type SharedItem } from "@/lib/api/shared";
import { formatDateLocalized } from "@/lib/localized";
import { Icons } from "@/components/layout/icons";
import { FileIcon } from "@/components/file-icon";
import { Toast } from "@/components/toast";

export default function SharedLinksPage() {
  const { label, locale } = useLocale();
  const [links, setLinks] = useState<SharedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listSharedByMe()
      .then(setLinks)
      .catch(() => setLinks([]))
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = async (resourceId: string) => {
    const url = `${window.location.origin}/files/${resourceId}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast(label("share.copied"));
    } catch {
      setToast(label("error.generic"));
    }
  };

  return (
    <ZohoWorkdriveLayout>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[color:var(--imkan-color-border)] bg-white px-3">
          <h1 className="text-[15px] font-semibold text-[#212121]">
            {label("nav.sharedLinks")}
          </h1>
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new Event("workdrive:trigger-upload"));
            }}
            className="inline-flex items-center gap-1 rounded-md bg-[#1B66EA] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#1556C7]"
          >
            + {label("menu.newFolder")}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-[13px] text-slate-400">
              {label("common.loading")}
            </div>
          ) : links.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#EEF3FD] text-[#1B66EA]">
                <Icons.link size={30} />
              </span>
              <p className="text-[13.5px] text-slate-500">
                {label("shared.empty")}
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[color:var(--imkan-color-border)]">
                  <th className="px-3 py-2 text-start text-[12px] font-medium text-slate-500">
                    {label("files.column.name")}
                  </th>
                  <th className="px-3 py-2 text-start text-[12px] font-medium text-slate-500">
                    {label("files.column.owner")}
                  </th>
                  <th className="px-3 py-2 text-start text-[12px] font-medium text-slate-500">
                    {label("share.permission")}
                  </th>
                  <th className="px-3 py-2 text-start text-[12px] font-medium text-slate-500">
                    {label("share.expires")}
                  </th>
                  <th className="px-3 py-2 text-end text-[12px] font-medium text-slate-500">
                    {label("files.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {links.map((link) => (
                  <tr
                    key={link.id}
                    className="border-b border-[color:var(--imkan-color-border)] hover:bg-slate-50"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <FileIcon
                          kind={link.resourceType === "FOLDER" ? "folder" : "file"}
                          mimeType={link.mimeType}
                          name={link.name ?? ""}
                          label={label("files.type.file")}
                        />
                        <span className="truncate text-[13px] text-slate-800">
                          {link.name ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 truncate text-[13px] text-slate-600">
                      {link.owner?.name ?? link.owner?.email ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 truncate text-[13px] text-slate-600">
                      {link.permission ?? label("share.view")}
                    </td>
                    <td className="px-3 py-2.5 truncate text-[13px] text-slate-600">
                      {link.expiresAt
                        ? formatDateLocalized(link.expiresAt, locale)
                        : label("share.expiry.never")}
                    </td>
                    <td className="px-3 py-2.5 text-end">
                      <button
                        type="button"
                        onClick={() => handleCopy(link.resourceId)}
                        className="rounded-md px-2.5 py-1.5 text-[12.5px] text-[#1B66EA] hover:bg-[#EEF3FD]"
                      >
                        {label("share.copyLink")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </ZohoWorkdriveLayout>
  );
}