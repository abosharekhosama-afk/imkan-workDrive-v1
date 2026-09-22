import { apiRequest } from "./client";
import { searchPath, type SearchFilter } from "./search-path";
import type { FileRecord, FolderRecord } from "./types";

export { searchPath };
export type { SearchFilter };

export type SearchResult = {
  query: string;
  folders: FolderRecord[];
  files: FileRecord[];
  page?: number;
  limit?: number;
  total?: { folders: number; files: number };
};

export type SearchOptions = {
  type?: string;
  owner?: string;
  dateField?: 'created' | 'modified';
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  tags?: string[];
  field?: string;
  sort?: "relevance" | "updated" | "created" | "name";
};

export function searchNames(query: string, filter: SearchFilter = "all", options: SearchOptions = {}): Promise<SearchResult> {
  const url = new URL(searchPath(query, filter), 'http://imkan.local');
  if (options.type && options.type !== 'all') url.searchParams.set('type', options.type);
  if (options.owner) url.searchParams.set('owner', options.owner);
  if (options.dateField && options.dateField !== 'modified') url.searchParams.set('dateField', options.dateField);
  if (options.dateFrom) url.searchParams.set('dateFrom', options.dateFrom);
  if (options.dateTo) url.searchParams.set('dateTo', options.dateTo);
  return apiRequest<SearchResult>(`${url.pathname}${url.search}`);
}
