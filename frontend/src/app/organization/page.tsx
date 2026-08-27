"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../../components/locale-provider";
import { getCurrentUserId } from "../../lib/api/jwt";
import {
  createOrganizationAccount,
  getOrganization,
  inviteOrganizationMember,
  listOrganizationInvitations,
  listOrganizationMembers,
  removeOrganizationMember,
  revokeOrganizationInvitation,
  updateOrganization,
  updateOrganizationMember,
  type Invitation,
  type OrgMember,
  type OrgRole,
  type Organization,
} from "../../lib/api/organization";
import { ApiError } from "../../lib/api/client";

function initialsOf(value: string): string {
  return value.slice(0, 2).toUpperCase();
}

/**
 * دالة آمنة لتنسيق التواريخ تجنباً لخطأ RangeError: Invalid time value
 */
function formatDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "—";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

type InvitationState = "pending" | "accepted" | "revoked" | "expired";

export default function OrganizationPage() {
  const { label } = useLocale();
  const currentUserId = getCurrentUserId();
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("MEMBER");
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountRole, setAccountRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [accountSuccess, setAccountSuccess] = useState("");

  async function load() {
    try {
      const [o, m, i] = await Promise.all([
        getOrganization(),
        listOrganizationMembers(),
        listOrganizationInvitations(),
      ]);
      setOrg(o);
      setName(o.name);
      setMembers(m);
      setInvitations(i);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load organization");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await updateOrganization(name);
      await load();
      setNotice("org.saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update organization");
    } finally {
      setBusy(false);
    }
  }

  async function invite() {
    setBusy(true);
    setError("");
    setNotice("");
    setInviteUrl("");
    try {
      const r = await inviteOrganizationMember(email, role);
      setInviteUrl(r.inviteUrl);
      setEmail("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create invitation");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Creates a brand-new user account inside the organization.
   * Backend enforces the SUPER_ADMIN-only rule; any non-Super Admin receives a
   * 403 FORBIDDEN_NOT_SUPER_ADMIN response with the localized denial message.
   */
  async function createAccount() {
    setBusy(true);
    setError("");
    setNotice("");
    setAccountSuccess("");
    try {
      await createOrganizationAccount({
        name: accountName.trim(),
        email: accountEmail.trim(),
        password: accountPassword,
        role: accountRole,
      });
      const createdEmail = accountEmail.trim().toLowerCase();
      setAccountSuccess(createdEmail);
      setAccountName("");
      setAccountEmail("");
      setAccountPassword("");
      setAccountRole("MEMBER");
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "FORBIDDEN_NOT_SUPER_ADMIN") {
        setError(label("org.createAccount.denied"));
      } else if (e instanceof ApiError && e.code === "ACCOUNT_EXISTS") {
        setError(label("org.createAccount.exists"));
      } else if (e instanceof ApiError && e.status === 401) {
        setError(label("error.unauthenticated"));
      } else if (e instanceof ApiError && e.status === 400 && e.message) {
        setError(e.message);
      } else if (e instanceof Error && e.message) {
        setError(e.message);
      } else {
        setError(label("error.generic"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  function invitationState(item: Invitation): InvitationState {
    if (item.acceptedAt) return "accepted";
    if (item.revokedAt) return "revoked";
    if (item.expiresAt) {
      const expDate = new Date(item.expiresAt);
      if (!isNaN(expDate.getTime()) && expDate < new Date()) {
        return "expired";
      }
    }
    return "pending";
  }

  const stateBadge = useMemo(
    () =>
      ({
        pending: { className: "wd-badge wd-badge-amber", key: "org.status.pending" },
        accepted: { className: "wd-badge wd-badge-green", key: "org.status.accepted" },
        revoked: { className: "wd-badge wd-badge-gray", key: "org.status.revoked" },
        expired: { className: "wd-badge wd-badge-red", key: "org.status.expired" },
      }) satisfies Record<InvitationState, { className: string; key: string }>,
    [],
  );

  if (org?.role !== "ADMIN" && org?.role !== "SUPER_ADMIN") {
    return (
      <div className="wd-page">
        <div className="wd-alert">{label("org.adminRequired")}</div>
      </div>
    );
  }

  return (
    <div className="wd-page">
      <header className="wd-page-head">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="wd-avatar wd-avatar-lg" aria-hidden="true">
            {(org?.name ?? "O").slice(0, 1)}
          </span>
          <div className="wd-page-head-titles">
            <h1>{label("org.title")}</h1>
            <p>{label("org.description")}</p>
          </div>
        </div>
        <div className="wd-page-head-actions">
          <span className="wd-badge wd-badge-blue">{label(`org.role.${org?.role ?? "MEMBER"}` as Parameters<typeof label>[0])}</span>
          <span className="wd-badge wd-badge-gray">
            {members.length} {label("org.members")}
          </span>
        </div>
      </header>

      {error ? <div className="wd-alert" role="alert">{error}</div> : null}
      {!error && notice ? <div className="wd-alert wd-alert-success" role="status">{label(notice as Parameters<typeof label>[0])}</div> : null}

      {org?.role === "SUPER_ADMIN" ? (
        <section className="wd-card">
          <div className="wd-card-head">
            <div>
              <h2>{label("org.createAccount.heading")}</h2>
              <p>{label("org.createAccount.description")}</p>
            </div>
          </div>
          <form
            className="wd-card-body"
            onSubmit={(event) => {
              event.preventDefault();
              void createAccount();
            }}
          >
            <div className="wd-field">
              <label htmlFor="account-name">{label("org.createAccount.name")}</label>
              <input
                id="account-name"
                className="wd-input"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="wd-field">
              <label htmlFor="account-email">{label("org.createAccount.email")}</label>
              <input
                id="account-email"
                className="wd-input"
                type="email"
                value={accountEmail}
                placeholder="member@example.com"
                autoComplete="off"
                onChange={(e) => setAccountEmail(e.target.value)}
              />
            </div>
            <div className="wd-field">
              <label htmlFor="account-password">{label("org.createAccount.password")}</label>
              <input
                id="account-password"
                className="wd-input"
                type="password"
                value={accountPassword}
                minLength={8}
                required
                autoComplete="new-password"
                onChange={(e) => setAccountPassword(e.target.value)}
              />
            </div>
            <div className="wd-field">
              <label htmlFor="account-role">{label("org.createAccount.role")}</label>
              <select
                id="account-role"
                className="wd-input"
                value={accountRole}
                onChange={(e) => setAccountRole(e.target.value as "MEMBER" | "ADMIN")}
              >
                <option value="MEMBER">{label("org.role.MEMBER")}</option>
                <option value="ADMIN">{label("org.role.ADMIN")}</option>
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                className="wd-btn wd-btn-primary"
                disabled={busy || !accountName.trim() || !accountEmail.trim() || accountPassword.length < 8}
              >
                {label("org.createAccount.submit")}
              </button>
            </div>
            {accountSuccess ? (
              <div className="wd-alert wd-alert-success" role="status" style={{ marginTop: 4 }}>
                {label("org.createAccount.success")} <strong>{accountSuccess}</strong>
              </div>
            ) : null}
          </form>
        </section>
      ) : null}

      <div className="wd-grid-2">
        <section className="wd-card">
          <div className="wd-card-head">
            <div>
              <h2>{label("org.settings")}</h2>
              <p>{label("org.settingsDescription")}</p>
            </div>
          </div>
          <form
            className="wd-card-body"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="wd-field">
              <label htmlFor="org-name">{label("org.orgName")}</label>
              <input id="org-name" className="wd-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" className="wd-btn wd-btn-primary" disabled={busy || !name.trim()}>
                {label("org.save")}
              </button>
            </div>
          </form>
        </section>

        <section className="wd-card">
          <div className="wd-card-head">
            <div>
              <h2>{label("org.inviteTitle")}</h2>
              <p>{label("org.inviteDescription")}</p>
            </div>
          </div>
          <form
            className="wd-card-body"
            onSubmit={(event) => {
              event.preventDefault();
              void invite();
            }}
          >
            <div className="wd-field">
              <label htmlFor="invite-email">{label("org.inviteEmail")}</label>
              <input
                id="invite-email"
                className="wd-input"
                type="email"
                value={email}
                placeholder="member@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="wd-field">
              <label htmlFor="invite-role">{label("org.inviteRole")}</label>
              <select id="invite-role" className="wd-input" value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
                <option value="MEMBER">{label("org.role.MEMBER")}</option>
                <option value="ADMIN">{label("org.role.ADMIN")}</option>
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" className="wd-btn wd-btn-primary" disabled={busy || !email.trim()}>
                {label("org.inviteButton")}
              </button>
            </div>
            {inviteUrl ? (
              <div className="wd-alert wd-alert-success" role="status" style={{ marginTop: 4 }}>
                <div>
                  {label("org.inviteSuccess")}{" "}
                  <a href={inviteUrl}>{inviteUrl}</a>
                  <div style={{ marginTop: 8 }}>
                    <button type="button" className="wd-btn wd-btn-ghost wd-btn-sm" onClick={() => void copyInvite()}>
                      {copied ? label("org.inviteCopied") : label("org.inviteCopy")}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </form>
        </section>
      </div>

      <section className="wd-card">
        <div className="wd-card-head">
          <div>
            <h2>
              {label("org.members")}{" "}
              <span className="wd-count-pill ms-1 align-middle">{members.length}</span>
            </h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="wd-table min-w-[40rem]">
            <thead>
              <tr>
                <th>{label("shared.name")}</th>
                <th>{label("org.inviteEmail")}</th>
                <th>{label("org.inviteRole")}</th>
                <th>{label("org.memberJoined")}</th>
                <th className="num"><span className="sr-only">{label("files.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="wd-name-cell">
                      <span className="wd-avatar">{initialsOf(m.name || m.email)}</span>
                      <span className="wd-name-link">{m.name || "—"}</span>
                    </div>
                  </td>
                  <td className="imkan-muted">{m.email}</td>
                  <td>
                    <select
                      aria-label={`${m.email}: ${label("org.inviteRole")}`}
                      className="wd-input"
                      style={{ height: 30, width: "auto", paddingInline: 8 }}
                      value={m.role}
                      disabled={m.id === currentUserId}
                      onChange={async (e) => {
                        try {
                          await updateOrganizationMember(m.id, e.target.value as OrgRole);
                          await load();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Unable to change role");
                        }
                      }}
                    >
                      <option value="MEMBER">{label("org.role.MEMBER")}</option>
                      <option value="ADMIN">{label("org.role.ADMIN")}</option>
                    </select>
                  </td>
                  <td className="imkan-muted">
                    {formatDate(m.joinedAt ?? m.createdAt)}
                  </td>
                  <td className="num">
                    <button
                      type="button"
                      className="wd-btn wd-btn-danger wd-btn-sm"
                      disabled={m.id === currentUserId}
                      onClick={async () => {
                        if (!window.confirm(label("org.removeConfirm"))) return;
                        try {
                          await removeOrganizationMember(m.id);
                          await load();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Unable to remove member");
                        }
                      }}
                    >
                      ✕ {label("org.remove")}
                    </button>
                  </td>
                </tr>
              ))}
              {members.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="wd-empty">
                      <p>{label("org.membersEmpty")}</p>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="wd-card">
        <div className="wd-card-head">
          <div>
            <h2>
              {label("org.invitations")}{" "}
              <span className="wd-count-pill ms-1 align-middle">{invitations.length}</span>
            </h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="wd-table min-w-[42rem]">
            <thead>
              <tr>
                <th>{label("org.inviteEmail")}</th>
                <th>{label("org.inviteRole")}</th>
                <th>{label("shared.status")}</th>
                <th>{label("org.sent")}</th>
                <th>{label("org.invitedBy")}</th>
                <th className="num"><span className="sr-only">{label("files.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((i) => {
                const state = invitationState(i);
                const badge = stateBadge[state];
                return (
                  <tr key={i.id}>
                    <td className="imkan-muted" style={{ fontWeight: 600, color: "#333a42" }}>{i.email}</td>
                    <td>{label(`org.role.${i.role}` as Parameters<typeof label>[0])}</td>
                    <td>
                      <span className={badge.className}>{label(badge.key as Parameters<typeof label>[0])}</span>
                    </td>
                    <td className="imkan-muted">
                      {formatDate(i.createdAt)}
                    </td>
                    <td className="imkan-muted">{i.invitedBy?.name || i.invitedBy?.email || "—"}</td>
                    <td className="num">
                      {state === "pending" ? (
                        <button
                          type="button"
                          className="wd-btn wd-btn-danger wd-btn-sm"
                          onClick={async () => {
                            try {
                              await revokeOrganizationInvitation(i.id);
                              await load();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Unable to revoke invitation");
                            }
                          }}
                        >
                          {label("org.status.revoked")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {invitations.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="wd-empty">
                      <p>{label("org.invitationsEmpty")}</p>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}