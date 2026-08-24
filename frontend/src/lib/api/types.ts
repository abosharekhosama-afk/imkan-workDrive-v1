export type FileRecord = {
  id: string;
  name: string;
  folderId?: string | null;
  ownerName?: string | null;
  updatedAt?: string | null;
  size?: number | null;
  mimeType?: string | null;
};

export type FolderRecord = {
  id: string;
  name: string;
  parentId?: string | null;
  ownerName?: string | null;
  updatedAt?: string | null;
  teamFolderId?: string | null;
};

export type FolderContents = {
  folders: FolderRecord[];
  files: FileRecord[];
};

export type FolderDetail = FolderRecord & FolderContents;
export type ResourceType = "FILE" | "FOLDER";
