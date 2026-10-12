"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../../../components/locale-provider";
import { ImkanOptionPicker } from "../../../components/imkan-option-picker";
import { listSharedByMe, updateShareRecipientPermission, type SharedItem } from "../../../lib/api/shared";

function statusBadge(status?: string): { className: string; text: string } {
  switch (status) {
    case "REVOKED":
      return { className: "wd-badge wd-badge-gray", text: "shared.revoked" };
    case "EXPIRED":
      return { className: "wd-badge wd-badge-red", text: "shared.expired" };
    default:
      return { className: "wd-badge wd-badge-green", text: "shared.active" };
  }
}

export default function SharedByMePage() {
  const { label } = useLocale();
  const [rows, setRows] = useState<SharedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listSharedByMe()
      .then((v) => {
        if (active) setRows(v);
      })
      .catch(() => {
        if (active) setError(label("error.generic"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [label]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif" }}>
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[color:var(--imkan-color-border)] bg-white px-3">
        <h1 className="text-[15px] font-semibold text-[#212121]">
          {label("shared.byMe")}
          {rows.length > 0 ? <span className="ms-2 text-[12px] font-medium text-slate-500">({rows.length})</span> : null}
        </h1>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 md:px-5">
        {error ? <div className="mt-3 rounded-lg bg-red-50 p-3 text-[12px] text-red-700" role="alert">{error}</div> : null}
        {loading ? (
          <div className="p-6 text-center text-[13px] text-slate-400">{label("common.loading")}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="text-[40px] text-slate-300" aria-hidden="true">↗</span>
            <h2 className="text-[15px] font-medium text-slate-800">{label("shared.byMe")}</h2>
            <p className="text-[13px] text-slate-500">{label("shared.empty")}</p>
          </div>
        ) : (
          <table className="w-full table-fixed border-collapse" style={{ fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif" }}>
            <thead>
              <tr className="border-b border-[color:var(--imkan-color-border)]">
                <th className="px-3 py-2 text-start text-[12px] font-medium text-slate-500">{label("shared.name")}</th>
                <th className="w-[28%] px-3 py-2 text-start text-[12px] font-medium text-slate-500">{label("shared.recipients")}</th>
                <th className="w-[14%] px-3 py-2 text-start text-[12px] font-medium text-slate-500">{label("shared.permission")}</th>
                <th className="w-[12%] px-3 py-2 text-start text-[12px] font-medium text-slate-500">{label("shared.status")}</th>
                <th className="w-[14%] px-3 py-2 text-start text-[12px] font-medium text-slate-500">{label("shared.expires")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const badge = statusBadge(r.status);
                return (
                  <tr key={r.id} className="border-b border-[color:var(--imkan-color-border)] hover:bg-slate-50">
                    <td className="px-3 py-2.5 truncate text-[13px] text-slate-800">{r.name ?? r.resourceId}</td>
                    <td className="px-3 py-2.5">
                      {r.recipients?.length ? (
                        <div className="flex flex-col gap-1">
                          {r.recipients.map((recipient) => {
                            const key = `${r.id}:${recipient.userId}`;
                            return (
                              <div key={key} className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-[12px] text-slate-600">{recipient.user?.name || recipient.user?.email || recipient.userId}</span>
                                <ImkanOptionPicker
                                  ariaLabel={`${recipient.user?.name || recipient.user?.email || recipient.userId} permission`}
                                  value={recipient.permission ?? r.permission ?? "VIEW"}
                                  disabled={updating === key}
                                  onChange={async (value) => {
                                    const next = value || "VIEW";
                                    setUpdating(key);
                                    try {
                                      await updateShareRecipientPermission(r.id, recipient.userId, next);
                                      setRows((current) => current.map((item) => item.id !== r.id ? item : ({
                                        ...item,
                                        recipients: item.recipients?.map((entry) => entry.userId === recipient.userId ? { ...entry, permission: next } : entry),
                                      })));
                                    } catch {
                                      setError(label("error.generic"));
                                    } finally {
                                      setUpdating(null);
                                    }
                                  }}
                                  options={["VIEW", "COMMENT", "EDIT", "ORGANIZE", "FULL_ACCESS"].map((value) => ({ value, label: value }))}
                                />
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-[12px] text-slate-500">{label("shared.publicLink")}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 truncate text-[13px] text-slate-600">
                      {r.recipients?.length ? label("shared.perRecipient") : (r.permission ?? "—")}
                    </td>
                    <td className="px-3 py-2.5 truncate text-[13px] text-slate-600">{label(badge.text as Parameters<typeof label>[0])}</td>
                    <td className="px-3 py-2.5 truncate text-[13px] text-slate-600">
                      {r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
