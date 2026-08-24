export function filesFromDrop(dataTransfer: { files: FileList | File[] }): File[] {
  return Array.from(dataTransfer.files);
}
