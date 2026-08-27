export function errorMessageForStatus(status: number | undefined, labels: { unauthenticated: string; forbidden: string; generic: string }): string {
  if (status === 401) return labels.unauthenticated;
  if (status === 403) return labels.forbidden;
  return labels.generic;
}

export function isEmptyResult(length: number): boolean {
  return length === 0;
}
