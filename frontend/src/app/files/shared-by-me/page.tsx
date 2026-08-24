"use client";
import { useEffect, useState } from "react";
import { useLocale } from "../../../components/locale-provider";
import { listSharedByMe, type SharedItem } from "../../../lib/api/shared";

export default function SharedByMePage() {
  const { label } = useLocale();
  const [rows, setRows] = useState<SharedItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listSharedByMe()
      .then((v) => {
        if (active) setRows(v);
      })
      .catch(() => {
        if (active) setError(label("error.generic"));
      });
    return () => {
      active = false;
    };
  }, [label]);

  return (
    <section className="space-y-5">
      <div>
        <p className="imkan-meta">{label("nav.workspace")}</p>
        <h1 className="text-xl font-semibold">{label("shared.byMe")}</h1>
      </div>
      {error ? (
        <div className="imkan-alert">{error}</div>
      ) : (
        <div className="imkan-panel overflow-x-auto">
          <table className="imkan-table">
            <thead>
              <tr>
                <th className="px-3 py-2 text-start">{label("shared.resource")}</th>
                <th className="px-3 py-2 text-start">{label("shared.recipients")}</th>
                <th className="px-3 py-2 text-start">{label("shared.permission")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="imkan-table-row">
                  <td className="px-3 py-2">{r.resourceId}</td>
                  <td className="px-3 py-2">{r.recipients?.length ?? 0}</td>
                  <td className="px-3 py-2">{r.recipients?.[0]?.permission ?? "—"}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center imkan-muted">
                    {label("shared.noDirectShares")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}