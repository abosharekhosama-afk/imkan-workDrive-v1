export type WorkflowRuntimeEvent = {
  eventType?: string;
  fileId: string;
  name: string;
  mimeType?: string | null;
  fileType?: string | null;
  size?: string | number | null;
  userId: string;
  folderId?: string | null;
  extension?: string | null;
  sourceWorkflowId?: string;
  resourceType?: 'FILE' | 'FOLDER';
};

export type DynamicValueCatalogItem = {
  path: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'unknown';
  example?: string;
};

const FILE_ITEMS: DynamicValueCatalogItem[] = [
  { path: 'file.name', label: 'File name', type: 'string' },
  { path: 'file.id', label: 'File ID', type: 'string' },
  { path: 'file.extension', label: 'File extension', type: 'string' },
  { path: 'file.folderId', label: 'Parent folder ID', type: 'string' },
  { path: 'file.mimeType', label: 'MIME type', type: 'string' },
  { path: 'file.fileType', label: 'File type', type: 'string' },
  { path: 'file.size', label: 'File size', type: 'number' },
];

const USER_ITEMS: DynamicValueCatalogItem[] = [
  { path: 'user.id', label: 'Actor ID', type: 'string' },
  { path: 'user.email', label: 'Actor email', type: 'string' },
  { path: 'user.name', label: 'Actor name', type: 'string' },
];

export function dynamicValueCatalog(fields: Array<Record<string, unknown>> = []): DynamicValueCatalogItem[] {
  const fieldItems = fields.map((field) => ({
    path: `workflow.${String(field.id ?? field.name ?? '')}`,
    label: String(field.label ?? field.name ?? field.id ?? 'Workflow field'),
    type: normalizeFieldType(field.type),
  })).filter((item) => item.path !== 'workflow.');
  return [
    ...FILE_ITEMS,
    { path: 'workflow.runId', label: 'Workflow run ID', type: 'string' },
    { path: 'workflow.id', label: 'Workflow ID', type: 'string' },
    { path: 'workflow.name', label: 'Workflow name', type: 'string' },
    ...fieldItems,
    ...USER_ITEMS,
    { path: 'now.iso', label: 'Current date/time (ISO)', type: 'date' },
  ];
}

function normalizeFieldType(value: unknown): DynamicValueCatalogItem['type'] {
  const t = String(value ?? 'string').toLowerCase();
  if (t.includes('number')) return 'number';
  if (t.includes('date')) return 'date';
  if (t.includes('yes') || t.includes('bool')) return 'boolean';
  return 'string';
}

export function resolveDynamicValue(key: string, event: WorkflowRuntimeEvent, fields: Record<string, unknown> = {}, context?: { workflowId?: string; workflowName?: string; runId?: string; user?: { id?: string; email?: string; name?: string } }): unknown {
  const normalized = key.trim();
  const direct: Record<string, unknown> = {
    'file.name': event.name,
    'file.id': event.fileId,
    'file.extension': event.extension ?? '',
    'file.folderId': event.folderId ?? '',
    'file.mimeType': event.mimeType ?? '',
    'file.fileType': event.fileType ?? '',
    'file.size': event.size ?? '',
    'user.id': context?.user?.id ?? event.userId,
    'user.email': context?.user?.email ?? '',
    'user.name': context?.user?.name ?? '',
    'workflow.id': context?.workflowId ?? '',
    'workflow.name': context?.workflowName ?? '',
    'workflow.runId': context?.runId ?? '',
    'now.iso': new Date().toISOString(),
  };
  if (Object.prototype.hasOwnProperty.call(direct, normalized)) return direct[normalized];
  if (normalized.startsWith('workflow.')) {
    const fieldId = normalized.slice('workflow.'.length);
    return fields[fieldId];
  }
  return fields[normalized];
}

export function interpolateDynamicValues(value: unknown, event: WorkflowRuntimeEvent, fields: Record<string, unknown> = {}, context?: { workflowId?: string; workflowName?: string; runId?: string; user?: { id?: string; email?: string; name?: string } }): unknown {
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, key: string) => {
    const resolved = resolveDynamicValue(key, event, fields, context);
    return resolved === undefined || resolved === null ? '' : String(resolved);
  });
}

