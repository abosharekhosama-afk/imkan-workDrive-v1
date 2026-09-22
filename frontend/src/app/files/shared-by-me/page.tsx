"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../../../components/locale-provider";
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
    <div className="wd-page">
      <header className="wd-page-head">
        <div className="wd-page-head-titles">
          <h1>{label("shared.byMe")}</h1>
          <p>{label("nav.workspace")}</p>
        </div>
        {rows.length > 0 ? (
          <div className="wd-page-head-actions">
            <span className="wd-badge wd-badge-gray">
              <span className="wd-count-pill">{rows.length}</span> {label("shared.byMe")}
            </span>
          </div>
        ) : null}
      </header>

      {error ? <div className="wd-alert" role="alert">{error}</div> : null}

      {loading ? (
        <div className="wd-card" aria-busy="true">
          {[52, 40].map((width, index) => (
            <div key={index} className="wd-skel-row" style={{ paddingInline: 16 }}>
              <span className="wd-skel-bar" style={{ width: 30, height: 30 }} />
              <span className="wd-skel-bar flex-1" style={{ width: `${width}%` }} />
              <span className="wd-skel-bar" style={{ width: 110 }} />
            </div>
          ))}
          <span className="sr-only" role="status">{label("common.loading")}</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="wd-card">
          <div className="wd-empty">
            <span className="wd-empty-icon" aria-hidden="true">↗</span>
            <h2>{label("shared.byMe")}</h2>
            <p>{label("shared.noDirectShares")}</p>
          </div>
        </div>
      ) : (
        <div className="wd-card overflow-x-auto w-full max-w-full">
          <table className="wd-table min-w-[44rem]">
            <thead>
              <tr>
                <th>{label("shared.name")}</th>
                <th>{label("shared.recipients")}</th>
                <th>{label("shared.permission")}</th>
                <th>{label("shared.status")}</th>
                <th>{label("shared.expires")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const badge = statusBadge(r.status);
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="wd-name-cell">
                        <span className="icon" aria-hidden="true">⇄</span>
                        <span className="wd-name-link">{r.name ?? r.resourceId}</span>
                      </div>
                    </td>
                    <td>
                      {r.recipients && r.recipients.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {r.recipients.map((recipient) => {
                            const key = `${r.id}:${recipient.userId}`;
                            return (
                              <div key={recipient.userId} className="flex items-center gap-1">
                                <span className="wd-badge wd-badge-gray">
                                  {recipient.user?.name || recipient.user?.email || recipient.userId.slice(0, 8)}
                                </span>
                                <select
                                  aria-label={`${recipient.user?.name || recipient.user?.email || recipient.userId} permission`}
                                  value={recipient.permission ?? r.permission ?? "VIEW"}
                                  disabled={updating === key}
                                  className="wd-input !w-auto !min-w-20 !py-1 text-xs"
                                  onChange={async (event) => {
                                    const next = event.target.value;
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
                                >
                                  <option value="VIEW">VIEW</option>
                                  <option value="COMMENT">COMMENT</option>
                                  <option value="EDIT">EDIT</option>
                                  <option value="ORGANIZE">ORGANIZE</option>
                                  <option value="FULL_ACCESS">FULL_ACCESS</option>
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="wd-badge wd-badge-blue">{label("shared.publicLink")}</span>
                      )}
                    </td>
                    <td>
                      <span className="wd-badge wd-badge-gray">{r.recipients?.length ? label("shared.perRecipient") : (r.permission ?? "—")}</span>
                    </td>
                    <td>
                      <span className={badge.className}>{label(badge.text as Parameters<typeof label>[0])}</span>
                    </td>
                    <td className="imkan-muted">
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
  );
}
