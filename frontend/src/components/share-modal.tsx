"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale } from "./locale-provider";
import { Modal } from "./modal";
import { Toast } from "./toast";
import { buildCreateShareBody, createShare } from "../lib/api/shares";
import { listOrganizationMembers, type OrgMember } from "../lib/api/organization";
import { friendlyErrorMessageKey } from "../lib/friendly-error";

type SharePermission = "VIEW" | "COMMENT" | "EDIT";
type ExpiryKind = "never" | "1d" | "7d" | "30d" | "custom";
type ShareTab = "link" | "invite";

const EXPIRY_DAYS: Record<Exclude<ExpiryKind, "never" | "custom">, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
};

const PERMISSION_OPTIONS: SharePermission[] = ["VIEW", "COMMENT", "EDIT"];

/** Localized option label for a share permission, built from `share.permission.<ROLE>`. */
function permissionOptionLabel(option: SharePermission): string {
  return `share.permission.${option}`;
}

export function ShareModal({
  resourceType,
  resourceId,
  onClose,
}: {
  resourceType: "FILE" | "FOLDER";
  resourceId: string;
  onClose: () => void;
}) {
  const { label } = useLocale();
  const [activeTab, setActiveTab] = useState<ShareTab>("link");
  const [password, setPassword] = useState("");
  const [expiryKind, setExpiryKind] = useState<ExpiryKind>("never");
  const [customExpiryDate, setCustomExpiryDate] = useState("");
  const [canDownload, setCanDownload] = useState(true);
  const [recipientUserIds, setRecipientUserIds] = useState<string[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [permission, setPermission] = useState<SharePermission>("VIEW");
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void listOrganizationMembers({ status: "ACTIVE" })
      .then(setMembers)
      .catch(() => setMembers([]));
  }, []);

  const filteredMembers = members.filter((m) =>
    `${m.name ?? ""} ${m.email}`.toLowerCase().includes(memberQuery.toLowerCase()),
  );

  function toggleRecipient(userId: string) {
    setRecipientUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  /** Turns the expiry selection into an ISO `expires_at` timestamp (or undefined). */
  function expiresAtValue(): string | undefined {
    if (expiryKind === "custom") {
      if (!customExpiryDate) return undefined;
      const date = new Date(`${customExpiryDate}T23:59:59`);
      return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    }
    if (expiryKind === "never") return undefined;
    return new Date(Date.now() + EXPIRY_DAYS[expiryKind] * 86_400_000).toISOString();
  }

  /** Writes text to the clipboard; surfaces a friendly, localized error on failure. */
  async function copyToClipboard(text: string): Promise<boolean> {
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (cause) {
      setError(label(friendlyErrorMessageKey(cause)));
      return false;
    }
  }

  async function runSubmit(recipients: string[]): Promise<boolean> {
    setError(null);
    setLinkUrl(null);
    setSubmitting(true);
    try {
      const result = await createShare(
        buildCreateShareBody({
          resourceType,
          resourceId,
          password: password || undefined,
          expiresAt: expiresAtValue(),
          canDownload,
          recipientUserIds: recipients,
          permission,
        }),
      );
      setLinkUrl(result.link_url);
      return true;
    } catch (cause) {
      setError(label(friendlyErrorMessageKey(cause)));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    await runSubmit(activeTab === "invite" ? recipientUserIds : []);
  }

  async function onCopyLink() {
    if (!linkUrl) return;
    const ok = await copyToClipboard(linkUrl);
    if (ok) {
      setCopied(true);
      setToast(label("share.linkCopied"));
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  const disableSubmit = submitting || (activeTab === "invite" && recipientUserIds.length === 0);

  const permissionField = (
    <div className="wd-field">
      <label>{label("share.permission")}</label>
      <select
        value={permission}
        onChange={(event) => setPermission(event.target.value as SharePermission)}
        className="wd-input"
      >
        {PERMISSION_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {label(permissionOptionLabel(option) as Parameters<typeof label>[0])}
          </option>
        ))}
      </select>
    </div>
  );

  const downloadField = (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={canDownload}
        onChange={(event) => setCanDownload(event.target.checked)}
      />
      <span>{label("share.allowDownload")}</span>
    </label>
  );

  const actionButtons = (
    <div className="flex justify-end gap-2">
      <button type="button" className="wd-btn wd-btn-ghost" onClick={onClose}>
        {label("share.cancel")}
      </button>
      <button type="submit" className="wd-btn wd-btn-primary" disabled={disableSubmit}>
        {submitting ? "…" : label("share.submit")}
      </button>
    </div>
  );

  return (
    <Modal title={label("share.title")} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="zoho-view-toggle">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "link"}
            className={`zoho-view-btn${activeTab === "link" ? " active" : ""}`}
            onClick={() => {
              setActiveTab("link");
              setError(null);
              setLinkUrl(null);
            }}
          >
            {label("share.tab.link")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "invite"}
            className={`zoho-view-btn${activeTab === "invite" ? " active" : ""}`}
            onClick={() => {
              setActiveTab("invite");
              setError(null);
              setLinkUrl(null);
            }}
          >
            {label("share.tab.invite")}
          </button>
        </div>

        {error ? (
          <p className="mb-3 text-red-500 text-[length:var(--imkan-font-size-secondary)]">{error}</p>
        ) : null}

        {linkUrl ? (
          <div className="flex flex-col gap-2">
            <div className="wd-alert wd-alert-success break-all">
              <strong className="block font-medium">{label("share.created")}</strong>
              <code className="block break-all text-[length:var(--imkan-font-size-secondary)]">{linkUrl}</code>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="wd-btn wd-btn-ghost wd-btn-sm"
                onClick={() => void onCopyLink()}
              >
                {copied ? label("share.copied") : label("share.copyLink")}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col">
            {activeTab === "link" ? (
              <>
                <div className="wd-field">
                  <label>{label("share.password")}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="wd-input"
                    placeholder={label("share.password")}
                    minLength={8}
                  />
                </div>
                <div className="wd-field">
                  <label>{label("share.expires")}</label>
                  <select
                    value={expiryKind}
                    onChange={(event) => setExpiryKind(event.target.value as ExpiryKind)}
                    className="wd-input"
                  >
                    <option value="never">{label("share.expiry.never")}</option>
                    <option value="1d">{label("share.expiry.1d")}</option>
                    <option value="7d">{label("share.expiry.7d")}</option>
                    <option value="30d">{label("share.expiry.30d")}</option>
                    <option value="custom">{label("share.expiry.custom")}</option>
                  </select>
                </div>
                {expiryKind === "custom" ? (
                  <div className="wd-field">
                    <label>{label("share.expiry.custom")}</label>
                    <input
                      type="date"
                      value={customExpiryDate}
                      onChange={(event) => setCustomExpiryDate(event.target.value)}
                      className="wd-input"
                      min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
                    />
                  </div>
                ) : null}
                {downloadField}
                {permissionField}
              </>
            ) : (
              <>
                <div className="wd-field">
                  <label>{label("share.recipients.search")}</label>
                  <input
                    type="search"
                    value={memberQuery}
                    onChange={(event) => setMemberQuery(event.target.value)}
                    className="wd-input"
                    placeholder={label("share.recipients.search")}
                  />
                </div>
                {filteredMembers.length === 0 ? (
                  <p className="mb-3 text-[length:var(--imkan-font-size-secondary)]">
                    {label("share.recipients.none")}
                  </p>
                ) : (
                  <div className="imkan-share-recipient-list">
                    {filteredMembers.slice(0, 8).map((member) => {
                      const displayName = member.name?.trim() || member.email.split("@")[0];
                      const selected = recipientUserIds.includes(member.userId);
                      return (
                        <button
                          type="button"
                          key={member.userId}
                          className={`imkan-share-recipient${selected ? " selected" : ""}`}
                          onClick={() => toggleRecipient(member.userId)}
                        >
                          <span className="imkan-share-avatar">
                            {displayName.slice(0, 2).toUpperCase()}
                          </span>
                          <span>
                            <b>{displayName}</b>
                            <small>{member.email}</small>
                          </span>
                          <span>{selected ? "✓" : "＋"}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {permissionField}
                {downloadField}
              </>
            )}
            {actionButtons}
          </form>
        )}
      </div>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </Modal>
  );
}