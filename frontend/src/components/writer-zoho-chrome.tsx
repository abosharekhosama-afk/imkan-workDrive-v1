'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

type IconName =
  | 'file' | 'star' | 'folder' | 'users' | 'bell' | 'settings' | 'info' | 'undo' | 'redo' | 'paint'
  | 'bold' | 'italic' | 'scissors' | 'underline' | 'strike' | 'textColor' | 'highlight' | 'eraser' | 'line'
  | 'align' | 'list' | 'indent' | 'outdent' | 'checklist' | 'image' | 'table' | 'link' | 'comment'
  | 'more' | 'plus' | 'minus' | 'paragraph' | 'search' | 'document' | 'automation' | 'import'
  | 'open' | 'copy' | 'download' | 'versions' | 'workflow' | 'final' | 'share' | 'publish'
  | 'sign' | 'form' | 'print' | 'properties' | 'trash' | 'view' | 'reader' | 'fullscreen'
  | 'zoom' | 'navigator' | 'hide' | 'ruler' | 'grid' | 'object' | 'formatting' | 'design' | 'font'
  | 'page' | 'review' | 'comments' | 'track' | 'snapshot' | 'lock' | 'mask' | 'notification' | 'chevron'
  | 'superscript' | 'symbol' | 'equation' | 'citation' | 'caption' | 'reference' | 'index' | 'columns'
  | 'break' | 'header' | 'bookmark' | 'footnote' | 'endnote' | 'alignLeft' | 'alignCenter' | 'alignRight'
  | 'justify' | 'bullets' | 'numbering' | 'spell';

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.65, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  const p: Record<IconName, ReactNode> = {
    file: <><path d="M6 2.8h8l4 4v14.4H6z"/><path d="M14 2.8v4h4"/><path d="M8.8 12h6.4M8.8 15.5h6.4"/></>,
    star: <path d="m12 3 2.7 5.4 6 .9-4.35 4.2 1.03 5.95L12 16.65 6.62 19.45l1.03-5.95L3.3 9.3l6-.9z"/>,
    folder: <><path d="M3.2 6.4h6l1.8 2h9.8v9.8a2 2 0 0 1-2 2H5.2a2 2 0 0 1-2-2z"/><path d="M3.2 8.4h17.6"/></>,
    users: <><circle cx="9" cy="9" r="3"/><path d="M3.5 20c.3-3.2 2.1-5 5.5-5s5.2 1.8 5.5 5"/><path d="M16 7.2a2.7 2.7 0 0 1 0 5.3M17 15.2c2.2.5 3.4 1.9 3.6 4.1"/></>,
    bell: <><path d="M18 9.8a6 6 0 0 0-12 0c0 7-3 7-3 8.7h18C21 16.8 18 16.8 18 9.8Z"/><path d="M10 21h4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.06.06-1.8 1.8-.06-.06a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.08 1.65V20h-2.55v-.08a1.8 1.8 0 0 0-1.08-1.65 1.8 1.8 0 0 0-2 .36l-.06.06-1.8-1.8.06-.06a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 6.2 13.8H6V11.2h.2a1.8 1.8 0 0 0 1.64-1.08 1.8 1.8 0 0 0-.36-2l-.06-.06 1.8-1.8.06.06a1.8 1.8 0 0 0 2 .36A1.8 1.8 0 0 0 12.36 5V4.8h2.55V5a1.8 1.8 0 0 0 1.08 1.65 1.8 1.8 0 0 0 2-.36l.06-.06 1.8 1.8-.06.06a1.8 1.8 0 0 0-.36 2 1.8 1.8 0 0 0 1.65 1.08h.12v2.55h-.12A1.8 1.8 0 0 0 19.4 15Z"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7.2h.01"/></>,
    undo: <><path d="M9 7 4 12l5 5"/><path d="M4 12h9a6 6 0 0 1 6 6"/></>,
    redo: <><path d="m15 7 5 5-5 5"/><path d="M20 12h-9a6 6 0 0 0-6 6"/></>,
    paint: <><path d="M4 19h6"/><path d="M8 16 16.7 7.3a2 2 0 1 1 2.8 2.8L10.8 18.8 8 16Z"/><path d="m14.5 9.5 2.8 2.8"/></>,
    scissors: <><circle cx="7" cy="7" r="2"/><circle cx="7" cy="17" r="2"/><path d="m8.7 8.2 9.3 5.8M8.7 15.8 18 10"/></>,
    bold: <path d="M8 5h5a4 4 0 0 1 1.2 7.8A4 4 0 0 1 13 20H8zM8 5v15M8 12h4.5"/>,
    italic: <path d="M10 5h7M7 19h7M14 5l-4 14"/>,
    underline: <><path d="M7 5v6a5 5 0 0 0 10 0V5"/><path d="M5 21h14"/></>,
    strike: <><path d="M7 7.2C7.8 5.7 9.3 5 11.5 5c2.3 0 4 1 4.7 2.5"/><path d="M7 17c.8 2 2.4 3 4.8 3 2.5 0 4.2-1 4.9-3"/><path d="M4 12h16"/></>,
    textColor: <><path d="M7 18 12 5l5 13"/><path d="M9 13h6"/><path d="M5 21h14"/></>,
    highlight: <><path d="m8 4 8 8-5 5-8-8z"/><path d="m13 9 3-3 2 2-3 3"/><path d="M4 20h14"/></>,
    eraser: <><path d="m8 4 12 12-5 5H6l-3-3 10-10"/><path d="M8 20h13"/></>,
    line: <><path d="M6 6v12M18 6v12M4 9h16M4 15h16"/></>,
    align: <><path d="M4 6h16M4 10h12M4 14h16M4 18h10"/></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></>,
    indent: <><path d="M4 6h16M4 12h16M4 18h16"/><path d="m8 9-3 3 3 3"/></>,
    outdent: <><path d="M4 6h16M4 12h16M4 18h16"/><path d="m5 9 3 3-3 3"/></>,
    checklist: <><path d="m4 7 2 2 3-4M11 7h9M11 14h9M11 21h9M4 14l2 2 3-4"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m5 17 4.5-4 3.5 3 2.5-2 3.5 3"/></>,
    table: <><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/></>,
    link: <><path d="M9.5 14.5 8 16a4 4 0 0 1-5.5-5.5l3-3A4 4 0 0 1 11 7"/><path d="m14.5 9.5 1.5-1.5A4 4 0 0 1 21.5 13l-3 3A4 4 0 0 1 13 17"/><path d="m8 12 8 0"/></>,
    comment: <><path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    minus: <path d="M5 12h14"/>,
    paragraph: <path d="M7 5h8a4 4 0 0 1 0 8H7zM7 5v14M10 5v14"/>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    document: <><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h4"/><path d="M8 12h8M8 16h8"/></>,
    automation: <><path d="M12 3 14 9l6 2-6 2-2 6-2-6-6-2 6-2z"/><path d="m19 3 .5 1.5L21 5l-1.5.5L19 7l-.5-1.5L17 5l1.5-.5z"/></>,
    import: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
    open: <><path d="M3 7h6l2 2h10v9H3z"/><path d="M3 9h18"/></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="1"/><path d="M5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1"/></>,
    download: <><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/></>,
    versions: <><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/><path d="M5 5 3 7"/></>,
    workflow: <><circle cx="6" cy="12" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M8 12h5l3-4M13 12l3 4"/></>,
    final: <><path d="M6 3h12v18H6z"/><path d="m9 12 2 2 4-5"/></>,
    share: <><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.5-4.2M8.2 13.2l7.5 4.2"/></>,
    publish: <><circle cx="12" cy="12" r="9"/><path d="M12 16V8M9 11l3-3 3 3"/></>,
    sign: <><path d="M4 18c4-4 7-5 10-3 2 1 3 0 5-2"/><path d="M5 21h14"/></>,
    form: <><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    print: <><path d="M7 8V4h10v4M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/></>,
    properties: <><circle cx="12" cy="12" r="9"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    trash: <><path d="M5 7h14M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
    view: <><path d="M3 5h18v14H3z"/><path d="M3 9h18"/></>,
    reader: <><path d="M4 5h7v14H4zM13 5h7v14h-7z"/><path d="M7 9h1M16 9h1"/></>,
    fullscreen: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5"/></>,
    zoom: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M10.5 7.5v6M7.5 10.5h6"/></>,
    navigator: <><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    hide: <><path d="M3 3l18 18M10.6 5.1A10.6 10.6 0 0 1 12 5c5 0 9 4 10 7-0.4 1.2-1.2 2.4-2.2 3.4M6.4 6.4C4.7 7.6 3.5 9.2 3 12c1 3 5 7 9 7 1.1 0 2.1-.2 3-.7"/></>,
    ruler: <><path d="m4 18 14-14 3 3L7 21H4z"/><path d="m9 13 2 2M12 10l2 2M15 7l2 2"/></>,
    grid: <><rect x="4" y="4" width="16" height="16"/><path d="M4 10h16M4 14h16M10 4v16M14 4v16"/></>,
    object: <><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></>,
    formatting: <><path d="M7 4v16M17 4v16M4 8h16M4 16h16"/></>,
    design: <><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5M8 16h7"/></>,
    font: <><path d="M6 19 12 5l6 14M8 14h8"/></>,
    page: <><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h4"/></>,
    review: <><path d="M5 5h14v12H9l-4 4z"/><path d="M8 9h8M8 12h5"/></>,
    comments: <><path d="M4 4h16v12H8l-4 4z"/><path d="M8 8h8M8 11h6"/></>,
    track: <><path d="M6 4h12M6 20h12M6 8h12M6 16h12"/><path d="M9 12h6"/></>,
    snapshot: <><rect x="4" y="5" width="16" height="14" rx="1"/><path d="M8 5V3h8v2M8 12h8M8 15h5"/></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    mask: <><path d="M4 7h16v10H4z"/><path d="M8 11h8M8 14h5"/></>,
    notification: <><path d="M5 6h14v12H5z"/><path d="m8 10 3 3 5-5"/></>,
    chevron: <path d="m8 10 4 4 4-4"/>,
    superscript: <><path d="M5 17 11 7M5 7l6 10M14 8h5l-5 5h5"/></>,
    symbol: <><circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/></>,
    equation: <><path d="M4 7h4l4 5 4-5h4M4 17h16"/></>,
    citation: <><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h6M8 16h8"/></>,
    caption: <><rect x="4" y="5" width="16" height="10"/><path d="M7 19h10"/></>,
    reference: <><path d="M6 4h12v16H6z"/><path d="M9 9h6M9 13h6M9 17h4"/></>,
    index: <><path d="M5 4h14v16H5z"/><path d="M8 8h2M8 12h2M8 16h2M13 8h3M13 12h3M13 16h3"/></>,
    columns: <><path d="M5 4h5v16H5zM14 4h5v16h-5z"/></>,
    break: <><path d="M4 8h16M4 16h16"/><path d="M8 6v4M16 14v4"/></>,
    header: <><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 16h8"/></>,
    bookmark: <path d="M7 4h10v17l-5-3-5 3z"/>,
    footnote: <><path d="M6 5h12M6 19h12M12 5v14"/><path d="M8 12h8"/></>,
    endnote: <><path d="M5 5h14v14H5z"/><path d="M8 9h8M8 13h6M8 17h8"/></>,
    alignLeft: <><path d="M4 6h16M4 10h12M4 14h16M4 18h10"/></>,
    alignCenter: <><path d="M4 6h16M7 10h10M4 14h16M7 18h10"/></>,
    alignRight: <><path d="M4 6h16M8 10h12M4 14h16M10 18h10"/></>,
    justify: <><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></>,
    bullets: <><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r=".8" fill="currentColor"/><circle cx="4.5" cy="12" r=".8" fill="currentColor"/><circle cx="4.5" cy="18" r=".8" fill="currentColor"/></>,
    numbering: <><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 5h1v3M3.5 8h2M3.5 11h2l-2 3h2"/></>,
    spell: <><path d="M4 18 10 5l6 13M6 14h8"/><path d="m16 17 2 2 3-4"/></>,
  };
  return <svg {...common}>{p[name]}</svg>;
}

