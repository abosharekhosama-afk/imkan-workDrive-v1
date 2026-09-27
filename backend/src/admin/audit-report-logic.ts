/**
 * Maps Audit Logs & Reports UI keys (e.g. FILES_FOLDERS:UPLOAD) to the
 * concrete audit_log.action values persisted by the backend.
 */
export function resolveAuditReportActions(
  requestedKeys: string[],
  actionMap: Record<string, string[]>,
  allKnownActions: string[],
): string[] {
  if (!requestedKeys.length) return allKnownActions;
  const resolved = requestedKeys.flatMap((key) => actionMap[key] ?? []);
  return [...new Set(resolved)];
}
