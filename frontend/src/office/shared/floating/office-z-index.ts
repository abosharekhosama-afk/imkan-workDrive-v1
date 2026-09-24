/** Central z-index hierarchy for IMKAN Office floating UI. */
export const OFFICE_Z = {
  BASE: 10,
  STICKY: 40,
  POPOVER: 120,
  MENU: 130,
  CONTEXT_MENU: 140,
  DIALOG: 200,
  MODAL: 250,
  TOAST: 300,
} as const;

export type OfficeZLayer = keyof typeof OFFICE_Z;

export function officeZIndex(layer: OfficeZLayer): number {
  return OFFICE_Z[layer];
}
