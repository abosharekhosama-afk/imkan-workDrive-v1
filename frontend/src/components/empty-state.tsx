"use client";

import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <section className="imkan-panel flex-col items-center gap-2 p-6 text-center" aria-labelledby="empty-state-title">
      <div aria-hidden="true" className="imkan-badge text-[length:var(--imkan-font-size-ui)]">—</div>
      <h2 id="empty-state-title" className="imkan-heading">{title}</h2>
      {description ? <p className="imkan-muted text-[length:var(--imkan-font-size-secondary)]">{description}</p> : null}
      {action}
    </section>
  );
}
