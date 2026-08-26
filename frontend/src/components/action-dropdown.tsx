"use client";

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverClose,
} from "@radix-ui/react-popover";
import { useLocale } from "./locale-provider";

export type ActionDropdownItem = {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  icon?: React.ReactNode;
  dividerBefore?: boolean;
};

interface ActionGroup {
  label?: string;
  items: ActionDropdownItem[];
}

interface ActionDropdownProps {
  label: string;
  items: ActionDropdownItem[];
  trigger?: React.ReactNode;
}

const actionIcons: Record<string, React.ReactNode> = {
  "تنزيل": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
  "Download": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
  "إعادة تسمية": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /><path d="m15 5 4 4" /></svg>,
  "Rename": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /><path d="m15 5 4 4" /></svg>,
  "نقل": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 9l7-7 7 7" /><path d="M12 2v20" /><path d="M3 5h18" /><path d="M3 19h18" /></svg>,
  "Move": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 9l7-7 7 7" /><path d="M12 2v20" /><path d="M3 5h18" /><path d="M3 19h18" /></svg>,
  "مشاركة": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>,
  "Share": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>,
  "حذف": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
  "Delete": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
  "نسخ": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>,
  "Copy": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>,
  "إضافة إلى المفضلة": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
  "Add to favorites": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
  "إزالة من المفضلة": <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
  "Remove from favorites": <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
  "معاينة": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3z" /><path d="M9 9h6" /><path d="M9 13h6" /><path d="M9 17h6" /></svg>,
  "Preview": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3z" /><path d="M9 9h6" /><path d="M9 13h6" /><path d="M9 17h6" /></svg>,
  "سجل الإصدارات": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 1v6" /><path d="M12 17v6" /><path d="M4.93 4.93l4.24 4.24" /><path d="M14.83 14.83l4.24 4.24" /><path d="M2 12h6" /><path d="M16 12h6" /></svg>,
  "Version History": <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 1v6" /><path d="M12 17v6" /><path d="M4.93 4.93l4.24 4.24" /><path d="M14.83 14.83l4.24 4.24" /><path d="M2 12h6" /><path d="M16 12h6" /></svg>,
};

function getIconForLabel(label: string): React.ReactNode | undefined {
  return actionIcons[label];
}

function groupItems(items: ActionDropdownItem[]): ActionGroup[] {
  const groups: ActionGroup[] = [];
  let currentGroup: ActionDropdownItem[] = [];

  items.forEach((item, index) => {
    if (item.dividerBefore && currentGroup.length > 0) {
      groups.push({ items: currentGroup });
      currentGroup = [];
    }
    currentGroup.push(item);
  });

  if (currentGroup.length > 0) {
    groups.push({ items: currentGroup });
  }

  return groups;
}

export function ActionDropdown({ label, items, trigger }: ActionDropdownProps) {
  const { label: t } = useLocale();
  const groupedItems = groupItems(items);

  const defaultTrigger = (
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label={label}
        className="imkan-button-secondary p-1.5"
        aria-haspopup="menu"
      >
        <span aria-hidden="true" className="text-[length:var(--imkan-font-size-ui)]">⋯</span>
      </button>
    </PopoverTrigger>
  );

  return (
    <Popover>
      {trigger ?? defaultTrigger}
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={4}
        className="imkan-popover z-50 w-56 p-1 shadow-xl bg-white rounded-lg border border-[color:var(--imkan-color-border)]"
        style={{ minWidth: "224px" }}
      >
        {groupedItems.map((group, groupIndex) => (
          <div key={groupIndex} className={groupIndex > 0 ? "border-t border-[color:var(--imkan-color-border)] pt-1" : ""}>
            {group.items.map((item) => (
              <PopoverClose key={item.label} asChild>
                <button
                  type="button"
                  role="menuitem"
                  className={`w-full flex items-center gap-2 px-3 py-2 text-start text-[length:var(--imkan-font-size-secondary)] rounded-sm hover:bg-[color:var(--imkan-color-surface)] transition-colors ${
                    item.destructive
                      ? "text-[color:var(--imkan-color-error)] hover:bg-[color:var(--imkan-color-error)]/10"
                      : "text-[color:var(--imkan-color-foreground)]"
                  }`}
                  onClick={() => {
                    item.onSelect();
                  }}
                >
                  {item.icon ?? getIconForLabel(item.label) ? (
                    <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-[color:var(--imkan-color-muted)]">
                      {item.icon ?? getIconForLabel(item.label)}
                    </span>
                  ) : (
                    <span className="w-5" />
                  )}
                  <span className="flex-1 truncate">{item.label}</span>
                </button>
              </PopoverClose>
            ))}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}