import { apiRequest } from "./client";
import { searchPath, type SearchFilter } from "./search-path";
import type { FileRecord, FolderRecord } from "./types";

export { searchPath };
export type { SearchFilter };

export type SearchResult = {
  query: string;
  folders: FolderRecord[];
  files: FileRecord[];
};

export function searchNames(query: string, filter: SearchFilter = "all"): Promise<SearchResult> {
  return apiRequest<SearchResult>(searchPath(query, filter));
}
