export function trashPath(): string {
  return "/files/trash";
}

export function restorePath(fileId: string): string {
  return `/files/${fileId}/restore`;
}
