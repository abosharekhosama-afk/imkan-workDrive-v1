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
  folderId?: string;
};

function normalizeSearchResult(raw: unknown): SearchResult {
  const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const data = (root.data && typeof root.data === "object" ? root.data : root) as Record<string, unknown>;
  const folders = Array.isArray(data.folders) ? (data.folders as FolderRecord[]) : [];
  const files = Array.isArray(data.files) ? (data.files as FileRecord[]) : [];
  return {
    query: typeof data.query === "string" ? data.query : "",
    folders,
    files,
    page: typeof data.page === "number" ? data.page : undefined,
    limit: typeof data.limit === "number" ? data.limit : undefined,
    total: (data.total && typeof data.total === "object" ? data.total : undefined) as SearchResult["total"],
  };
}

export async function searchNames(query: string, filter: SearchFilter = "all", options: SearchOptions = {}): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return { query: "", folders: [], files: [] };
  const url = new URL(searchPath(q, filter), "http://imkan.local");
  if (options.type && options.type !== "all") url.searchParams.set("type", options.type);
  if (options.owner) url.searchParams.set("owner", options.owner);
  if (options.dateField && options.dateField !== "modified") url.searchParams.set("dateField", options.dateField);
  if (options.dataTemplateId) url.searchParams.set("dataTemplate", options.dataTemplateId);
  if (options.criteria?.length) url.searchParams.set("criteria", JSON.stringify(options.criteria.slice(0, 5)));
  if (options.field) url.searchParams.set("field", options.field);
  if (options.dateFrom) url.searchParams.set("dateFrom", options.dateFrom);
  if (options.dateTo) url.searchParams.set("dateTo", options.dateTo);
  if (options.folderId) url.searchParams.set("folderId", options.folderId);
  if (options.page) url.searchParams.set("page", String(options.page));
  if (options.limit) url.searchParams.set("limit", String(options.limit));
  if (options.sort) url.searchParams.set("sort", options.sort);
  const raw = await apiRequest<unknown>(`${url.pathname}${url.search}`);
  return normalizeSearchResult(raw);
}
