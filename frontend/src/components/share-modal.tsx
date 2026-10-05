"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale } from "./locale-provider";
import { Modal } from "./modal";
import { Toast } from "./toast";
import { buildCreateShareBody, createShare } from "../lib/api/shares";
import { listOrganizationMembers, type OrgMember } from "../lib/api/organization";
import { listSharedByMe, removeShareRecipient, revokeShare, updateShareRecipientPermission, type SharedItem } from "../lib/api/shared";
import { friendlyErrorMessageKey } from "../lib/friendly-error";
import { normalizePublicAppUrl } from "../lib/public-url";
import { buildShareEmbedCode, resolveShareLaunch, type ShareLaunchMode } from "../lib/share-launch-logic";
import { sharesForResource } from "../lib/share-resource-logic";


type SharePermission = "VIEW" | "COMMENT" | "EDIT" | "ORGANIZE" | "FULL_ACCESS";
type ExpiryKind = "1d" | "7d" | "30d" | "custom";
type RequestDataKind = "name" | "email" | "company" | "phone";

const EXPIRY_DAYS: Record<Exclude<ExpiryKind, "custom">, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
};

const REQUEST_DATA: Array<{ value: RequestDataKind; en: string; ar: string }> = [
  { value: "name", en: "Name", ar: "الاسم" },
  { value: "email", en: "Email", ar: "البريد الإلكتروني" },
  { value: "company", en: "Company", ar: "الشركة" },
  { value: "phone", en: "Phone", ar: "الهاتف" },
];

function permissionOptionLabel(option: SharePermission): string {
  return `share.permission.${option}`;
}

function InfoIcon() {
  return <span className="share-zoho-info" aria-hidden>i</span>;
}

function EyeIcon({ off = false }: { off?: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      {off ? <><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/></> : null}
      <path d="M2.5 12s3.2-5.2 9.5-5.2S21.5 12 21.5 12 18.3 17.2 12 17.2 2.5 12 2.5 12Z"/>
      {!off ? <circle cx="12" cy="12" r="2.2"/> : null}
    </svg>
  );
}

function ClockIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3.2 2"/></svg>;
}

function ShareIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M14 5h5v5"/><path d="M19 5 10 14"/><path d="M19 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"/></svg>;
}

function CloseIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="m6 6 12 12M18 6 6 18"/></svg>;
}

function ShareToggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`share-zoho-toggle${checked ? " is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function ShareOptionMenu({
  value,
  options,
  onChange,
  align = "end",
}: {
  value: string;
  options: Array<{ value: string; label: string; description?: string }>;
  onChange: (value: string) => void;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && (target as Element).closest("[data-share-option-menu]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const selected = options.find((option) => option.value === value) ?? options[0];
  if (!selected) return null;
  return (
    <div className="share-zoho-option-wrap" data-share-option-menu>
      <button type="button" className="share-zoho-option-trigger" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span>{selected.label}</span><span className="share-zoho-chevron">⌄</span>
      </button>
      {open ? (
        <div className={`share-zoho-option-menu ${align === "start" ? "start-0" : "end-0"}`} role="listbox">
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              className={`share-zoho-option${option.value === value ? " selected" : ""}`}
              onClick={() => { onChange(option.value); setOpen(false); }}
            >
              <span className="share-zoho-option-check">{option.value === value ? "✓" : ""}</span>
              <span className="min-w-0 flex-1"><b>{option.label}</b>{option.description ? <small>{option.description}</small> : null}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function fieldDateValue(kind: ExpiryKind, custom: string): string {
  if (kind === "custom") return custom;
  return new Date(Date.now() + EXPIRY_DAYS[kind] * 86_400_000).toISOString().slice(0, 16);
}

export function ShareModal({
  resourceType,
  resourceId,
  resourceName,
  launchMode = "link",
  onClose,
  onChanged,
}: {
  resourceType: "FILE" | "FOLDER";
  resourceId: string;
  resourceName?: string;
  launchMode?: ShareLaunchMode;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [currentMode, setCurrentMode] = useState<ShareLaunchMode>(launchMode);
  const launch = useMemo(() => resolveShareLaunch(currentMode), [currentMode]);
  const { label, locale } = useLocale();
  const permissionOptions: SharePermission[] = resourceType === "FOLDER"
    ? ["VIEW", "COMMENT", "EDIT", "ORGANIZE", "FULL_ACCESS"]
    : ["VIEW", "COMMENT", "EDIT", "FULL_ACCESS"];

  const [linkName, setLinkName] = useState("");
  const [permission, setPermission] = useState<SharePermission>("VIEW");
  const [passwordEnabled, setPasswordEnabled] = useState(launchMode === "link");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [expiryEnabled, setExpiryEnabled] = useState(launchMode !== "invite");
  const [expiryKind, setExpiryKind] = useState<ExpiryKind>("custom");
  const [customExpiryDate, setCustomExpiryDate] = useState(() => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 16));
  const [canDownload, setCanDownload] = useState(true);
  const [downloadLimitEnabled, setDownloadLimitEnabled] = useState(launchMode === "downloadLink");
  const [downloadLimit, setDownloadLimit] = useState("0");
  const [requestUserDataEnabled, setRequestUserDataEnabled] = useState(launchMode === "link");
  const [requestUserData, setRequestUserData] = useState<RequestDataKind>("email");
  const [recipientUserIds, setRecipientUserIds] = useState<string[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [emailRecipients, setEmailRecipients] = useState("");
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [existingShares, setExistingShares] = useState<SharedItem[]>([]);
  const [loadingShares, setLoadingShares] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyShareId, setBusyShareId] = useState<string | null>(null);
  const [linkSettingsOpen, setLinkSettingsOpen] = useState(false);
  const [linkVisibility, setLinkVisibility] = useState("COLLABORATORS");

  const refreshShares = async () => {
    setLoadingShares(true);
    try {
      const rows = await listSharedByMe();
      const mine = sharesForResource(rows, resourceType, resourceId);
      setExistingShares(mine);
      const current = mine[0];
      if (current) {
        if (current.canDownload != null) setCanDownload(current.canDownload);
        if (current.permission && permissionOptions.includes(current.permission as SharePermission)) setPermission(current.permission as SharePermission);
        if (current.expiresAt) {
          setExpiryEnabled(true);
          setExpiryKind("custom");
          setCustomExpiryDate(current.expiresAt.slice(0, 16));
        }
      }
    } catch {
      setExistingShares([]);
    } finally {
      setLoadingShares(false);
    }
  };

  useEffect(() => { void refreshShares(); }, [resourceId, launchMode]);
  useEffect(() => {
    void listOrganizationMembers({ status: "ACTIVE" }).then(setMembers).catch(() => setMembers([]));
  }, []);

  const filteredMembers = members.filter((member) => `${member.name ?? ""} ${member.email}`.toLowerCase().includes(memberQuery.toLowerCase()));
  const primaryShare = existingShares[0] ?? null;
  const displayLink = linkUrl ?? (primaryShare?.linkUrl ? normalizePublicAppUrl(primaryShare.linkUrl) : null);
  const embedCode = displayLink && launch.showEmbedPanel ? buildShareEmbedCode(displayLink) : null;

  function toggleRecipient(userId: string) {
    setRecipientUserIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
  }

  function expiresAtValue(): string | undefined {
    if (!expiryEnabled) return undefined;
    const value = fieldDateValue(expiryKind, customExpiryDate);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  async function copyToClipboard(text: string): Promise<boolean> {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (cause) { setError(label(friendlyErrorMessageKey(cause))); return false; }
  }

  async function runSubmit(recipients: string[]): Promise<string | null> {
    setError(null);
    if (passwordEnabled && password.length < 8) {
      setError(locale === "ar" ? "كلمة المرور يجب أن تكون 8 أحرف على الأقل." : "Password must be at least 8 characters.");
      return null;
    }
    setSubmitting(true);
    try {
      const result = await createShare(buildCreateShareBody({
        resourceType,
        resourceId,
        password: passwordEnabled ? password || undefined : undefined,
        expiresAt: expiresAtValue(),
        canDownload,
        recipientUserIds: recipients,
        permission,
        emailRecipients: emailRecipients.split(/[;,\s]+/).map((v) => v.trim()).filter(Boolean),
        downloadLimit: isDownloadLink && downloadLimitEnabled ? Number(downloadLimit || 0) || undefined : undefined,
        requestUserData: !isDownloadLink && requestUserDataEnabled ? [requestUserData] : undefined,
      }));
      const url = normalizePublicAppUrl(result.link_url);
      setLinkUrl(url);
      setRecipientUserIds([]);
      await refreshShares();
      onChanged?.();
      setToast(label("share.created"));
      return url;
    } catch (cause) {
      setError(label(friendlyErrorMessageKey(cause)));
      return null;
    } finally { setSubmitting(false); }
  }

  async function onCopyLink() {
    const url = displayLink ?? await runSubmit([]);
    if (!url) return;
    if (await copyToClipboard(url)) {
      setCopied(true);
      setToast(label("share.linkCopied"));
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  async function onCopyEmbed() {
    if (!embedCode) return;
    if (await copyToClipboard(embedCode)) {
      setCopiedEmbed(true);
      setToast(label("share.embedCopied"));
      window.setTimeout(() => setCopiedEmbed(false), 1800);
    }
  }

  async function onRevokeShare(shareId: string) {
    setBusyShareId(shareId);
    try { await revokeShare(shareId); setLinkUrl(null); await refreshShares(); onChanged?.(); setToast(label("share.revoked")); }
    catch (cause) { setError(label(friendlyErrorMessageKey(cause))); }
    finally { setBusyShareId(null); }
  }

  async function onRemoveRecipient(shareId: string, userId: string) {
    setBusyShareId(`${shareId}:${userId}`);
    try { await removeShareRecipient(shareId, userId); await refreshShares(); onChanged?.(); }
    catch (cause) { setError(label(friendlyErrorMessageKey(cause))); }
    finally { setBusyShareId(null); }
  }

  async function onChangeRecipientPermission(shareId: string, userId: string, next: SharePermission) {
    setBusyShareId(`${shareId}:${userId}`);
    try { await updateShareRecipientPermission(shareId, userId, next); await refreshShares(); onChanged?.(); }
    catch (cause) { setError(label(friendlyErrorMessageKey(cause))); }
    finally { setBusyShareId(null); }
  }

  const permissionOptionsForPicker = permissionOptions.map((option) => ({ value: option, label: label(permissionOptionLabel(option) as Parameters<typeof label>[0]) }));
  const accessLabel = label(permissionOptionLabel(permission) as Parameters<typeof label>[0]);
  const isDownloadLink = currentMode === "downloadLink";
  const isInvite = currentMode === "invite";
  const modalTitle: ReactNode = isDownloadLink
    ? <><span>{label("share.titleDownloadLink")}</span>{resourceName ? <span className="share-zoho-title-resource"><span className="share-zoho-file-icon"><ShareIcon /></span>{resourceName}</span> : null}</>
    : isInvite
      ? <><span>{label("share.title")}</span>{resourceName ? <span className="share-zoho-title-resource"><span className="share-zoho-file-icon"><ShareIcon /></span>{resourceName}</span> : null}</>
      : <><span>{label("share.titleExternalLink")}</span>{resourceName ? <span className="share-zoho-title-resource"><span className="share-zoho-file-icon"><ShareIcon /></span>{resourceName}</span> : null}</>;

  const linkSettingsTitle: ReactNode = <><span>Link settings</span>{resourceName ? <span className="share-zoho-title-resource"><span className="share-zoho-file-icon"><ShareIcon /></span>{resourceName}</span> : null}</>;

  return (
    <Modal title={linkSettingsOpen ? linkSettingsTitle : modalTitle} onClose={onClose} className={`share-zoho-modal ${isInvite ? "is-invite" : ""} ${isDownloadLink ? "is-download-link" : ""} ${linkSettingsOpen ? "is-link-settings" : ""}`}>
      <div className="share-zoho-content">
        {linkSettingsOpen ? (
          <div className="share-zoho-link-settings">
            <label>Who can access this file via permalink?</label>
            <ShareOptionMenu value={linkVisibility} options={[{ value: "COLLABORATORS", label: "Collaborators" }, { value: "ANYONE", label: "Anyone with the link" }, { value: "PRIVATE", label: "Private" }]} onChange={setLinkVisibility} />
            <div className="share-zoho-link-setting-url"><input readOnly value={displayLink ?? ""} /><button type="button" onClick={() => void onCopyLink()}>Copy</button></div>
            <div className="share-zoho-link-settings-footer"><button type="button" className="share-zoho-cancel-btn" onClick={() => setLinkSettingsOpen(false)}>Close</button><button type="button" className="share-zoho-primary-btn" disabled={!displayLink} onClick={() => { setLinkSettingsOpen(false); setToast("Link settings saved"); }}>Save</button></div>
          </div>
        ) : (
        <>
          {isInvite ? (
          <>
            <div className="share-zoho-invite-row">
              <div className="share-zoho-invite-input-wrap">
                <input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder={locale === "ar" ? "أضف أعضاء باستخدام البريد الإلكتروني أو مجموعة" : "Add members by their email address or from a group"} />
                <div className="share-zoho-invite-access"><span>Access Level</span><ShareOptionMenu value={permission} options={permissionOptionsForPicker} onChange={(next) => setPermission(next as SharePermission)} /></div>
              </div>
              <button type="button" className="share-zoho-primary-btn" disabled={submitting || recipientUserIds.length === 0} onClick={() => void runSubmit(recipientUserIds)}>{submitting ? "…" : "Share"}</button>
            </div>
            {memberQuery.trim() && filteredMembers.length ? (
              <div className="share-zoho-members-popover">
                {filteredMembers.slice(0, 8).map((member) => {
                  const id = member.userId || member.id;
                  const name = member.name?.trim() || member.email.split("@")[0];
                  const selected = recipientUserIds.includes(id);
                  return <button type="button" key={id} className={selected ? "selected" : ""} onClick={() => toggleRecipient(id)}><span className="share-zoho-avatar">{name.slice(0, 2).toUpperCase()}</span><span><b>{name}</b><small>{member.email}</small></span><strong>{selected ? "✓" : "+"}</strong></button>;
                })}
              </div>
            ) : null}
            <div className="share-zoho-divider" />
            <div className="share-zoho-access-heading"><b>Who can access</b><button type="button" className="share-zoho-link-button" onClick={() => { setCurrentMode("link"); setPasswordEnabled(false); setExpiryEnabled(false); }}>New external share link <span>?</span></button></div>
            <div className="share-zoho-permalink-row">
              <span className="share-zoho-round-icon">↗</span>
              <div className="min-w-0 flex-1"><b>Permalink - {primaryShare?.recipients?.length ? `${primaryShare.recipients.length} people` : "Private, not shared with anyone"}</b></div>
              <button type="button" className="share-zoho-change-visibility" onClick={() => { setLinkUrl(primaryShare?.linkUrl ? normalizePublicAppUrl(primaryShare.linkUrl) : null); setLinkSettingsOpen(true); }}>{locale === "ar" ? "تغيير مستوى الرؤية" : "Change Visibility"}</button>
            </div>
            {primaryShare?.recipients?.length ? <div className="share-zoho-recipient-list">{primaryShare.recipients.map((recipient) => <div key={recipient.userId} className="share-zoho-recipient-row"><span>{recipient.user?.name || recipient.user?.email || recipient.userId}</span><ShareOptionMenu value={(permissionOptions.includes(recipient.permission as SharePermission) ? recipient.permission : "VIEW") as SharePermission} options={permissionOptionsForPicker} onChange={(next) => void onChangeRecipientPermission(primaryShare.id, recipient.userId, next as SharePermission)} /><button type="button" onClick={() => void onRemoveRecipient(primaryShare.id, recipient.userId)} disabled={busyShareId === `${primaryShare.id}:${recipient.userId}`}>×</button></div>)}</div> : null}
            {error ? <div className="share-zoho-error">{error}</div> : null}
          </>
        ) : (
          <>
            <div className="share-zoho-link-name-row">
              <input value={linkName} onChange={(event) => setLinkName(event.target.value)} placeholder={isDownloadLink ? "Enter a link name for easy reference, eg: Event Attendees" : "Enter a link name for easy reference, eg: Event Leads"} />
              {!isDownloadLink ? <div className="share-zoho-access-field"><span>Access Level</span><ShareOptionMenu value={permission} options={permissionOptionsForPicker} onChange={(next) => setPermission(next as SharePermission)} /></div> : null}
            </div>

            {isDownloadLink ? (
              <>
                <div className="share-zoho-setting-row">
                  <span className="share-zoho-setting-label">Set download limit</span>
                  {downloadLimitEnabled ? <input className="share-zoho-inline-input" value={downloadLimit} onChange={(event) => setDownloadLimit(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /> : null}
                  <InfoIcon />
                  <ShareToggle checked={downloadLimitEnabled} onChange={setDownloadLimitEnabled} label="Set download limit" />
                </div>
                <div className="share-zoho-setting-row">
                  <span className="share-zoho-setting-label">Set expiration after</span>
                  {expiryEnabled ? <div className="share-zoho-inline-date"><input type="datetime-local" value={customExpiryDate} onChange={(event) => { setExpiryKind("custom"); setCustomExpiryDate(event.target.value); }} /><ClockIcon /></div> : null}
                  <InfoIcon />
                  <ShareToggle checked={expiryEnabled} onChange={setExpiryEnabled} label="Set expiration after" />
                </div>
              </>
            ) : (
              <>
                <div className="share-zoho-setting-row">
                  <span className="share-zoho-setting-label">Set password</span>
                  {passwordEnabled ? <div className="share-zoho-inline-password"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" minLength={8} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Show password"><EyeIcon off={showPassword} /></button></div> : null}
                  <InfoIcon />
                  <ShareToggle checked={passwordEnabled} onChange={setPasswordEnabled} label="Set password" />
                </div>
                <div className="share-zoho-setting-row">
                  <span className="share-zoho-setting-label">Set expiration after</span>
                  {expiryEnabled ? <div className="share-zoho-inline-date"><input type="datetime-local" value={customExpiryDate} onChange={(event) => { setExpiryKind("custom"); setCustomExpiryDate(event.target.value); }} /><ClockIcon /></div> : null}
                  <InfoIcon />
                  <ShareToggle checked={expiryEnabled} onChange={setExpiryEnabled} label="Set expiration after" />
                </div>
                <div className="share-zoho-setting-row">
                  <span className="share-zoho-setting-label">Show download and print options</span>
                  <InfoIcon />
                  <ShareToggle checked={canDownload} onChange={setCanDownload} label="Show download and print options" />
                </div>
                <div className="share-zoho-setting-row">
                  <span className="share-zoho-setting-label">Request user data</span>
                  {requestUserDataEnabled ? <ShareOptionMenu value={requestUserData} options={REQUEST_DATA.map((item) => ({ value: item.value, label: locale === "ar" ? item.ar : item.en }))} onChange={(next) => setRequestUserData(next as RequestDataKind)} /> : null}
                  <InfoIcon />
                  <ShareToggle checked={requestUserDataEnabled} onChange={setRequestUserDataEnabled} label="Request user data" />
                </div>
              </>
            )}

            <div className="share-zoho-note">
              <p>• This is a public link, i.e., anyone with the link can access the file, so be sure to only share this link with trusted contacts.</p>
              <p>• You can set password and expiration to restrict access to users.</p>
            </div>
            {error ? <div className="share-zoho-error">{error}</div> : null}
            <div className="share-zoho-footer-actions">
              <button type="button" className="share-zoho-cancel-btn" onClick={onClose}>Cancel</button>
              <button type="button" className="share-zoho-primary-btn" disabled={submitting} onClick={() => void runSubmit([])}>{submitting ? "…" : "Create"}</button>
            </div>
          </>
          )}

        {embedCode ? <div className="share-zoho-embed-panel"><textarea readOnly value={embedCode} rows={3} /><button type="button" onClick={() => void onCopyEmbed()}>{copiedEmbed ? label("share.copied") : label("share.copyEmbed")}</button></div> : null}
        {displayLink && !isInvite && currentMode !== "embed" ? <div className="share-zoho-created-link"><span>{displayLink}</span><button type="button" onClick={() => void onCopyLink()}>{copied ? label("share.copied") : "Copy"}</button></div> : null}
        {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
        </>
        )}
      </div>
    </Modal>
  );
}
