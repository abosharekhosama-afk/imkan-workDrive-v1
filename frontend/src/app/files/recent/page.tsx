"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "../../../components/locale-provider";
import { AlertBanner } from "../../../components/alert-banner";
import { EmptyState } from "../../../components/empty-state";
import { SkeletonLoader } from "../../../components/skeleton-loader";
import { listRecent, type RecentRecord } from "../../../lib/api/recent";

export default function RecentPage() {
  const { label } = useLocale(); const [items, setItems] = useState<RecentRecord[]>([]); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { setLoading(true); setError(null); setItems(await listRecent()); } catch { setError(label("error.generic")); } finally { setLoading(false); } }, [label]);
  useEffect(() => { void load(); }, [load]);
  return <section className="imkan-page"><header><h1 className="imkan-heading">{label("nav.recent")}</h1><p className="imkan-muted">{label("files.recentDescription")}</p></header>{error ? <AlertBanner message={error} action={<button type="button" className="imkan-button-secondary" onClick={() => void load()}>{label("feedback.retry")}</button>} /> : null}{loading ? <SkeletonLoader rows={4} columns={3} /> : items.length === 0 ? <EmptyState title={label("nav.recent")} description={label("files.recentEmpty")} /> : <div className="imkan-panel overflow-x-auto"><table className="imkan-table min-w-[34rem]"><thead><tr className="imkan-table-row"><th className="px-3 py-2 text-start">{label("files.column.name")}</th><th className="px-3 py-2 text-start">{label("files.column.type")}</th><th className="px-3 py-2 text-start">{label("files.recentAccessed")}</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="imkan-table-row"><td className="px-3 py-2">{item.resourceType === "FOLDER" ? <Link href={`/files/${item.resourceId}`} className="imkan-focusable rounded-sm">{item.name}</Link> : item.name}</td><td className="px-3 py-2">{item.resourceType === "FOLDER" ? label("files.type.folder") : label("files.type.file")}</td><td className="px-3 py-2">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.accessedAt))}</td></tr>)}</tbody></table></div>}</section>;
}
