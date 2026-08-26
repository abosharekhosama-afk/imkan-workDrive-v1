"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "../../../components/locale-provider";
import { listFavorites, removeFavorite, type FavoriteRecord } from "../../../lib/api/favorites";
import { fileIconSymbol } from "../../../components/file-icon-logic";

export default function FavoritesPage() {
  const { label } = useLocale();
  const [items, setItems] = useState<FavoriteRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setItems(await listFavorites());
    } catch {
      setError(label("error.generic"));
    } finally {
      setLoading(false);
    }
  }, [label]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="wd-page">
      <header className="wd-page-head">
        <div className="wd-page-head-titles">
          <h1>
            ☆ {label("nav.favorites")}
            {items.length > 0 ? <span className="wd-count-pill ms-2 align-middle">{items.length}</span> : null}
          </h1>
          <p>{label("files.favoritesDescription")}</p>
        </div>
        <div className="wd-page-head-actions">
          <button type="button" className="wd-btn wd-btn-ghost" onClick={() => void load()} disabled={loading}>
            ⟳ {label("recent.refresh")}
          </button>
        </div>
      </header>

      {error ? <div className="wd-alert" role="alert">{error}</div> : null}

      {loading ? (
        <div className="wd-card" aria-busy="true">
          {[64, 48, 72].map((width, index) => (
            <div key={index} className="wd-skel-row" style={{ paddingInline: 16 }}>
              <span className="wd-skel-bar" style={{ width: 30, height: 30 }} />
              <span className="wd-skel-bar flex-1" style={{ width: `${width}%` }} />
              <span className="wd-skel-bar" style={{ width: 110 }} />
            </div>
          ))}
          <span className="sr-only" role="status">Loading</span>
        </div>
      ) : items.length === 0 ? (
        <div className="wd-card">
          <div className="wd-empty">
            <span className="wd-empty-icon" aria-hidden="true">☆</span>
            <h2>{label("nav.favorites")}</h2>
            <p>{label("files.favoritesEmpty")}</p>
          </div>
        </div>
      ) : (
        <div className="wd-card overflow-x-auto">
          <table className="wd-table min-w-[36rem]">
            <thead>
              <tr>
                <th>{label("files.column.name")}</th>
                <th>{label("files.column.type")}</th>
                <th className="num"><span className="sr-only">{label("files.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="wd-name-cell">
                      <span className="icon" aria-hidden="true">
                        {fileIconSymbol(item.resourceType === "FOLDER" ? "folder" : "file", undefined, item.name)}
                      </span>
                      {item.resourceType === "FOLDER" ? (
                        <Link href={`/files/${item.resourceId}`} className="wd-name-link">{item.name}</Link>
                      ) : (
                        <span className="wd-name-link">{item.name}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`wd-badge ${item.resourceType === "FOLDER" ? "wd-badge-amber" : "wd-badge-gray"}`}>
                      {item.resourceType === "FOLDER" ? label("files.type.folder") : label("files.type.file")}
                    </span>
                  </td>
                  <td className="num">
                    <button
                      type="button"
                      className="wd-btn wd-btn-danger wd-btn-sm"
                      onClick={async () => {
                        await removeFavorite(item.resourceType, item.resourceId);
                        await load();
                      }}
                    >
                      ★ {label("files.unfavorite")}
                    </button>
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