type Action = () => void;
export type WriterChromeProps = {
  title: string;
  saved: boolean;
  saving: boolean;
  ar: boolean;
  revision: number;
  presence?: ReactNode;
  onBack?: Action;
  onAssignWorkflow?: Action;
  onShare?: Action;
  onUndo: Action;
  onRedo: Action;
  onBold: Action;
  onItalic: Action;
  onUnderline: Action;
  onStrike: Action;
  onFind: Action;
  onInsertTable: Action;
  onInsertImage: Action;
  onPageBreak: Action;
  onPageSettings: Action;
  onLink: Action;
  onFontFamily: (value: string) => void;
  onFontSize: (value: number) => void;
  onColor: (value: string) => void;
  onHighlight: (value: string) => void;
  onAlign: (value: 'start' | 'center' | 'end' | 'justify') => void;
  onList: (ordered: boolean) => void;
  onIndent: Action;
  onOutdent: Action;
  onColumns: Action;
  onSectionBreak: Action;
  onHeaderFooter: Action;
  onEquation: Action;
  onSymbol: Action;
  onCitation: Action;
  onBibliography: Action;
  onAutoIndex: Action;
  onCaption: Action;
  onCrossReference: Action;
  onIndex: Action;
  onBookmark: Action;
  onFootnote: Action;
  onEndnote: Action;
  onComments: Action;
  onTrackChanges: Action;
  onSnapshot: Action;
  onPrint: Action;
  onExport: Action;
  onFullscreen: Action;
  onAddParagraph: Action;
  onPageZoom?: (value: number) => void;
  onNavigate?: Action;
  onClearFormatting?: Action;
  onLineSpacing?: (value: number) => void;
  onParagraphStyle?: (value: 'paragraph'|'title'|'subtitle'|'heading1'|'heading2'|'heading3') => void;
  onSuperscript?: Action;
  onSubscript?: Action;
  onMarkupColor?: (value: string) => void;
  onReviewMode?: (value: 'all'|'simple'|'original') => void;
  onWordCount?: Action;
  onDocumentStatistics?: Action;
  onToggleFormattingMarks?: Action;
  onToggleImages?: Action;
  onRuler?: Action;
  onZoom?: (value: number) => void;
};

