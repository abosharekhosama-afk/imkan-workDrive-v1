import { completeUpload, requestUpload, sha256Hex } from "./files";
import { filesFromDrop } from "./drop-files";

export { filesFromDrop };

export async function uploadFileToFolder(folderId: string | null, file: File, onProgress?: (progress: number) => void): Promise<void> {
  const sha256 = await sha256Hex(file);
  const request = await requestUpload({
    name: file.name,
    folder_id: folderId,
    size: file.size,
    mime_type: file.type || "application/pdf",
    sha256,
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", request.upload_url);
    xhr.setRequestHeader("Content-Type", file.type || "application/pdf");
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100)); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
  await completeUpload(request.upload_id);
}
