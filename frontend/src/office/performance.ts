/** Lightweight performance helpers shared by IMKAN Office editors. */
export function officeClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function officeEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if ((a as unknown[]).length !== (b as unknown[]).length) return false;
    for (let i = 0; i < a.length; i += 1) if (!officeEqual(a[i], (b as unknown[])[i])) return false;
    return true;
  }
  const ak = Object.keys(a as Record<string, unknown>);
  const bk = Object.keys(b as Record<string, unknown>);
  if (ak.length !== bk.length) return false;
  for (const key of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!officeEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  }
  return true;
}

export function scheduleOfficeIdle(task: () => void, timeout = 1200): () => void {
  if (typeof window === 'undefined') return () => {};
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) {
    const id = idle(task, { timeout });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(task, Math.min(timeout, 100));
  return () => window.clearTimeout(id);
}

export function scheduleOfficeFrame(task: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const id = window.requestAnimationFrame(task);
  return () => window.cancelAnimationFrame(id);
}
