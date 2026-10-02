export const officeTokens = {
  primary: '#286ce5',
  primaryStrong: '#1f64cf',
  primarySoft: '#eaf2ff',
  border: '#dedede',
  borderSoft: '#e1e1e1',
  text: '#3e4146',
  textMuted: '#6c737d',
  hover: '#f0f3f7',
  surface: '#ffffff',
  controlHeight: 34,
  toolbarButton: 35,
} as const;

export type OfficeDirection = 'ltr' | 'rtl';

export function getOfficeDirection(ar: boolean): OfficeDirection {
  return ar ? 'rtl' : 'ltr';
}

export function getLogicalMenuPlacement(ar: boolean, left: number, menuWidth = 320) {
  return ar
    ? { right: `${left}px`, minWidth: `${menuWidth}px` }
    : { left: `${left}px`, minWidth: `${menuWidth}px` };
}
