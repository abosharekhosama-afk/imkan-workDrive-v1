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
  const { label, locale } = useLocale();
  const ar = locale === "ar";
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

  const permLabel = (value: string) => {
    if (value === "VIEW") return ar ? "عرض" : "View";
    if (value === "COMMENT") return ar ? "تعليق" : "Comment";
    if (value === "EDIT") return ar ? "تعديل" : "Edit";
    if (value === "ORGANIZE") return ar ? "تنظيم" : "Organize";
    if (value === "FULL_ACCESS") return ar ? "وصول كامل" : "Full access";
    return value;
  };

  return (
    <div
      className="shared-by-me-page flex min-h-0 flex-1 flex-col"
      style={{ fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif" }}
    >
      <div className="shared-by-me-head flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[color:var(--wd-line,var(--imkan-color-border))] bg-[var(--wd-bg,#fff)] px-3">
        <h1 className="text-[15px] font-semibold text-[color:var(--wd-text,#212121)]">
          {label("shared.byMe")}
          {rows.length > 0 ? (
            <span className="ms-2 text-[12px] font-medium text-[color:var(--wd-text-muted,#64748b)]">({rows.length})</span>
          ) : null}
        </h1>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 md:px-5">
        {error ? (
          <div className="mt-3 rounded-lg bg-red-50 p-3 text-[12px] text-red-700" role="alert">
            {error}
          </div>
        ) : null}
        {loading ? (
          <div className="p-6 text-center text-[13px] text-[color:var(--wd-text-muted)]">{label("common.loading")}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="text-[40px] text-[color:var(--wd-text-soft,#cbd5e1)]" aria-hidden="true">
              ↗
            </span>
            <h2 className="text-[15px] font-medium text-[color:var(--wd-text)]">{label("shared.byMe")}</h2>
            <p className="text-[13px] text-[color:var(--wd-text-muted)]">{label("shared.empty")}</p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto py-3">
            <table className="shared-by-me-table w-full min-w-[1000px] border-collapse">
              <thead>
                <tr className="border-b border-[color:var(--wd-line)]">
                  <th className="px-3 py-2.5 text-start text-[12px] font-medium text-[color:var(--wd-text-muted)]">
                    {label("shared.name")}
                  </th>
                  <th className="min-w-[240px] px-3 py-2.5 text-start text-[12px] font-medium text-[color:var(--wd-text-muted)]">
                    {label("shared.recipient")}
                  </th>
                  <th className="w-[140px] px-3 py-2.5 text-start text-[12px] font-medium text-[color:var(--wd-text-muted)]">
                    {label("shared.permission")}
                  </th>
                  <th className="w-[110px] px-3 py-2.5 text-start text-[12px] font-medium text-[color:var(--wd-text-muted)]">
                    {label("shared.status")}
                  </th>
                  <th className="w-[120px] px-3 py-2.5 text-start text-[12px] font-medium text-[color:var(--wd-text-muted)]">
                    {label("shared.expires")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const badge = statusBadge(r.status);
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-[color:var(--wd-line)] hover:bg-[var(--wd-hover,transparent)]"
                    >
                      <td className="max-w-[260px] px-3 py-3 align-top">
                        <div
                          className="truncate text-[13px] font-medium text-[color:var(--wd-text)]"
                          title={r.name ?? r.resourceId}
                        >
                          {r.name ?? r.resourceId}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[color:var(--wd-text-muted)]">{r.resourceType}</div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        {r.recipients?.length ? (
                          <div className="flex flex-col gap-2">
                            {r.recipients.map((recipient) => {
                              const key = `${r.id}:${recipient.userId}`;
                              return (
                                <div
                                  key={key}
                                  className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-[color:var(--wd-line)] bg-[var(--wd-panel-2,var(--wd-bg,#fff))] px-2.5 py-1.5"
                                >
                                  <span
                                    className="min-w-0 flex-1 truncate text-[12px] text-[color:var(--wd-text)]"
                                    title={recipient.user?.name || recipient.user?.email || recipient.userId}
                                  >
                                    {recipient.user?.name || recipient.user?.email || recipient.userId}
                                  </span>
                                  <div className="shrink-0">
                                    <ImkanOptionPicker
                                      ariaLabel={`${recipient.user?.name || recipient.user?.email || recipient.userId} permission`}
                                      value={recipient.permission ?? r.permission ?? "VIEW"}
                                      disabled={updating === key}
                                      onChange={async (value) => {
                                        const next = value || "VIEW";
                                        setUpdating(key);
                                        try {
                                          await updateShareRecipientPermission(r.id, recipient.userId, next);
                                          setRows((current) =>
                                            current.map((item) =>
                                              item.id !== r.id
                                                ? item
                                                : {
                                                    ...item,
                                                    recipients: item.recipients?.map((entry) =>
                                                      entry.userId === recipient.userId
                                                        ? { ...entry, permission: next }
                                                        : entry,
                                                    ),
                                                  },
                                            ),
                                          );
                                        } catch {
                                          setError(label("error.generic"));
                                        } finally {
                                          setUpdating(null);
                                        }
                                      }}
                                      options={["VIEW", "COMMENT", "EDIT", "ORGANIZE", "FULL_ACCESS"].map((value) => ({
                                        value,
                                        label: permLabel(value),
                                      }))}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-[12px] text-[color:var(--wd-text-muted)]">{label("shared.publicLink")}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top text-[13px] text-[color:var(--wd-text-muted)]">
                        {r.recipients?.length ? label("shared.perRecipient") : r.permission ?? "—"}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className={badge.className}>{label(badge.text as Parameters<typeof label>[0])}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 align-top text-[13px] text-[color:var(--wd-text-muted)]">
                        {r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
