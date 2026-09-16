export const WorkdriveEvents = {
  upload: () => window.dispatchEvent(new Event("workdrive:trigger-upload")),
  uploadFolder: () => window.dispatchEvent(new Event("workdrive:trigger-upload-folder")),
  createFolder: () => window.dispatchEvent(new Event("workdrive:new-folder")),
  newWorkflow: () => { window.location.href = "/files/workflows/builder"; },
  externalApps: () => window.dispatchEvent(new CustomEvent("workdrive:external-apps")),
};
