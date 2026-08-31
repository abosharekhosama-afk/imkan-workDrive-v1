"use client";

import { useLocale } from "./locale-provider";

export function SkeletonLoader({ rows = 3, columns = 5 }: { rows?: number; columns?: number }) {
  const { label } = useLocale();
  return (
    <div className="imkan-panel overflow-x-auto p-3" aria-busy="true" aria-label={label("common.loading")}>
      <div className="flex min-w-[36rem] flex-col gap-2" role="presentation">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="imkan-table-row flex items-center gap-3 py-2">
            {Array.from({ length: columns }, (_, column) => (
              <span key={column} className={`imkan-skeleton h-4 ${column === 0 ? "flex-1" : "w-20"}`} />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only" role="status">{label("common.loading")}</span>
    </div>
  );
}
