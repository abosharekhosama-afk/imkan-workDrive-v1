'use client';
import {useEffect, useState} from 'react';

type OfficeAccessibilityProps={ar?:boolean; status?:string; targetId?:string};
export function OfficeAccessibility({ar=false,status='',targetId='office-main'}:OfficeAccessibilityProps){
 const [reduced,setReduced]=useState(false);
 useEffect(()=>{const mq=window.matchMedia('(prefers-reduced-motion: reduce)'); const sync=()=>setReduced(mq.matches); sync(); mq.addEventListener?.('change',sync); return()=>mq.removeEventListener?.('change',sync)},[]);
 return <>
  <a href={`#${targetId}`} className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-xs focus:shadow-lg" dir={ar?'rtl':'ltr'}>{ar?'تخطي إلى محتوى المحرر':'Skip to editor'}</a>
  <div aria-live="polite" aria-atomic="true" className="sr-only">{status}</div>
  <div className="sr-only" data-office-reduced-motion={reduced?'true':'false'} aria-hidden="true" />
  <style jsx global>{`
    [data-office-reduced-motion="true"] *,
    [data-office-reduced-motion="true"] *::before,
    [data-office-reduced-motion="true"] *::after {
      scroll-behavior: auto !important;
      animation-duration: .001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .001ms !important;
    }
    :where(button,a,input,textarea,select,[tabindex]):focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
    .office-hit-target {
      min-width: 44px;
      min-height: 44px;
    }
  `}</style>
 </>;
}
