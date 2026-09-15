"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "../../../components/locale-provider";
import { listSharedWithMe, type SharedItem } from "../../../lib/api/shared";
import { fileIconSymbol } from "../../../components/file-icon-logic";

function permissionBadge(permission?: string): string {
  switch (permission) {
    case "EDIT":
    case "ORGANIZE":
    case "FULL_ACCESS":
      return "wd-badge wd-badge-blue";
    case "COMMENT":
      return "wd-badge wd-badge-amber";
    default:
      return "wd-badge wd-badge-gray";
  }
}

export default function SharedWithMePage() {
  const { label } = useLocale();
  const [rows, setRows] = useState<SharedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void listSharedWithMe()
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
          <h1>{label("shared.withMe")}</h1>
          <p>{label("nav.workspace")}</p>
        </div>
        {rows.length > 0 ? (
          <div className="wd-page-head-actions">
            <span className="wd-badge wd-badge-gray">
              <span className="wd-count-pill">{rows.length}</span> {label("shared.withMe")}
            </span>
          </div>
        ) : null}
      </header>

      {error ? <div className="wd-alert" role="alert">{error}</div> : null}

      {loading ? (
        <div className="wd-card" aria-busy="true">
          {[58, 44, 66].map((width, index) => (
            <div key={index} className="wd-skel-row" style={{ paddingInline: 16 }}>
              <span className="wd-skel-bar" style={{ width: 30, height: 30 }} />
              <span className="wd-skel-bar flex-1" style={{ width: `${width}%` }} />
              <span className="wd-skel-bar" style={{ width: 110 }} />
            </div>
          ))}
          <span className="sr-only" role="status">Loading</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="wd-card">
          <div className="wd-empty">
            <span className="wd-empty-icon" aria-hidden="true">⇄</span>
            <h2>{label("shared.withMe")}</h2>
            <p>{label("shared.noSharedItems")}</p>
          </div>
        </div>
      ) : (
        <div className="wd-card overflow-x-auto">
          <table className="wd-table min-w-[40rem]">
            <thead>
              <tr>
                <th>{label("shared.name")}</th>
                <th>{label("shared.owner")}</th>
                <th>{label("shared.permission")}</th>
                <th>{label("shared.expires")}</th>
                <th className="num"><span className="sr-only">{label("files.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="wd-name-cell">
                      <span className="icon" aria-hidden="true">
                        {fileIconSymbol(r.resourceType === "FOLDER" ? "folder" : "file")}
                      </span>
                      {r.resourceType === "FOLDER" ? (
                        <Link href={`/files/${r.resourceId}`} className="wd-name-link">
                          {r.name ?? r.resourceId}
                        </Link>
                      ) : (
                        <span className="wd-name-link">{r.name ?? r.resourceId}</span>
                      )}
                    </div>
                  </td>
                  <td className="imkan-muted">{r.owner?.name || r.owner?.email || "—"}</td>
                  <td>
                    <span className={permissionBadge(r.permission)}>{r.permission ?? "VIEW"}</span>
                  </td>
                  <td className="imkan-muted">
                    {r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="num">
                    {r.resourceType === "FOLDER" ? (
                      <Link href={`/files/${r.resourceId}`} className="wd-btn wd-btn-ghost wd-btn-sm">
                        {label("recent.open")}
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
