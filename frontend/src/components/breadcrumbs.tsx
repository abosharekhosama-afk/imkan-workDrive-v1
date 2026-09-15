"use client";

import Link from "next/link";
import { useLocale } from "./locale-provider";

export function Breadcrumbs({
  folderId,
  folderName,
}: {
  folderId?: string;
  folderName?: string;
}) {
  const { label } = useLocale();
  return (
    <nav className="mb-3 text-[length:var(--imkan-font-size-secondary)]">
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link href="/files">{label("files.breadcrumb.root")}</Link>
        </li>
        {folderId ? (
          <li>
            <span className="mx-1" aria-hidden="true">
              ·
            </span>{" "}
            {folderName ?? folderId}
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
