'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  computeFloatingPosition,
  officeFloatingViewport,
  type FloatingPlacement,
  type FloatingRect,
} from './office-floating-logic';

export function useOfficeFloatingPosition(
  open: boolean,
  anchorEl: HTMLElement | null,
  floatingEl: HTMLElement | null,
  placement: FloatingPlacement = 'bottom-start',
  offset = 4,
): FloatingRect | null {
  const [rect, setRect] = useState<FloatingRect | null>(null);

  const update = useCallback(() => {
    if (!open || !anchorEl || !floatingEl) {
      setRect(null);
      return;
    }
    const anchor = anchorEl.getBoundingClientRect();
    const floating = floatingEl.getBoundingClientRect();
    const viewport = officeFloatingViewport();
    const next = computeFloatingPosition(
      anchor,
      { width: floating.width || floatingEl.offsetWidth, height: floating.height || floatingEl.offsetHeight },
      placement,
      offset,
      viewport,
    );
    setRect(next);
  }, [open, anchorEl, floatingEl, placement, offset]);

  useLayoutEffect(() => {
    update();
  }, [update]);

  useEffect(() => {
    if (!open) return;
    const onChange = () => update();
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [open, update]);

  return rect;
}
