/**
 * Browser-native PDF export preparation for IMKAN Writer.
 *
 * This intentionally uses the browser's print/PDF engine so IMKAN Office
 * remains free of a paid/external document-rendering service. The caller
 * invokes window.print(); this helper only prepares a stable document title
 * and restores it afterwards.
 */
export function prepareWriterPrintExport(title: string): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const previousTitle = document.title;
  const previousClass = document.documentElement.className;
  const cleanTitle = String(title || 'IMKAN Writer').trim().slice(0, 180) || 'IMKAN Writer';
  document.title = cleanTitle.endsWith('.pdf') ? cleanTitle : `${cleanTitle}.pdf`;
  document.documentElement.classList.add('imkan-writer-printing');
  return () => {
    document.title = previousTitle;
    document.documentElement.className = previousClass;
  };
}
