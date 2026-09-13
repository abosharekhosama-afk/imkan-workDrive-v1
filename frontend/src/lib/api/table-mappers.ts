import type { FileRecord, FolderRecord } from "./types";

/**
 * Creator/user shape returned by Prisma `owner` (a.k.a. historical
 * `createdBy`) relations across folder/file endpoints:
 * `include: { owner: { select: { id, name, email, avatarUrl } } }`.
 */
export type OwnerRef = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
} | null;

type RowWithCreator = {
  owner?: OwnerRef;
  createdBy?: OwnerRef;
};

function pickCreator(row: RowWithCreator): OwnerRef {
  return row.owner ?? row.createdBy ?? null;
}

/**
 * Flattens the nested creator relation onto the flattened display fields the
 * tables consume (`ownerName` / `ownerEmail` / `ownerAvatar`), falling back to
 * `createdBy` and then to email so the Owner column never renders empty when
 * the API supplied a relation.
 */
export function mapFolderRecord<Row extends FolderRecord>(row: Row & RowWithCreator): FolderRecord {
  const creator = pickCreator(row);
  return {
    ...row,
    ownerId: row.ownerId ?? creator?.id ?? null,
    ownerName: (creator?.name ?? "").trim() || creator?.email || null,
    ownerEmail: creator?.email ?? null,
    ownerAvatar: creator?.avatarUrl ?? null,
  };
}

export function mapFileRecord<Row extends FileRecord>(row: Row & RowWithCreator): FileRecord {
  const creator = pickCreator(row);
  return {
    ...row,
    ownerId: row.ownerId ?? creator?.id ?? null,
    ownerName: (creator?.name ?? "").trim() || creator?.email || null,
    ownerEmail: creator?.email ?? null,
    ownerAvatar: creator?.avatarUrl ?? null,
  };
}

export function mapFolderRecords(rows: Array<FolderRecord & RowWithCreator>): FolderRecord[] {
  return rows.map((row) => mapFolderRecord(row));
}

export function mapFileRecords(rows: Array<FileRecord & RowWithCreator>): FileRecord[] {
  return rows.map((row) => mapFileRecord(row));
}
