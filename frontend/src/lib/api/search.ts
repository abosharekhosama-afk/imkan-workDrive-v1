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
  dataTemplateId?: string;
  criteria?: Array<{ key: string; op: string; value: string; join: 'AND'|'OR' }>;
  sort?: "relevance" | "updated" | "created" | "name";
  /** Limit results to this folder and its descendants (Zoho-style Search in folder). */
  folderId?: string;
};

export function searchNames(query: string, filter: SearchFilter = "all", options: SearchOptions = {}): Promise<SearchResult> {
  const url = new URL(searchPath(query, filter), 'http://imkan.local');
  if (options.type && options.type !== 'all') url.searchParams.set('type', options.type);
  if (options.owner) url.searchParams.set('owner', options.owner);
  if (options.dateField && options.dateField !== 'modified') url.searchParams.set('dateField', options.dateField);
  if (options.dataTemplateId) url.searchParams.set('dataTemplate', options.dataTemplateId);
  if (options.criteria?.length) url.searchParams.set('criteria', JSON.stringify(options.criteria.slice(0, 5)));
  if (options.field) url.searchParams.set('field', options.field);
  if (options.dateFrom) url.searchParams.set('dateFrom', options.dateFrom);
  if (options.dateTo) url.searchParams.set('dateTo', options.dateTo);
  if (options.folderId) url.searchParams.set('folderId', options.folderId);
  return apiRequest<SearchResult>(`${url.pathname}${url.search}`);
}
