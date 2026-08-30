import { fileIconSymbol } from "./file-icon-logic";

export { fileIconSymbol } from "./file-icon-logic";

type FileIconProps = {
  kind: "folder" | "file";
  mimeType?: string | null;
  name?: string;
  label: string;
};

export function FileIcon({ kind, mimeType, name, label }: FileIconProps) {
  return <span aria-label={label} role="img" className="me-2 inline-block text-[length:var(--imkan-font-size-ui)]">{fileIconSymbol(kind, mimeType, name)}</span>;
}
