"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "./locale-provider";
import { clampBoxLeft, readContentLane } from "../lib/overlay-bounds-logic";
import { Icons } from "./layout/icons";

/**
 * IMKAN WorkDrive — Global single-choice picker
 * =============================================
 * Reusable dropdown styled like Members → Settings → Change Role:
 * pill trigger + descriptive option menu (title + optional subtitle).
 *
 * Use this instead of native `<select>` across WorkDrive product UI.
 * Office editor toolbars and multi-select controls may keep native selects.
 *
 * Menus render in a document portal so they float above cards/modals
 * that use overflow clipping (workflow action cards, wd-card, etc.).
 *
 * @example
 * <ImkanOptionPicker
 *   value={role}
 *   onChange={setRole}
 *   ariaLabel="Member role"
 *   fullWidth
 *   options={[
 *     { value: "ADMIN", label: "Admin", description: "Can manage members" },
 *     { value: "MEMBER", label: "Member", description: "Standard access" },
 *   ]}
 * />
 */
export type ImkanOptionPickerOption<T extends string = string> = {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
};

type ImkanOptionPickerProps<T extends string> = {
  value: T | "";
  onChange: (value: T | "") => void;
  options: readonly ImkanOptionPickerOption<T>[];
  ariaLabel: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  /** Stretch trigger to container width (filters, form fields). */
  fullWidth?: boolean;
  /** Wider menu panel for long role descriptions (360px). */
  menuWidth?: "default" | "wide";
  /** Allow clearing selection via an empty option row. */
  allowEmpty?: boolean;
  emptyLabel?: string;
};

/** Map plain string values to picker options (label defaults to the value). */
export function toImkanPickerOptions(
  values: readonly string[],
  labelFor?: (value: string) => string,
  descriptionFor?: (value: string) => string | undefined,
): ImkanOptionPickerOption[] {
  return values.map((value) => ({
    value,
    label: labelFor?.(value) ?? value,
    description: descriptionFor?.(value),
  }));
}

type MenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

function computeMenuPosition(trigger: HTMLElement, menuWidth: "default" | "wide", rtl: boolean): MenuPosition {
  const rect = trigger.getBoundingClientRect();
  const width = menuWidth === "wide" ? 360 : 280;
  const viewportPadding = 12;
  const gap = 6;
  const maxHeight = Math.max(160, window.innerHeight - rect.bottom - gap - viewportPadding);
  const desired = rtl ? rect.right - width : rect.left;
  const left = clampBoxLeft(desired, width, readContentLane(viewportPadding));
  return {
    top: rect.bottom + gap,
    left,
    width,
    maxHeight,
  };
}

export function ImkanOptionPicker<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  disabled = false,
  placeholder,
  className = "",
  triggerClassName = "",
  menuClassName = "",
  fullWidth = false,
  menuWidth = "default",
  allowEmpty = false,
  emptyLabel = "—",
}: ImkanOptionPickerProps<T>) {
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  const repositionMenu = () => {
    if (!rootRef.current) return;
    setMenuPosition(computeMenuPosition(rootRef.current, menuWidth, locale === "ar" || document.documentElement.dir === "rtl"));
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }
    repositionMenu();
  }, [open, menuWidth, options.length, locale]);

  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onViewportChange = () => repositionMenu();
    const dirObserver = new MutationObserver(onViewportChange);
    dirObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["dir", "lang"] });
    document.addEventListener("click", onDocumentClick, true);
    document.addEventListener("keydown", onDocumentKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      dirObserver.disconnect();
      document.removeEventListener("click", onDocumentClick, true);
      document.removeEventListener("keydown", onDocumentKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open, menuWidth, options.length, locale]);

  const menuClasses = [
    "imkan-option-picker-menu",
    "imkan-option-picker-menu-portal",
    menuWidth === "wide" ? "imkan-option-picker-menu-wide" : "",
    menuClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const selectOption = (next: T | "") => {
    onChange(next);
    setOpen(false);
  };

  const menu = open && menuPosition && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={menuRef}
          className={menuClasses}
          role="listbox"
          aria-label={ariaLabel}
          dir={locale === "ar" ? "rtl" : "ltr"}
          style={{
            position: "fixed",
            top: menuPosition.top,
            left: menuPosition.left,
            width: menuPosition.width,
            maxHeight: menuPosition.maxHeight,
            overflowY: "auto",
            zIndex: 10050,
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {allowEmpty ? (
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              className={value === "" ? "is-active" : ""}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                selectOption("" as T);
              }}
            >
              <b>{emptyLabel}</b>
            </button>
          ) : null}
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              disabled={option.disabled}
              className={value === option.value ? "is-active" : ""}
              onPointerDown={(event) => {
                if (option.disabled) return;
                event.preventDefault();
                event.stopPropagation();
                selectOption(option.value);
              }}
            >
              <b>{option.label}</b>
              {option.description ? <small>{option.description}</small> : null}
            </button>
          ))}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <div
        ref={rootRef}
        dir={locale === "ar" ? "rtl" : "ltr"}
        className={[
          "imkan-option-picker",
          fullWidth ? "is-full" : "",
          open ? "is-open" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <button
          type="button"
          className={["imkan-option-picker-trigger", triggerClassName].filter(Boolean).join(" ")}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={() => {
            if (!disabled) setOpen((current) => !current);
          }}
        >
          <span className="imkan-option-picker-trigger-label">
            {selected?.label ?? placeholder ?? emptyLabel}
          </span>
          <Icons.chevD size={12} />
        </button>
      </div>
      {menu}
    </>
  );
}
