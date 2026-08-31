"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "./locale-provider";
import type { MessageKey } from "../i18n";
import {
  ORG_SYNC_CHANNEL,
  parseOrgSwitchMessage,
} from "./view-mode-logic";
import {
  clearSession,
  listMemberships,
  logout as apiLogout,
  switchOrganization as apiSwitchOrganization,
  type OrganizationMembershipSummary,
} from "../lib/api/auth";

function roleLabel(key: string, fallback: (messageKey: MessageKey) => string): string {
  // Membership roles are rendered through the shared i18n table when present.
  return key ? fallback(`org.role.${key}` as MessageKey) : "";
}

function orgInitials(name: string | null | undefined): string {
  return (name || "?").trim().slice(0, 1).toUpperCase();
}

interface OrgSwitcherProps {
  organizationName: string;
  userRole: string;
}

/**
 * Multi-tenant selector. Switching mints a fresh tenant-scoped JWT, persists
 * it, and broadcasts the new org id over BroadcastChannel so every other open
 * tab reloads into the same context without logging out.
 */
export function OrgSwitcher({ organizationName, userRole }: OrgSwitcherProps) {
  const { label } = useLocale();
  const [open, setOpen] = useState(false);
  const [memberships, setMemberships] = useState<OrganizationMembershipSummary[]>([]);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("workdrive_access_token") : null;
    if (!token) return;
    listMemberships(token).then(setMemberships).catch(() => setMemberships([]));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(ORG_SYNC_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent) => {
      const message = parseOrgSwitchMessage(event.data);
      // Another tab switched tenants: reload here so the JWT/org never diverge.
      if (message && !window.location.pathname.startsWith("/auth/")) window.location.reload();
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function onSwitch(organizationId: string) {
    if (switchingId) return;
    const token = localStorage.getItem("workdrive_access_token");
    if (!token) return;
    setSwitchingId(organizationId);
    try {
      const result = await apiSwitchOrganization(token, organizationId);
      try {
        await apiLogout(token);
      } catch {
        // Best-effort revocation of the previous tenant session; the new one
        // below is already valid, so revocation failure must not block.
      }
      localStorage.setItem("workdrive_access_token", result.access_token);
      localStorage.setItem("workdrive_user", JSON.stringify(result.user));
      channelRef.current?.postMessage({ type: "org-switched", organizationId });
      window.location.reload();
    } catch {
      setSwitchingId(null);
      setOpen(false);
    }
  }

  const roleText = roleLabel(userRole, label);

  return (
    <div className="zoho-org-switch" ref={containerRef}>
      <button
        type="button"
        className="zoho-team-switch"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${organizationName} — ${label("nav.switchOrg")}`}
      >
        <span className="zoho-team-avatar" aria-hidden="true">{orgInitials(organizationName)}</span>
        <span className="zoho-team-meta">
          <strong>{organizationName || label("brand.workspace")}</strong>
          <small>{roleText || label("org.myWorkDrive")}</small>
        </span>
        <span className={`chevron${open ? " open" : ""}`} aria-hidden="true">⌄</span>
      </button>
      {open ? <OrgMenu memberships={memberships} switchingId={switchingId} onSwitch={onSwitch} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

interface OrgMenuProps {
  memberships: OrganizationMembershipSummary[];
  switchingId: string | null;
  onSwitch: (organizationId: string) => Promise<void>;
  onClose: () => void;
}

function OrgMenu({ memberships, switchingId, onSwitch, onClose }: OrgMenuProps) {
  const { label } = useLocale();
  return (
    <div className="zoho-profile-menu zoho-org-menu" role="menu">
      <div className="zoho-profile-rule" />
      {memberships.length === 0 ? (
        <div className="zoho-org-empty">{label("org.noOtherOrgs")}</div>
      ) : null}
      {memberships.map((membership) => (
        <button
          key={membership.id}
          type="button"
          role="menuitem"
          disabled={switchingId !== null}
          onClick={() => void onSwitch(membership.organizationId)}
        >
          <span className="zoho-team-avatar sm" aria-hidden="true">{orgInitials(membership.organization.name)}</span>
          <span className="zoho-org-item-text">
            <strong>{membership.organization.name}</strong>
            <small>{roleLabel(membership.role, label)}</small>
          </span>
          {switchingId === membership.organizationId ? <span className="zoho-spinner" aria-label="…" /> : null}
        </button>
      ))}
      <div className="zoho-profile-rule" />
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose();
          clearSession();
          void apiLogout(localStorage.getItem("workdrive_access_token") ?? "").catch(() => undefined).finally(() => {
            window.location.assign("/auth/login");
          });
        }}
      >
        {label("nav.signOut")}
      </button>
    </div>
  );
}
