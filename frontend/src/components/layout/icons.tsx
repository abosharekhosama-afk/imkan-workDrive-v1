"use client";
import type { SVGProps } from "react";
type P = SVGProps<SVGSVGElement> & { size?: number };
function Svg({ size = 18, children, ...rest }: P & { children: React.ReactNode }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>{children}</svg>);
}
function grid(p: P) { return (<Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Svg>); }
function folder(p: P) { return (<Svg {...p}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2Z" /></Svg>); }
function users(p: P) { return (<Svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></Svg>); }
function plus(p: P) { return (<Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>); }
function chevR(p: P) { return (<Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>); }
function chevD(p: P) { return (<Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>); }
function search(p: P) { return (<Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Svg>); }
function bell(p: P) { return (<Svg {...p}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></Svg>); }
function help(p: P) { return (<Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" /></Svg>); }
function info(p: P) { return (<Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></Svg>); }
function list(p: P) { return (<Svg {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Svg>); }
function star(p: P) { return (<Svg {...p}><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1Z" /></Svg>); }
function clock(p: P) { return (<Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>); }
function share(p: P) { return (<Svg {...p}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></Svg>); }
function trash(p: P) { return (<Svg {...p}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></Svg>); }
function spark(p: P) { return (<Svg {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><circle cx="12" cy="12" r="3.2" /></Svg>); }
function inbox(p: P) { return (<Svg {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.5A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.5Z" /></Svg>); }
function tag(p: P) { return (<Svg {...p}><path d="m20.6 13.4-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" /></Svg>); }
function layout(p: P) { return (<Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></Svg>); }
function flow(p: P) { return (<Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><path d="M10 6.5h5.5a1 1 0 0 1 1 1V14M14 17.5H8.5a1 1 0 0 1-1-1V10" /></Svg>); }
function sun(p: P) { return (<Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" /></Svg>); }
function moon(p: P) { return (<Svg {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></Svg>); }
function act(p: P) { return (<Svg {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></Svg>); }
function ext(p: P) { return (<Svg {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></Svg>); }
function dots(p: P) { return (<Svg {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" /></Svg>); }
function bot(p: P) { return (<Svg {...p}><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M12 8V4M8 4h8" /></Svg>); }
function shield(p: P) { return (<Svg {...p}><path d="M20 13c0 5-3.5 7.5-7.7 9a.6.6 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 .7-1c2.4-.8 4.7-2 6.3-3.5a1 1 0 0 1 1.4 0c1.6 1.5 3.9 2.7 6.3 3.5a1 1 0 0 1 .7 1Z" /></Svg>); }
function menu(p: P) { return (<Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>); }
function x(p: P) { return (<Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>); }
function doc(p: P) { return (<Svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></Svg>); }
function sheet(p: P) { return (<Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></Svg>); }
function slide(p: P) { return (<Svg {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M12 16v4M8 20h8" /></Svg>); }
function video(p: P) { return (<Svg {...p}><rect x="2" y="6" width="13" height="12" rx="2" /><path d="m15 10 7-3v10l-7-3" /></Svg>); }
function audio(p: P) { return (<Svg {...p}><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></Svg>); }
function camera(p: P) { return (<Svg {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" /><circle cx="12" cy="13" r="4" /></Svg>); }
function link(p: P) { return (<Svg {...p}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></Svg>); }
function download(p: P) { return (<Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></Svg>); }
function check(p: P) { return (<Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>); }
export const Icons = { grid, folder, users, plus, chevR, chevD, search, bell, help, info, list, star, clock, share, trash, spark, inbox, tag, layout, flow, sun, moon, act, ext, dots, bot, shield, menu, x, doc, sheet, slide, video, audio, camera, link, download, check };
export type IconName = keyof typeof Icons;
