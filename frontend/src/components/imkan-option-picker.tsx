"use client";

import { useEffect, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, [open]);

  const menuClasses = [
    "imkan-option-picker-menu",
    menuWidth === "wide" ? "imkan-option-picker-menu-wide" : "",
    menuClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={rootRef}
      className={[
        "imkan-option-picker",
        fullWidth ? "is-full" : "",
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
      {open ? (
        <div className={menuClasses} role="listbox" aria-label={ariaLabel}>
          {allowEmpty ? (
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              className={value === "" ? "is-active" : ""}
              onClick={() => {
                onChange("" as T);
                setOpen(false);
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
              onClick={() => {
                if (option.disabled) return;
                onChange(option.value);
                setOpen(false);
              }}
            >
              <b>{option.label}</b>
              {option.description ? <small>{option.description}</small> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
