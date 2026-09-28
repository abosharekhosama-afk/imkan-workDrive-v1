'use client';

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const ShowIcons = {
  logo: (p: IconProps) => (
    <Svg {...p} size={p.size ?? 18}>
      <rect x="1" y="1" width="14" height="14" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 11V5l4 3 4-3v6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </Svg>
  ),
  save: (p: IconProps) => <Svg {...p}><path d="M3 2h8l2 2v9H3V2zm2 0v3h4V2H5zm0 5h6v4H5V7z" /></Svg>,
  undo: (p: IconProps) => <Svg {...p}><path d="M3 4.5 7 8.5l-1 1-4-4 4-4 1 1-4 4h7a3 3 0 0 1 0 6H8v-1.5h2A1.5 1.5 0 0 0 11.5 9 1.5 1.5 0 0 0 10 7.5H3z" /></Svg>,
  redo: (p: IconProps) => <Svg {...p}><path d="M13 4.5 9 8.5l1 1 4-4-4-4-1 1 4 4H6a3 3 0 0 0 0 6h2v-1.5H6A1.5 1.5 0 0 1 4.5 9 1.5 1.5 0 0 1 6 7.5h7z" /></Svg>,
  present: (p: IconProps) => <Svg {...p}><path d="M2 3h12v7H9l2 3H7L5 10H2V3zm1 1v5h2.3L7 9.5h2L10.7 9H13V4H3z" /></Svg>,
  newSlide: (p: IconProps) => <Svg {...p} size={p.size ?? 20}><path d="M2 2h9v9H2V2zm1 1v7h7V3H3zm9 1h2v8H5v-2h7V4z" /></Svg>,
  duplicate: (p: IconProps) => <Svg {...p}><path d="M4 2h7v1H5v7H4V2zm2 2h7v7H6V4zm1 1v5h5V5H7z" /></Svg>,
  delete: (p: IconProps) => <Svg {...p}><path d="M6 2h4l1 1h3v1H2V3h3l1-1zm1 3h1v7H7V5zm3 0h1v7h-1V5zM4 5h1v7.5c0 .8.7 1.5 1.5 1.5h4c.8 0 1.5-.7 1.5-1.5V5h1v7.5A2.5 2.5 0 0 1 11.5 15h-4A2.5 2.5 0 0 1 5 12.5V5z" /></Svg>,
  bold: (p: IconProps) => <Svg {...p}><path d="M5 2h3.2c1.8 0 3 1 3 2.6 0 1-.5 1.7-1.3 2.1 1 .3 1.8 1.2 1.8 2.5 0 1.9-1.3 3.3-3.5 3.3H5V2zm1.5 4.8H8c.9 0 1.4-.4 1.4-1.1 0-.7-.5-1.1-1.4-1.1H6.5V6.8zm0 4.7H8.4c1 0 1.6-.5 1.6-1.3 0-.8-.6-1.3-1.6-1.3H6.5v2.6z" /></Svg>,
  italic: (p: IconProps) => <Svg {...p}><path d="M9 2 7 2 5.5 14 7.5 14 9 2zm-2.5 5h5v1.5h-5V7z" /></Svg>,
  alignLeft: (p: IconProps) => <Svg {...p}><path d="M2 3h10v1.5H2V3zm0 3.5h7v1.5H2V6.5zm0 3.5h10V12H2v-2z" /></Svg>,
  alignCenter: (p: IconProps) => <Svg {...p}><path d="M2 3h10v1.5H2V3zm2.5 3.5h5v1.5h-5V6.5zm-2.5 3.5h10V12H2v-2z" /></Svg>,
  alignRight: (p: IconProps) => <Svg {...p}><path d="M2 3h10v1.5H2V3zm3 3.5h7v1.5H5V6.5zm-3 3.5h10V12H2v-2z" /></Svg>,
  textBox: (p: IconProps) => <Svg {...p}><path d="M2 2h12v12H2V2zm1.5 1.5v9h9v-9h-9zm1 1.5h7V6h-7V5zm0 2h5v1h-5V7z" /></Svg>,
  shape: (p: IconProps) => <Svg {...p}><rect x="2.5" y="3.5" width="11" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" /></Svg>,
  image: (p: IconProps) => <Svg {...p}><path d="M2 3h12v10H2V3zm1 1v6.8l2.5-2.2 2 1.8 2.5-3.1L13 10.2V4H3zm1.5 1.5h2v2h-2v-2z" /></Svg>,
  table: (p: IconProps) => <Svg {...p}><path d="M2 2h12v12H2V2zm1 1v4h4V3H3zm5 0v4h4V3H8zm-5 5v4h4V8H3zm5 0v4h4V8H8z" /></Svg>,
  video: (p: IconProps) => <Svg {...p}><path d="M2 3h9v10H2V3zm10 2.5 3-2v9l-3-2v-5z" /></Svg>,
  audio: (p: IconProps) => <Svg {...p}><path d="M6 3v6.1c-.6.3-1 .9-1 1.6a2 2 0 1 0 4 0c0-.7-.4-1.3-1-1.6V3H6zm7 2.5a4.5 4.5 0 0 1 0 5M12.5 5a3 3 0 0 1 0 6" fill="none" stroke="currentColor" strokeWidth="1.1" /></Svg>,
  line: (p: IconProps) => <Svg {...p}><path d="M3 12 13 4" stroke="currentColor" strokeWidth="1.5" fill="none" /></Svg>,
  group: (p: IconProps) => <Svg {...p}><path d="M3 4h4v4H3V4zm6 0h4v4H9V4zM3 10h4v2H3v-2zm6 0h4v2H9v-2z" /></Svg>,
  ungroup: (p: IconProps) => <Svg {...p}><path d="M2 3h5v5H2V3zm7 0h5v5H9V3zM2 10h5v3H2v-3zm7 0h5v3H9v-3z" fill="none" stroke="currentColor" strokeWidth="1" /></Svg>,
  bringFront: (p: IconProps) => <Svg {...p}><path d="M4 2h8v8H4V2zm1 1v6h6V3H5zM2 6h8v8H2V6zm1 1v6h6V7H3z" /></Svg>,
  sendBack: (p: IconProps) => <Svg {...p}><path d="M2 2h8v8H2V2zm1 1v6h6V3H3zM6 6h8v8H6V6zm1 1v6h6V7H7z" /></Svg>,
  theme: (p: IconProps) => <Svg {...p}><circle cx="5" cy="5" r="2" /><circle cx="11" cy="5" r="2" /><circle cx="8" cy="10" r="2" /></Svg>,
  transition: (p: IconProps) => <Svg {...p}><path d="M2 4h8v8H2V4zm6 2 4-2v8l-4-2V6z" /></Svg>,
  animation: (p: IconProps) => <Svg {...p}><path d="M3 8h7l-2-2v4l2-2zm6 0h4" stroke="currentColor" strokeWidth="1.5" fill="none" /></Svg>,
  zoomIn: (p: IconProps) => <Svg {...p}><path d="M7 2a5 5 0 1 0 3.2 8.8L14 14.6l-.8.8-3.8-3.8A5 5 0 0 0 7 2zm0 1.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM6.25 5.5H7.75v3H6.25v-3zm-1.5 1.5h3v1h-3v-1z" /></Svg>,
  zoomOut: (p: IconProps) => <Svg {...p}><path d="M7 2a5 5 0 1 0 3.2 8.8L14 14.6l-.8.8-3.8-3.8A5 5 0 0 0 7 2zm0 1.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM5.75 7h2.5v-1h-2.5v1z" /></Svg>,
  chevronDown: (p: IconProps) => <Svg {...p}><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" /></Svg>,
  add: (p: IconProps) => <Svg {...p}><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" fill="none" /></Svg>,
};
