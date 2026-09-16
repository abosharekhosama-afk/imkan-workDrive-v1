import { memo } from "react";

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  if (name) {
    return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "؟";
}

export interface OwnerCellProps {
  /** Preferred display name — resolves `createdBy.name` or `owner.name` upstream. */
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  compact?: boolean;
}

/**
 * Owner/creator chip used by both the file table and grid card footers.
 * Tolerates missing data: avatar → initials → "؟", never an empty cell.
 */
export const OwnerCell = memo(function OwnerCell({ name, email, avatarUrl, compact = false }: OwnerCellProps) {
  const initials = getInitials(name, email);
  const sizeClass = compact ? "zoho-owner-avatar sm" : "zoho-owner-avatar";
  const hasAvatar = Boolean(avatarUrl && avatarUrl.length > 0);

  return (
    <div className="zoho-owner-cell">
      {hasAvatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatars come from arbitrary storage URLs with unknown dimensions
        <img src={avatarUrl as string} alt="" className={`${sizeClass} rounded-full object-cover`} />
      ) : (
        <span className={sizeClass} aria-hidden="true">{initials}</span>
      )}
      {!compact ? <span className="zoho-owner-name">{name ?? email ?? "—"}</span> : null}
    </div>
  );
});
