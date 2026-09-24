'use client';

import { useRef } from 'react';
import { OfficePopover } from './office-popover';

const THEME_COLORS = ['#000000', '#434343', '#666666', '#999999', '#CCCCCC', '#FFFFFF', '#FF0000', '#FF9900', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#9900FF', '#FF00FF'];
const STANDARD_COLORS = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'];

type OfficeColorPickerProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  title: string;
  onPick: (color: string) => void;
};

export function OfficeColorPicker({ open, onClose, anchorRef, title, onPick }: OfficeColorPickerProps) {
  const recentRef = useRef<string[]>([]);
  const pick = (color: string) => {
    onPick(color);
    recentRef.current = [color, ...recentRef.current.filter((x) => x !== color)].slice(0, 8);
    onClose();
  };

  return (
    <OfficePopover open={open} onClose={onClose} anchorRef={anchorRef} placement="bottom-start" className="w-[248px] p-3">
      <div className="mb-2 text-[12px] font-semibold text-[#30343b]">{title}</div>
      {recentRef.current.length ? (
        <>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-[#8b8f94]">Recent</div>
          <div className="mb-3 grid grid-cols-8 gap-1">
            {recentRef.current.map((color) => (
              <button key={color} type="button" aria-label={color} className="h-5 w-5 rounded border border-[#dadde0]" style={{ background: color }} onClick={() => pick(color)} />
            ))}
          </div>
        </>
      ) : null}
      <div className="mb-1 text-[10px] uppercase tracking-wide text-[#8b8f94]">Theme</div>
      <div className="mb-3 grid grid-cols-7 gap-1">
        {THEME_COLORS.map((color) => (
          <button key={color} type="button" aria-label={color} className="h-5 w-5 rounded border border-[#dadde0]" style={{ background: color }} onClick={() => pick(color)} />
        ))}
      </div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-[#8b8f94]">Standard</div>
      <div className="mb-3 grid grid-cols-10 gap-1">
        {STANDARD_COLORS.map((color) => (
          <button key={color} type="button" aria-label={color} className="h-5 w-5 rounded border border-[#dadde0]" style={{ background: color }} onClick={() => pick(color)} />
        ))}
      </div>
      <label className="flex items-center gap-2 text-[11px] text-[#30343b]">
        Custom
        <input type="color" className="h-8 w-12 cursor-pointer border-0 bg-transparent p-0" onChange={(e) => pick(e.target.value)} />
      </label>
    </OfficePopover>
  );
}
