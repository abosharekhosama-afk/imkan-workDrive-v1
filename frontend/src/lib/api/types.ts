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
  itemCount?: number | null; // <-- إضافة هذه الخاصية تنهي خطأ البناء في Vercel
};

export type FolderContents = {
  folders: FolderRecord[];
  files: FileRecord[];
  /** Aggregate active-file byte size per listed folder (recursive). */
  folderSizes?: Record<string, number> | null;
  /** Latest contained-file updatedAt per listed folder (recursive). */
  folderUpdatedAt?: Record<string, string | null> | null;
};

export type FolderDetail = FolderRecord & FolderContents;
export type ResourceType = "FILE" | "FOLDER";