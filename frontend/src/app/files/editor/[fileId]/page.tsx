"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getFileDetails } from "@/lib/api/files";
import { officeEditorPath, resolveOfficeEditor } from "@/lib/office-file-routing";

/** Legacy editor entry — always routes to Univer. */
export default function LegacyEditorRedirect() {
  const params = useParams<{ fileId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get("templateId");

  useEffect(() => {
    void getFileDetails(params.fileId)
      .then((file: any) => {
        let href = officeEditorPath(params.fileId, file.name || "", file.mimeType);
        if (!href) {
          const kind = resolveOfficeEditor(file.name || "", file.mimeType) ?? "writer";
          href = `/office/univer/${encodeURIComponent(params.fileId)}?kind=${kind}`;
        }
        if (templateId) {
          href += `${href.includes("?") ? "&" : "?"}templateId=${encodeURIComponent(templateId)}`;
        }
        router.replace(href);
      })
      .catch(() => router.replace("/files"));
  }, [params.fileId, router, templateId]);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">
      Opening Univer editor…
    </div>
  );
}
