export const WorkdriveEvents = {
  upload: (folderId?: string | null) => window.dispatchEvent(new CustomEvent("workdrive:trigger-upload", { detail: { folderId: folderId ?? null } })),
  uploadFolder: (folderId?: string | null) => window.dispatchEvent(new CustomEvent("workdrive:trigger-upload-folder", { detail: { folderId: folderId ?? null } })),
  createFolder: (folderId?: string | null) => window.dispatchEvent(new CustomEvent("workdrive:new-folder", { detail: { folderId: folderId ?? null } })),
  newWorkflow: () => { window.location.href = "/files/workflows/builder"; },
  externalApps: () => window.dispatchEvent(new CustomEvent("workdrive:external-apps")),
};