export function walkDynamicValues(value: unknown, event: WorkflowRuntimeEvent, fields: Record<string, unknown> = {}, context?: { workflowId?: string; workflowName?: string; runId?: string; user?: { id?: string; email?: string; name?: string } }): unknown {
  if (Array.isArray(value)) return value.map((item) => walkDynamicValues(item, event, fields, context));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, walkDynamicValues(child, event, fields, context)]));
  return interpolateDynamicValues(value, event, fields, context);
}

export function evaluateCondition(condition: unknown, event: WorkflowRuntimeEvent, fields: Record<string, unknown> = {}): boolean {
  if (!condition || condition === 'any') return true;
  if (Array.isArray(condition)) return condition.every((item) => evaluateCondition(item, event, fields));
  if (typeof condition === 'string') {
    const normalized = condition.toUpperCase();
    if (normalized === 'PDF') return String(event.fileType).toUpperCase() === 'PDF' || event.mimeType?.toLowerCase() === 'application/pdf';
    if (normalized === 'IMAGE') return String(event.fileType).toUpperCase() === 'IMAGE' || !!event.mimeType?.toLowerCase().startsWith('image/');
    if (normalized === 'DOCUMENT') return ['DOCUMENT', 'TEXT', 'CODE'].includes(String(event.fileType).toUpperCase()) || /word|text|rtf/.test(event.mimeType?.toLowerCase() ?? '');
    if (normalized === 'SPREADSHEET') return String(event.fileType).toUpperCase() === 'SPREADSHEET' || /spreadsheet|excel|csv/.test(event.mimeType?.toLowerCase() ?? '');
    if (normalized === 'PRESENTATION') return String(event.fileType).toUpperCase() === 'PRESENTATION' || /presentation|powerpoint/.test(event.mimeType?.toLowerCase() ?? '');
    return true;
  }
  if (typeof condition !== 'object') return true;
  const c = condition as Record<string, unknown>;
  if (c.not !== undefined && evaluateCondition(c.not, event, fields)) return false;
  if (Array.isArray(c.all) && !c.all.every((x) => evaluateCondition(x, event, fields))) return false;
  if (Array.isArray(c.any) && !c.any.some((x) => evaluateCondition(x, event, fields))) return false;
  if (Array.isArray(c.rules)) {
    const values = c.rules.map((x) => evaluateCondition(x, event, fields));
    if (String(c.logic ?? 'AND').toUpperCase() === 'OR' ? !values.some(Boolean) : !values.every(Boolean)) return false;
  }
  const field = typeof c.field === 'string' ? c.field : typeof c.fieldId === 'string' ? c.fieldId : null;
  if (!field) return true;
  const aliases: Record<string, unknown> = { fileType: event.fileType, extension: event.extension ?? '', name: event.name, nameContains: event.name, folderId: event.folderId ?? '', mimeType: event.mimeType ?? '', size: event.size ?? '' };
  const actual = Object.prototype.hasOwnProperty.call(aliases, field) ? aliases[field] : resolveDynamicValue(field, event, fields);
  const operator = String(c.operator ?? 'equals').toLowerCase();
  const expected = c.value;
  const a = actual === null || actual === undefined ? '' : actual;
  const b = expected === null || expected === undefined ? '' : expected;
  switch (operator) {
    case 'equals': case 'equal': case 'is': return String(a).toLowerCase() === String(b).toLowerCase();
    case 'not_equals': case 'not_equal': case 'is_not': return String(a).toLowerCase() !== String(b).toLowerCase();
    case 'contains': return String(a).toLowerCase().includes(String(b).toLowerCase());
    case 'not_contains': return !String(a).toLowerCase().includes(String(b).toLowerCase());
    case 'starts_with': return String(a).toLowerCase().startsWith(String(b).toLowerCase());
    case 'ends_with': return String(a).toLowerCase().endsWith(String(b).toLowerCase());
    case 'greater_than': return Number(a) > Number(b);
    case 'greater_or_equal': return Number(a) >= Number(b);
    case 'less_than': return Number(a) < Number(b);
    case 'less_or_equal': return Number(a) <= Number(b);
    case 'in': return Array.isArray(b) && b.map(String).includes(String(a));
    case 'not_in': return Array.isArray(b) && !b.map(String).includes(String(a));
    case 'exists': return a !== '' && a !== null && a !== undefined;
    default: return true;
  }
}
