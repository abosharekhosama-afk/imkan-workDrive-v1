export type SearchFilter = "all" | "folders" | "files" | "recent";
export function searchPath(query: string, filter: SearchFilter = "all"): string {
  const base = `/search?q=${encodeURIComponent(query)}`;
  return filter === "all" ? base : `${base}&filter=${encodeURIComponent(filter)}`;
}
