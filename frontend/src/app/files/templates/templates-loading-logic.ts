import type { TemplateLibrary, TemplateRecord, TemplateType } from "@/lib/api/templates";

export type TemplateSort = "name" | "name_desc" | "updated" | "updated_asc";

export type TemplateListFilters = {
  type?: TemplateType;
  categoryId?: string;
  q?: string;
  sort?: TemplateSort;
};

function compareUpdated(a: TemplateRecord, b: TemplateRecord, asc: boolean) {
  const av = Date.parse(a.updatedAt) || 0;
  const bv = Date.parse(b.updatedAt) || 0;
  return asc ? av - bv : bv - av;
}

/** Client-side filter/sort used to avoid refetching cached PUBLIC template bundles. */
export function filterTemplateRecords(items: TemplateRecord[], filters: TemplateListFilters): TemplateRecord[] {
  const q = filters.q?.trim().toLowerCase() ?? "";
  let next = items.filter((item) => {
    if (filters.type && item.type !== filters.type) return false;
    if (filters.categoryId && item.category?.id !== filters.categoryId) return false;
    if (!q) return true;
    const haystack = `${item.name} ${item.description ?? ""}`.toLowerCase();
    return haystack.includes(q);
  });
  const sort = filters.sort ?? "updated";
  if (sort === "name") next = [...next].sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "name_desc") next = [...next].sort((a, b) => b.name.localeCompare(a.name));
  else if (sort === "updated_asc") next = [...next].sort((a, b) => compareUpdated(a, b, true));
  else next = [...next].sort((a, b) => compareUpdated(a, b, false));
  return next;
}

/** PUBLIC libraries are seeded globally and safe to hydrate once per session. */
export function shouldHydrateLibraryOnce(library: TemplateLibrary): boolean {
  return library === "PUBLIC";
}

export function templatesCacheKey(input: {
  library: TemplateLibrary;
  type?: TemplateType;
  categoryId?: string;
  q?: string;
  sort?: TemplateSort;
}): string {
  return JSON.stringify({
    library: input.library,
    type: input.type ?? "",
    categoryId: input.categoryId ?? "",
    q: input.q?.trim() ?? "",
    sort: input.sort ?? "updated",
  });
}
