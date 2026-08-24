"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "../../../components/locale-provider";
import { listFavorites, removeFavorite, type FavoriteRecord } from "../../../lib/api/favorites";
import { AlertBanner } from "../../../components/alert-banner";
import { EmptyState } from "../../../components/empty-state";
import { SkeletonLoader } from "../../../components/skeleton-loader";

export default function FavoritesPage() {
  const { label } = useLocale();
  const [items, setItems] = useState<FavoriteRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { setLoading(true); setError(null); setItems(await listFavorites()); } catch { setError(label("error.generic")); } finally { setLoading(false); } }, [label]);
  useEffect(() => { void load(); }, [load]);
  return <section className="imkan-page"><header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="imkan-heading">{label("nav.favorites")}</h1><p className="imkan-muted">{label("files.favoritesDescription")}</p></div></header>{error ? <AlertBanner message={error} action={<button type="button" className="imkan-button-secondary" onClick={() => void load()}>{label("feedback.retry")}</button>} /> : null}{loading ? <SkeletonLoader rows={4} columns={2} /> : items.length === 0 ? <EmptyState title={label("nav.favorites")} description={label("files.favoritesEmpty")} /> : <div className="imkan-panel overflow-x-auto"><table className="imkan-table min-w-[32rem]"><thead><tr className="imkan-table-row"><th className="px-3 py-2 text-start">{label("files.column.name")}</th><th className="px-3 py-2 text-start">{label("files.column.type")}</th><th className="px-3 py-2 text-end">{label("files.actions")}</th></tr></thead><tbody>{items.map((item) => <tr className="imkan-table-row" key={item.id}><td className="px-3 py-2">{item.resourceType === "FOLDER" ? <Link className="imkan-focusable rounded-sm" href={`/files/${item.resourceId}`}>{item.name}</Link> : item.name}</td><td className="px-3 py-2">{item.resourceType === "FOLDER" ? label("files.type.folder") : label("files.type.file")}</td><td className="px-3 py-2 text-end"><button type="button" className="imkan-button-secondary" onClick={async () => { await removeFavorite(item.resourceType, item.resourceId); await load(); }}>{label("files.unfavorite")}</button></td></tr>)}</tbody></table></div>}</section>;
}