type MenuName = 'File' | 'Edit' | 'View' | 'Insert' | 'Format' | 'Design' | 'Page Setup' | 'Review' | 'Tools' | 'Fields' | 'Automate' | 'Help' | null;

type MenuItem = {
  label: string;
  icon: IconName;
  shortcut?: string;
  disabled?: boolean;
  arrow?: boolean;
  onClick?: Action;
  submenu?: { label: string; icon: IconName; onClick?: Action }[];
};

const noop = () => undefined;

export function WriterChrome(props: WriterChromeProps) {
  const [menu, setMenu] = useState<MenuName>(null);
  const [fontMenu, setFontMenu] = useState(false);
  const [alignMenu, setAlignMenu] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const [fontFamily, setFontFamily] = useState('Roboto');
  const [fontSize, setFontSize] = useState(12);
  const [color, setColor] = useState('#222222');
  const [highlight, setHighlight] = useState('#ffe86a');
  const [zoom, setZoom] = useState(100);
  const [lineSpacing, setLineSpacing] = useState(1.5);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenu(null); setFontMenu(false); setAlignMenu(false); setMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const closeMenus = () => { setMenu(null); setFontMenu(false); setAlignMenu(false); setMoreMenu(false); };
  const run = (fn?: Action) => { closeMenus(); fn?.(); };
  const setFont = (value: string) => { setFontFamily(value); props.onFontFamily(value); };
  const setSize = (value: number) => { const next = Math.max(8, Math.min(96, value)); setFontSize(next); props.onFontSize(next); };

  const fileItems: MenuItem[] = [
    { label: 'New Document', icon: 'document', arrow: true, submenu: [
      { label: 'Blank Document', icon: 'document', onClick: props.onAddParagraph },
      { label: 'Document Using Template...', icon: 'document', onClick: () => window.location.assign('/files/templates') },
      { label: 'Document Using AI', icon: 'automation' },
    ] },
    { label: 'New Automation Template', icon: 'automation', arrow: true },
    { label: 'Import', icon: 'import', arrow: true },
    { label: 'Open', icon: 'open', arrow: true },
    { label: 'Manage Documents', icon: 'document', onClick: props.onBack },
    { label: 'Make a Copy...', icon: 'copy', shortcut: 'Ctrl+Shift+S' },
    { label: 'Save As', icon: 'download', arrow: true },
    { label: 'Download As', icon: 'download', arrow: true, onClick: props.onExport },
    { label: 'Document Versions', icon: 'versions', arrow: true },
    { label: 'Assign workflow', icon: 'workflow', onClick: props.onAssignWorkflow },
    { label: 'Mark As Final', icon: 'final' },
    { label: 'Share', icon: 'share', arrow: true, onClick: props.onShare },
    { label: 'Publish', icon: 'publish' },
    { label: 'Send for sign', icon: 'sign', arrow: true },
    { label: 'Fill As Form', icon: 'form' },
    { label: 'Page Setup', icon: 'page', onClick: props.onPageSettings },
    { label: 'Print', icon: 'print', shortcut: 'Ctrl+P', onClick: props.onPrint },
    { label: 'Document Properties', icon: 'properties' },
    { label: 'Move To Trash', icon: 'trash' },
  ];

  const editItems: MenuItem[] = [
    { label: 'Undo', icon: 'undo', shortcut: 'Ctrl+Z', onClick: props.onUndo },
    { label: 'Redo', icon: 'redo', shortcut: 'Ctrl+Y', onClick: props.onRedo },
    { label: 'Cut', icon: 'scissors' as IconName, shortcut: 'Ctrl+X' },
    { label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C' },
    { label: 'Paste', icon: 'document', arrow: true },
    { label: 'Find', icon: 'search', arrow: true, onClick: props.onFind },
    { label: 'Go To...', icon: 'navigator', arrow: true },
    { label: 'Select All ...', icon: 'checklist', shortcut: 'Ctrl+A' },
    { label: 'Delete ...', icon: 'trash', disabled: true },
  ];

  const viewItems: MenuItem[] = [
    { label: 'Document View : Page View', icon: 'view', arrow: true, submenu: [
      { label: 'Page View', icon: 'view' },
      { label: 'Web View', icon: 'view' },
    ] },
    { label: 'Reader View', icon: 'reader', disabled: true },
    { label: 'Full Screen', icon: 'fullscreen', shortcut: 'F11', onClick: props.onFullscreen },
    { label: `Zoom: ${zoom}%`, icon: 'zoom', arrow: true, submenu: [
      { label: '75%', icon: 'zoom', onClick: () => { setZoom(75); props.onZoom?.(75); } },
      { label: '90%', icon: 'zoom', onClick: () => { setZoom(90); props.onZoom?.(90); } },
      { label: '100%', icon: 'zoom', onClick: () => { setZoom(100); props.onZoom?.(100); } },
      { label: '125%', icon: 'zoom', onClick: () => { setZoom(125); props.onZoom?.(125); } },
      { label: '150%', icon: 'zoom', onClick: () => { setZoom(150); props.onZoom?.(150); } },
    ] },
    { label: 'Navigator', icon: 'navigator', onClick: props.onNavigate },
    { label: 'Hide Images', icon: 'hide', onClick: props.onToggleImages },
    { label: 'Ruler', icon: 'ruler', onClick: props.onRuler },
    { label: 'Bookmarks', icon: 'bookmark', disabled: true },
    { label: 'Smart Grid Lines', icon: 'grid', disabled: true },
    { label: 'Object Indicator', icon: 'object', disabled: true },
    { label: 'Toggle Formatting Marks', icon: 'formatting', shortcut: 'Ctrl+Shift+8', onClick: props.onToggleFormattingMarks },
    { label: 'Appearance', icon: 'design', arrow: true, submenu: [
      { label: 'Light', icon: 'design' },
      { label: 'Dark / Night', icon: 'design', disabled: true },
    ] },
    { label: 'More View Options ...', icon: 'more', disabled: true },
  ];

  const insertItems: MenuItem[] = [
    { label: 'Table', icon: 'table', onClick: props.onInsertTable },
    { label: 'Image', icon: 'image', onClick: props.onInsertImage },
    { label: 'Link', icon: 'link', onClick: props.onLink },
    { label: 'Break', icon: 'break', arrow: true, submenu: [
      { label: 'Page Break', icon: 'break', onClick: props.onPageBreak },
      { label: 'Section Break', icon: 'break', onClick: props.onSectionBreak },
      { label: 'Column Break', icon: 'columns', disabled: true },
    ] },
    { label: 'Header / Footer', icon: 'header', onClick: props.onHeaderFooter },
    { label: 'Columns', icon: 'columns', arrow: true, submenu: [
      { label: 'One Column', icon: 'columns', onClick: () => props.onColumns() },
      { label: 'Two Columns', icon: 'columns', onClick: () => props.onColumns() },
      { label: 'Three Columns', icon: 'columns', disabled: true },
    ] },
    { label: 'Equation', icon: 'equation', onClick: props.onEquation },
    { label: 'Symbol', icon: 'symbol', onClick: props.onSymbol },
    { label: 'Bookmark', icon: 'bookmark', onClick: props.onBookmark },
    { label: 'Footnote', icon: 'footnote', onClick: props.onFootnote },
    { label: 'Endnote', icon: 'endnote', onClick: props.onEndnote },
    { label: 'Citation', icon: 'citation', onClick: props.onCitation },
    { label: 'Bibliography', icon: 'citation', onClick: props.onBibliography },
    { label: 'Caption', icon: 'caption', onClick: props.onCaption },
    { label: 'Cross Reference', icon: 'reference', onClick: props.onCrossReference },
    { label: 'Index Entry', icon: 'index', onClick: props.onIndex },
  ];

  const reviewItems: MenuItem[] = [
    { label: 'Add Comments', icon: 'comments', onClick: props.onComments },
    { label: 'Show Comments', icon: 'comment', onClick: props.onComments },
    { label: 'Collaboration: Off', icon: 'users', arrow: true, disabled: true },
    { label: 'Track Changes: Off', icon: 'track', arrow: true, onClick: props.onTrackChanges },
    { label: 'View Suggestions', icon: 'comments', onClick: props.onComments },
    { label: 'Markup View : All Markup', icon: 'review', arrow: true, submenu: [
      { label: 'All Markup', icon: 'review', onClick: () => props.onReviewMode?.('all') },
      { label: 'Simple Markup', icon: 'review', onClick: () => props.onReviewMode?.('simple') },
      { label: 'Original', icon: 'review', onClick: () => props.onReviewMode?.('original') },
    ] },
    { label: 'Markup Color', icon: 'textColor', arrow: true, submenu: [
      { label: 'Green', icon: 'textColor', onClick: () => props.onMarkupColor?.('#22c55e') },
      { label: 'Purple', icon: 'textColor', onClick: () => props.onMarkupColor?.('#9333ea') },
      { label: 'Blue', icon: 'textColor', onClick: () => props.onMarkupColor?.('#2563eb') },
      { label: 'Red', icon: 'textColor', onClick: () => props.onMarkupColor?.('#dc2626') },
      { label: 'Orange', icon: 'textColor', onClick: () => props.onMarkupColor?.('#f59e0b') },
    ] },
    { label: 'Compare Versions', icon: 'versions', onClick: props.onSnapshot },
    { label: 'Combine Revisions', icon: 'versions', disabled: true },
    { label: 'Lock/Unlock Content', icon: 'lock', disabled: true },
    { label: 'Mask Content', icon: 'mask', disabled: true },
    { label: 'Notification Settings', icon: 'notification', disabled: true },
  ];

  const itemsForMenu = (name: MenuName): MenuItem[] => {
    if (name === 'File') return fileItems;
    if (name === 'Edit') return editItems;
    if (name === 'View') return viewItems;
    if (name === 'Insert') return insertItems;
    if (name === 'Review') return reviewItems;
    if (name === 'Format') return [
      { label: 'Paragraph Style', icon: 'paragraph', arrow: true, submenu: [
        { label: 'Normal', icon: 'paragraph', onClick: () => props.onParagraphStyle?.('paragraph') },
        { label: 'Title', icon: 'paragraph', onClick: () => props.onParagraphStyle?.('title') },
        { label: 'Subtitle', icon: 'paragraph', onClick: () => props.onParagraphStyle?.('subtitle') },
        { label: 'Heading 1', icon: 'paragraph', onClick: () => props.onParagraphStyle?.('heading1') },
        { label: 'Heading 2', icon: 'paragraph', onClick: () => props.onParagraphStyle?.('heading2') },
        { label: 'Heading 3', icon: 'paragraph', onClick: () => props.onParagraphStyle?.('heading3') },
      ] },
      { label: 'Text Formatting', icon: 'font', arrow: true, submenu: [
        { label: 'Bold', icon: 'bold', onClick: props.onBold },
        { label: 'Italic', icon: 'italic', onClick: props.onItalic },
        { label: 'Underline', icon: 'underline', onClick: props.onUnderline },
        { label: 'Strikethrough', icon: 'strike', onClick: props.onStrike },
        { label: 'Superscript', icon: 'superscript', onClick: props.onSuperscript },
        { label: 'Subscript', icon: 'superscript', onClick: props.onSubscript },
        { label: 'Clear Formatting', icon: 'eraser', onClick: props.onClearFormatting },
      ] },
      { label: 'Align', icon: 'align', arrow: true, submenu: [
        { label: 'Align Left', icon: 'alignLeft', onClick: () => props.onAlign('start') },
        { label: 'Center', icon: 'alignCenter', onClick: () => props.onAlign('center') },
        { label: 'Align Right', icon: 'alignRight', onClick: () => props.onAlign('end') },
        { label: 'Justify', icon: 'justify', onClick: () => props.onAlign('justify') },
      ] },
      { label: 'Lists', icon: 'list', arrow: true, submenu: [
        { label: 'Bulleted List', icon: 'bullets', onClick: () => props.onList(false) },
        { label: 'Numbered List', icon: 'numbering', onClick: () => props.onList(true) },
      ] },
      { label: 'Line Spacing', icon: 'line', arrow: true, submenu: [
        { label: 'Single', icon: 'line', onClick: () => props.onLineSpacing?.(1) },
        { label: '1.15', icon: 'line', onClick: () => props.onLineSpacing?.(1.15) },
        { label: '1.5', icon: 'line', onClick: () => props.onLineSpacing?.(1.5) },
        { label: 'Double', icon: 'line', onClick: () => props.onLineSpacing?.(2) },
      ] },
      { label: 'Indent', icon: 'indent', onClick: props.onIndent },
      { label: 'Outdent', icon: 'outdent', onClick: props.onOutdent },
    ];
    if (name === 'Design') return [
      { label: 'Current Design : The Writer', icon: 'design', arrow: true },
      { label: 'Design Gallery', icon: 'design', arrow: true },
      { label: 'Font Set', icon: 'font', arrow: true, onClick: () => setFont('Roboto') },
      { label: 'Color Set : Default', icon: 'textColor', arrow: true },
      { label: 'Import Design ...', icon: 'import' },
      { label: 'Page Borders', icon: 'page' },
      { label: 'Page Background ...', icon: 'page' },
      { label: 'More Design Options ...', icon: 'more' },
    ];
    if (name === 'Page Setup') return [
      { label: 'Page Size', icon: 'page', onClick: props.onPageSettings },
      { label: 'Margins', icon: 'page', onClick: props.onPageSettings },
      { label: 'Orientation', icon: 'page', onClick: props.onPageSettings },
      { label: 'Columns', icon: 'columns', onClick: props.onColumns },
      { label: 'Breaks', icon: 'break', onClick: props.onSectionBreak },
      { label: 'Header / Footer', icon: 'header', onClick: props.onHeaderFooter },
    ];
    if (name === 'Tools') return [
      { label: 'Ask Zia', icon: 'automation', disabled: true },
      { label: 'Spell Check', icon: 'spell', onClick: props.onFind },
      { label: 'Text to Table', icon: 'table', disabled: true },
      { label: 'Translate Content', icon: 'symbol', disabled: true },
      { label: 'Transliteration', icon: 'symbol', disabled: true },
      { label: 'Focus Typing', icon: 'font', disabled: true },
      { label: 'Typewriter Sound', icon: 'font', disabled: true },
      { label: 'Thesaurus', icon: 'document', disabled: true },
      { label: 'Autocorrect', icon: 'font', disabled: true },
      { label: 'Personal Dictionary', icon: 'document', disabled: true },
      { label: 'Read Aloud', icon: 'reader', disabled: true },
      { label: 'Word Count', icon: 'document', onClick: props.onWordCount },
      { label: 'View Document Images', icon: 'image', onClick: props.onToggleImages },
      { label: 'Extensions', icon: 'plus', disabled: true },
      { label: 'Engagement Insights', icon: 'properties', disabled: true },
      { label: 'Find and Replace', icon: 'search', onClick: props.onFind },
      { label: 'Document Statistics', icon: 'properties', onClick: props.onDocumentStatistics },
    ];
    if (name === 'Fields') return [
      { label: 'Insert Field', icon: 'document' },
      { label: 'Template Fields', icon: 'form' },
    ];
    if (name === 'Automate') return [
      { label: 'Assign workflow', icon: 'workflow', onClick: props.onAssignWorkflow },
      { label: 'Automation Templates', icon: 'automation' },
    ];
    if (name === 'Help') return [
      { label: 'Keyboard Shortcuts', icon: 'document' },
      { label: 'Writer Help', icon: 'info' },
      { label: 'About IMKAN Writer', icon: 'info' },
    ];
    return [];
  };

  const menuNames: Exclude<MenuName, null>[] = ['File', 'Edit', 'View', 'Insert', 'Format', 'Design', 'Page Setup', 'Review', 'Tools', 'Fields', 'Automate', 'Help'];

  const renderMenu = () => {
    if (!menu) return null;
    const items = itemsForMenu(menu);
    const menuLeft: Record<Exclude<MenuName, null>, number> = {File: 0, Edit: 48, View: 104, Insert: 153, Format: 204, Design: 265, 'Page Setup': 339, Review: 420, Tools: 486, Fields: 548, Automate: 610, Help: 690};
    return <div style={{left: `${menuLeft[menu]}px`}} className="absolute top-[31px] z-[160] min-w-[320px] max-h-[calc(100vh-170px)] overflow-y-auto rounded-[5px] border border-[#dedede] bg-white p-1.5 shadow-[0_4px_18px_rgba(0,0,0,.18)]">
      {items.map((item) => <MenuRow key={item.label} item={item} onRun={run} />)}
    </div>;
  };

  return <div ref={rootRef} className="relative z-[150] shrink-0 select-none bg-white text-[#1c1c1c] print:hidden" style={{fontFamily:'Arial, Helvetica, sans-serif'}} dir={props.ar ? 'rtl' : 'ltr'}>
    <div className="flex h-[52px] items-stretch border-b border-[#dedede] bg-white">
      <div className="flex w-[124px] shrink-0 items-center gap-2 bg-[#286ce5] px-[17px] text-[22px] font-medium text-white"><Icon name="file" size={25}/><span>Writer</span></div>
      <div className="flex min-w-0 flex-1 items-center gap-[12px] px-[24px]">
        <button className="max-w-[190px] truncate text-[18px] font-semibold hover:bg-[#f5f7fa]" title={props.title}>{props.title || 'Untitled Document'}</button>
        <button className="p-1 text-[#6c737d] hover:bg-[#f4f6f8]" title="Favorite"><Icon name="star" size={18}/></button>
        <button className="p-1 text-[#6c737d] hover:bg-[#f4f6f8]" title="Move"><Icon name="folder" size={18}/></button>
        <button onClick={props.onAssignWorkflow} className="ml-[3px] rounded-[4px] border border-[#3475e8] bg-white px-[11px] py-[6px] text-[12px] font-medium text-[#2066d6] hover:bg-[#f3f7ff]">ASSIGN WORKFLOW</button>
        <span className="flex items-center gap-1 text-[12px] text-[#6d7279]"><span className="inline-block h-[7px] w-[7px] rounded-full bg-[#73777c]"/>{props.saving ? 'Saving' : props.saved ? 'Saved' : 'Unsaved'}</span>
        <div className="ml-auto flex items-center gap-[8px]">
          <button className="h-[34px] rounded-[4px] border border-[#d5d9df] bg-white px-[13px] text-[14px] hover:bg-[#f7f8fa]">Compose <span className="ms-1 text-[11px]">⌄</span></button>
          <button onClick={props.onShare} className="flex h-[34px] items-center gap-2 rounded-[4px] border border-[#3475e8] px-[13px] text-[14px] text-[#2066d6] hover:bg-[#f3f7ff]"><Icon name="share" size={17}/>Share</button>
          <IconButton name="users" title="Collaborators" />
          <IconButton name="bell" title="Notifications" />
          <IconButton name="settings" title="Settings" />
          <IconButton name="info" title="Info" />
          <div className="h-[34px] w-[34px] overflow-hidden rounded-full bg-[#e8edf5] text-center text-[13px] leading-[34px] text-[#5b6470]">U</div>
        </div>
      </div>
    </div>

    <div className="relative flex h-[32px] items-center border-b border-[#e1e1e1] bg-white px-0" onMouseLeave={() => undefined}>
      {menuNames.map((name) => <button key={name} onClick={() => { setMenu(menu === name ? null : name); setFontMenu(false); setAlignMenu(false); setMoreMenu(false); }} className={`h-[31px] px-[14px] text-[14px] hover:bg-[#f2f5f9] ${menu === name ? 'bg-[#d3e3fd] text-[#1f64cf]' : ''}`}>{name}</button>)}
      {renderMenu()}
    </div>

    <div className="relative flex h-[47px] items-center gap-0 overflow-x-auto border-b border-[#dddddd] bg-white px-[10px] text-[#3e4146]">
      <ToolbarButton icon="undo" title="Undo" onClick={props.onUndo}/><ToolbarButton icon="redo" title="Redo" onClick={props.onRedo}/><ToolbarButton icon="paint" title="Format Painter"/>
      <Divider/>
      <ToolbarSelect value="List Paragraph" width="153px" onChange={() => undefined} />
      <div className="relative shrink-0">
        <button type="button" onClick={() => { setFontMenu(v => !v); setAlignMenu(false); setMoreMenu(false); }} className="mx-[2px] flex h-[31px] w-[148px] items-center justify-between rounded-[3px] border border-transparent bg-white px-[8px] text-[14px] hover:border-[#d7dce2]" title="Font"><span style={{fontFamily}}>{fontFamily}</span><Icon name="chevron" size={14}/></button>
        {fontMenu&&<FontPicker current={fontFamily} onSelect={(value) => { setFont(value); setFontMenu(false); }} />}
      </div>
      <ToolbarSelect value={String(fontSize)} width="58px" onChange={v => setSize(Number(v))}/>
      <ToolbarButton icon="plus" title="Increase font size" onClick={() => setSize(fontSize + 1)}/><ToolbarButton icon="minus" title="Decrease font size" onClick={() => setSize(fontSize - 1)}/>
      <Divider/>
      <ToolbarButton icon="bold" title="Bold" onClick={props.onBold}/><ToolbarButton icon="italic" title="Italic" onClick={props.onItalic}/><ToolbarButton icon="underline" title="Underline" onClick={props.onUnderline}/><ToolbarButton icon="strike" title="Strikethrough" onClick={props.onStrike}/>
      <ColorButton icon="textColor" color={color} title="Text color" onChange={(v) => { setColor(v); props.onColor(v); }}/>
      <ColorButton icon="highlight" color={highlight} title="Highlight" onChange={(v) => { setHighlight(v); props.onHighlight(v); }}/>
      <ToolbarButton icon="eraser" title="Clear formatting" onClick={props.onClearFormatting}/>
      <Divider/>
      <ToolbarButton icon="line" title={`Line spacing ${lineSpacing}`} onClick={() => { const values=[1,1.15,1.5,2]; const next=values[(values.indexOf(lineSpacing)+1)%values.length]; setLineSpacing(next); props.onLineSpacing?.(next); }}/><ToolbarButton icon="align" title="Alignment" onClick={() => { setAlignMenu(v => !v); setFontMenu(false); setMoreMenu(false); }} />
      {alignMenu && <div className="absolute left-[720px] top-[43px] z-[170] w-[225px] rounded-[5px] border border-[#dedede] bg-white p-1.5 shadow-[0_4px_18px_rgba(0,0,0,.18)]">
        <AlignRow icon="alignLeft" label="Align Left" shortcut="Ctrl+Shift+L" onClick={() => run(() => props.onAlign('start'))}/>
        <AlignRow icon="alignCenter" label="Align Center" shortcut="Ctrl+Shift+E" onClick={() => run(() => props.onAlign('center'))}/>
        <AlignRow icon="alignRight" label="Align Right" shortcut="Ctrl+Shift+R" onClick={() => run(() => props.onAlign('end'))}/>
        <AlignRow icon="justify" label="Justify" shortcut="Ctrl+Shift+J" onClick={() => run(() => props.onAlign('justify'))}/>
      </div>}
      <ToolbarButton icon="indent" title="Indent" onClick={props.onIndent}/><ToolbarButton icon="outdent" title="Outdent" onClick={props.onOutdent}/><ToolbarButton icon="bullets" title="Bulleted list" onClick={() => props.onList(false)}/><ToolbarButton icon="numbering" title="Numbered list" onClick={() => props.onList(true)}/><ToolbarButton icon="checklist" title="Checklist"/>
      <ToolbarButton icon="image" title="Insert image" onClick={props.onInsertImage}/><ToolbarButton icon="table" title="Insert table" onClick={props.onInsertTable}/><ToolbarButton icon="link" title="Insert link" onClick={props.onLink}/><ToolbarButton icon="comment" title="Comments" onClick={props.onComments}/>
      <div className="relative"><ToolbarButton icon="more" title="More" onClick={() => { setMoreMenu(v => !v); setFontMenu(false); setAlignMenu(false); }}/>{moreMenu&&<div className="absolute right-0 top-[39px] z-[170] flex h-[54px] w-[258px] items-center gap-[2px] rounded-[5px] border border-[#dedede] bg-white px-[7px] shadow-[0_4px_18px_rgba(0,0,0,.18)]">
        <MiniMore icon="paragraph" label="Paragraph" onClick={() => run(props.onClearFormatting)}/><MiniMore icon="align" label="Paragraph align" onClick={()=>setAlignMenu(true)}/><MiniMore icon="textColor" label="Text color" onClick={()=>{setMoreMenu(false);}}/><MiniMore icon="comment" label="Comments" onClick={props.onComments}/>
      </div>}</div>
    </div>

    <div className="flex h-[0px]" />
  </div>;
}

function IconButton({ name, title }: { name: IconName; title: string }) { return <button className="flex h-[34px] w-[34px] items-center justify-center rounded-[4px] text-[#3e4146] hover:bg-[#f4f6f8]" title={title}><Icon name={name} size={18}/></button>; }
function Divider() { return <span className="mx-[5px] h-[26px] w-px bg-[#e1e1e1]"/>; }
function ToolbarButton({ icon, title, onClick }: { icon: IconName; title: string; onClick?: Action }) { return <button type="button" onMouseDown={e => e.preventDefault()} onClick={onClick} title={title} className="flex h-[35px] w-[34px] shrink-0 items-center justify-center rounded-[3px] text-[#41454a] hover:bg-[#f0f3f7] active:bg-[#e6edf7]"><Icon name={icon} size={18}/></button>; }
function ToolbarSelect({ value, width, onChange }: { value: string; width: string; onChange: (value: string) => void }) { return <select value={value} onChange={e => onChange(e.target.value)} className="mx-[2px] h-[31px] shrink-0 rounded-[3px] border border-transparent bg-white px-[8px] text-[14px] outline-none hover:border-[#d7dce2] focus:border-[#8db7f4]" style={{ width }}><option>{value}</option>{value === 'Roboto' && <><option>Arial</option><option>Tahoma</option><option>Times New Roman</option></>}{value === '12' && <><option>10</option><option>11</option><option>14</option><option>16</option><option>18</option><option>24</option><option>36</option></>}</select>; }
function ColorButton({ icon, color, title, onChange }: { icon: IconName; color: string; title: string; onChange: (value: string) => void }) {
  const [open,setOpen]=useState(false);
  const colors=['#000000','#444444','#777777','#ffffff','#ef4444','#f97316','#f59e0b','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6','#6366f1','#8b5cf6','#ec4899','#f3e8ff','#dbeafe','#dcfce7','#fef3c7','#fee2e2'];
  return <div className="relative shrink-0"><button type="button" onClick={()=>setOpen(v=>!v)} className="relative flex h-[35px] w-[35px] items-center justify-center rounded-[3px] hover:bg-[#f0f3f7]" title={title}><Icon name={icon} size={18}/><span className="absolute bottom-[4px] left-[8px] right-[8px] h-[3px] rounded" style={{backgroundColor:color}}/></button>{open&&<div className="absolute left-0 top-[38px] z-[190] w-[250px] rounded-[5px] border border-[#d9dde2] bg-white p-2 shadow-[0_5px_20px_rgba(0,0,0,.2)]"><div className="mb-2 text-[12px] font-medium text-[#646a72]">Theme colors</div><div className="grid grid-cols-10 gap-1.5">{colors.map(c=><button key={c} type="button" aria-label={c} onClick={()=>{onChange(c);setOpen(false);}} className="h-[20px] w-[20px] rounded-[3px] border border-[#d5d9df]" style={{backgroundColor:c}}/> )}</div><div className="mt-2 border-t pt-2"><label className="flex items-center gap-2 text-[12px] text-[#555b62]">Custom<input type="color" value={color} onChange={e=>onChange(e.target.value)} className="ms-auto h-7 w-9"/></label></div></div>}</div>;
}
function FontPicker({ current, onSelect }: { current: string; onSelect: (value: string) => void }) {
  const [query, setQuery] = useState('');
  const fonts = ['Anonymous Pro','Arimo','Arvo','Lato 2','Liberation Mono','Liberation Sans','Liberation Serif','Roboto','Rokkitt','Quicksand','Source Sans Pro','League Gothic'];
  const filtered = fonts.filter(font => font.toLowerCase().includes(query.toLowerCase()));
  return <div className="absolute left-0 top-[36px] z-[180] w-[360px] overflow-hidden rounded-[5px] border border-[#dedede] bg-white shadow-[0_4px_18px_rgba(0,0,0,.18)]">
    <div className="flex items-center gap-2 border-b border-[#ececec] p-2"><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search" className="h-[32px] flex-1 rounded-[3px] bg-[#f4f6f8] px-2.5 text-[13px] outline-none"/><button className="h-[32px] w-[32px] rounded border border-[#d9dde2] text-[#2d67c9]">☰</button><button className="h-[32px] w-[32px] rounded border border-transparent text-[#6b7076]">▦</button></div>
    <div className="max-h-[400px] overflow-y-auto text-[14px]">
      <div className="px-3 pb-1 pt-2 text-[12px] font-medium uppercase tracking-wide text-[#777d84]">Theme Fonts</div>
      {['Roboto (Body)','Roboto (Headings)'].map(font=><button key={font} onClick={()=>onSelect('Roboto')} className={`block w-full px-4 py-2 text-left hover:bg-[#edf3ff] ${current==='Roboto'?'text-[#1f64cf]':''}`} style={{fontFamily:'Roboto'}}>{font}</button>)}
      <div className="mt-1 flex items-center justify-between border-t border-[#ececec] px-3 pb-1 pt-2"><span className="text-[12px] font-medium text-[#777d84]">My Fonts</span><button className="text-[12px] font-medium text-[#2f6dd2]">⊕ ADD NEW</button></div>
      <div className="px-3 py-3 text-center text-[13px] text-[#8a8f95]">No fonts added yet</div>
      <div className="border-t border-[#ececec] px-3 pb-1 pt-2 text-[12px] font-medium uppercase tracking-wide text-[#777d84]">Default Fonts</div>
      {filtered.map(font=><button key={font} onClick={()=>onSelect(font)} className={`block w-full px-4 py-[7px] text-left hover:bg-[#edf3ff] ${current===font?'text-[#1f64cf]':''}`} style={{fontFamily:font}}>{font}{['Arimo','Lato 2'].includes(font)&&<span className="float-right text-[#777d84]">›</span>}</button>)}
      <div className="border-t border-[#ececec] p-2"><button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-[14px] hover:bg-[#edf3ff]"><span className="text-[22px] text-[#3fbd50]">⊕</span>Add Font Set</button></div>
    </div>
  </div>;
}
function MiniMore({ icon, label, onClick }: { icon: IconName; label: string; onClick: Action }) { return <button onClick={onClick} title={label} className="flex h-[42px] w-[44px] items-center justify-center rounded-[4px] text-[#555b62] hover:bg-[#edf3ff]"><Icon name={icon} size={19}/></button>; }
function MenuRow({ item, onRun }: { item: MenuItem; onRun: (fn?: Action) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="relative" onMouseEnter={() => item.submenu && setOpen(true)} onMouseLeave={() => item.submenu && setOpen(false)}>
    <button disabled={item.disabled} onClick={() => onRun(item.onClick)} className={`group flex min-h-[35px] w-full items-center gap-[11px] rounded-[4px] px-[10px] text-left text-[14px] ${item.disabled ? 'cursor-default text-[#b7bbc0]' : 'text-[#1c1c1c] hover:bg-[#eaf2ff] hover:text-[#1f64cf]'}`}>
      <span className="flex w-[18px] shrink-0 items-center justify-center"><Icon name={item.icon} size={18}/></span><span className="min-w-0 flex-1 whitespace-nowrap">{item.label}</span>{item.shortcut&&<span className="ms-auto ps-5 text-[12px] text-[#6f747a]">{item.shortcut}</span>}{item.arrow&&<Icon name="chevron" size={15}/>}</button>
    {open&&item.submenu&&<div className="absolute left-[calc(100%-2px)] top-0 z-[180] w-[265px] rounded-[5px] border border-[#dedede] bg-white p-1.5 shadow-[0_4px_18px_rgba(0,0,0,.18)]">{item.submenu.map(sub=><button key={sub.label} onClick={() => onRun(sub.onClick)} className="flex min-h-[35px] w-full items-center gap-[11px] rounded-[4px] px-[10px] text-left text-[14px] hover:bg-[#eaf2ff] hover:text-[#1f64cf]"><Icon name={sub.icon} size={18}/><span>{sub.label}</span></button>)}</div>}
  </div>;
}
function AlignRow({ icon, label, shortcut, onClick }: { icon: IconName; label: string; shortcut: string; onClick: Action }) { return <button onClick={onClick} className="flex h-[35px] w-full items-center gap-2 rounded-[4px] px-2 text-left text-[14px] hover:bg-[#eaf2ff] hover:text-[#1f64cf]"><Icon name={icon} size={18}/><span className="flex-1">{label}</span><span className="text-[12px] text-[#6f747a]">{shortcut}</span></button>; }
