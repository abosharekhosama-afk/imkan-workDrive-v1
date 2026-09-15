export function searchPath(query: string): string {
  return `/search?q=${encodeURIComponent(query)}`;
}
