'use client';

import { useEffect, useRef, useState } from 'react';
import { OfficeFloatingLayer } from './office-floating-layer';
import type { SheetFunctionDefinition } from '@/office/sheet/function-registry';

type FormulaAutocompleteProps = {
  open: boolean;
  anchorEl: HTMLElement | null;
  matches: SheetFunctionDefinition[];
  activeIndex: number;
  onPick: (fn: SheetFunctionDefinition) => void;
  onHover: (index: number) => void;
  onClose: () => void;
};

export function FormulaAutocompletePopover({
  open,
  anchorEl,
  matches,
  activeIndex,
  onPick,
  onHover,
  onClose,
}: FormulaAutocompleteProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  return (
    <OfficeFloatingLayer
      open={open && matches.length > 0}
      anchorEl={anchorEl}
      onClose={onClose}
      placement="bottom-start"
      zLayer="POPOVER"
      closeOnOutsideClick={false}
      restoreFocus={false}
    >
      <div
        ref={panelRef}
        role="listbox"
        className="max-h-[220px] min-w-[180px] overflow-auto rounded-md border border-[#dadde0] bg-white py-1 shadow-[0_5px_18px_rgba(0,0,0,.15)]"
      >
        {matches.map((fn, index) => (
          <button
            key={fn.name}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            onMouseEnter={() => onHover(index)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(fn)}
            className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12px] ${index === activeIndex ? 'bg-[#e8f5ed] text-[#0b9f4b]' : 'text-[#30343b] hover:bg-[#f3f5f7]'}`}
          >
            <span className="font-mono font-semibold">{fn.name}</span>
            <span className="text-[10px] text-[#8b8f94]">{fn.category}</span>
          </button>
        ))}
      </div>
    </OfficeFloatingLayer>
  );
}

export function useFormulaAutocompleteKeyboard(
  open: boolean,
  matchCount: number,
  activeIndex: number,
  setActiveIndex: (index: number | ((prev: number) => number)) => void,
  onPickActive: () => void,
  onClose: () => void,
) {
  return (event: React.KeyboardEvent) => {
    if (!open || !matchCount) return false;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % matchCount);
      return true;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + matchCount) % matchCount);
      return true;
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      onPickActive();
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return true;
    }
    return false;
  };
}
