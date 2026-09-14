"use client";

import Link from "next/link";
import { useLocale } from "./locale-provider";

/**
 * Modern hierarchical breadcrumb: root → subfolder segments joined by a
 * slanted "/" separator (Zoho-style), instead of the old "." divider.
 */
export function Breadcrumbs({
  folderId,
  folderName,
}: {
  folderId?: string;
  folderName?: string;
}) {
  const { label } = useLocale();
  return (
    <nav className="mb-3 text-[length:var(--imkan-font-size-secondary)]" aria-label={label("files.breadcrumb.root")}>
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/files" className="rounded-sm text-[color:var(--imkan-color-muted)] transition-colors hover:text-[color:var(--imkan-color-foreground)] hover:underline">
            {label("files.breadcrumb.root")}
          </Link>
        </li>
        {folderId ? (
          <li className="flex min-w-0 items-center gap-1.5">
            <span className="text-[color:var(--imkan-color-muted)] opacity-50" aria-hidden="true">
              /
            </span>
            <span className="truncate font-medium text-[color:var(--imkan-color-foreground)]" title={folderName ?? folderId}>
              {folderName ?? folderId}
            </span>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
