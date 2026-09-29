import type { DataTemplate, DataTemplateField } from "./api/metadata";

/** Normalize API templates that may expose fields under `schema` or `fields`. */
export function resolveDataTemplateSchema(template: DataTemplate | null | undefined): DataTemplateField[] {
  if (!template) return [];
  if (Array.isArray(template.schema) && template.schema.length > 0) return template.schema;
  if (Array.isArray(template.fields) && template.fields.length > 0) return template.fields;
  return [];
}
