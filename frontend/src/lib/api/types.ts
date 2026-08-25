export type FileRecord = {
  id: string;
  name: string;
  folderId?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerAvatar?: string | null;
  updatedAt?: string | null;
  size?: number | null;
  mimeType?: string | null;
  deletedAt?: string | null;
  folderName?: string | null;
};

export type FolderRecord = {
  id: string;
  name: string;
  parentId?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerAvatar?: string | null;
  updatedAt?: string | null;
  teamFolderId?: string | null;
};

export type FolderContents = {
  folders: FolderRecord[];
  files: FileRecord[];
};

export type FolderDetail = FolderRecord & FolderContents;
export type ResourceType = "FILE" | "FOLDER";
