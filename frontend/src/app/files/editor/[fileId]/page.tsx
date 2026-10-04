"use client";

/**
 * Legacy /files/editor/[fileId] redirect → Univer (or IMKAN Office for .imkan).
 */

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getFileDetails } from "@/lib/api/files";
import { officeEditorPath, isNativeImkanOfficeFile } from "@/lib/office-file-routing";

export default function LegacyEditorRedirect() {
  const params = useParams<{ fileId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get("templateId");

  useEffect(() => {
    void getFileDetails(params.fileId)
      .then((file) => {
        const href = officeEditorPath(params.fileId, file.name || "", file.mimeType);
        if (href) {
          const url = templateId
            ? `${href}${href.includes("?") ? "&" : "?"}templateId=${encodeURIComponent(templateId)}`
            : href;
          router.replace(url);
          return;
        }
        // Fallback by extension
        const ext = (file.extension || "").toLowerCase();
        const kind = ["xls", "xlsx", "csv", "ods"].includes(ext)
          ? "sheet"
          : ["ppt", "pptx", "odp"].includes(ext)
            ? "show"
            : "writer";
        if (isNativeImkanOfficeFile(file.name || "", file.mimeType)) {
          router.replace(`/office/${kind}/${params.fileId}${templateId ? `?templateId=${encodeURIComponent(templateId)}` : ""}`);
        } else {
          router.replace(
            `/office/univer/${encodeURIComponent(params.fileId)}?kind=${kind}${templateId ? `&templateId=${encodeURIComponent(templateId)}` : ""}`,
          );
        }
      })
      .catch(() => router.replace("/files"));
  }, [params.fileId, router, templateId]);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">
      Opening Univer editor…
    </div>
  );
}
