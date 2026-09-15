import { apiRequest } from "./client";
import { searchPath } from "./search-path";
import type { FileRecord, FolderRecord } from "./types";

export { searchPath };

export type SearchResult = {
  query: string;
  folders: FolderRecord[];
  files: FileRecord[];
};

export function searchNames(query: string): Promise<SearchResult> {
  return apiRequest<SearchResult>(searchPath(query));
}
