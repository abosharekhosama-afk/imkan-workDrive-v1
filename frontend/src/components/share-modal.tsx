"use client";

import { useEffect, useMemo, useState } from "react";
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
import { ImkanOptionPicker } from "./imkan-option-picker";

type SharePermission = "VIEW" | "COMMENT" | "EDIT" | "ORGANIZE" | "FULL_ACCESS";
type ExpiryKind = "never" | "1d" | "7d" | "30d" | "custom";

const EXPIRY_DAYS: Record<Exclude<ExpiryKind, "never" | "custom">, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
};

const FILE_PERMISSIONS: SharePermission[] = ["VIEW", "COMMENT", "EDIT", "FULL_ACCESS"];
const FOLDER_PERMISSIONS: SharePermission[] = ["VIEW", "COMMENT", "EDIT", "ORGANIZE", "FULL_ACCESS"];

function permissionOptionLabel(option: SharePermission): string {
  return `share.permission.${option}`;
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
  const launch = useMemo(() => resolveShareLaunch(launchMode), [launchMode]);
  const permissionOptions = resourceType === "FOLDER" ? FOLDER_PERMISSIONS : FILE_PERMISSIONS;
  const { label, locale } = useLocale();
  const [activeTab, setActiveTab] = useState<"link" | "invite">(launch.tab);
  const [password, setPassword] = useState("");
  const [expiryKind, setExpiryKind] = useState<ExpiryKind>("never");
  const [customExpiryDate, setCustomExpiryDate] = useState("");
  const [canDownload, setCanDownload] = useState(launch.canDownloadDefault);
  const [recipientUserIds, setRecipientUserIds] = useState<string[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [emailRecipients, setEmailRecipients] = useState("");
  const [permission, setPermission] = useState<SharePermission>("VIEW");
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [existingShares, setExistingShares] = useState<SharedItem[]>([]);
  const [loadingShares, setLoadingShares] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyShareId, setBusyShareId] = useState<string | null>(null);

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
          setExpiryKind("custom");
          setCustomExpiryDate(current.expiresAt.slice(0, 10));
        }
      }
    } catch {
      setExistingShares([]);
    } finally {
      setLoadingShares(false);
    }
  };

  useEffect(() => {
    setActiveTab(launch.tab);
    setCanDownload(launch.canDownloadDefault);
    setLinkUrl(null);
    setError(null);
    void refreshShares();
  }, [resourceId, launchMode]);

  useEffect(() => {
    void listOrganizationMembers({ status: "ACTIVE" })
      .then(setMembers)
      .catch(() => setMembers([]));
  }, []);

  const filteredMembers = members.filter((m) =>
    `${m.name ?? ""} ${m.email}`.toLowerCase().includes(memberQuery.toLowerCase()),
  );

  const primaryShare = existingShares[0] ?? null;
  const displayLink = linkUrl ?? (primaryShare?.linkUrl ? normalizePublicAppUrl(primaryShare.linkUrl) : null);
  const embedCode = displayLink && launch.showEmbedPanel ? buildShareEmbedCode(displayLink) : null;

  function toggleRecipient(userId: string) {
    setRecipientUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  function expiresAtValue(): string | undefined {
    if (expiryKind === "custom") {
      if (!customExpiryDate) return undefined;
      const date = new Date(`${customExpiryDate}T23:59:59`);
      return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    }
    if (expiryKind === "never") return undefined;
    return new Date(Date.now() + EXPIRY_DAYS[expiryKind] * 86_400_000).toISOString();
  }

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

  async function runSubmit(recipients: string[]): Promise<string | null> {
    setError(null);
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
          emailRecipients: emailRecipients.split(/[;,\s]+/).map((v) => v.trim()).filter(Boolean),
        }),
      );
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
    } finally {
      setSubmitting(false);
    }
  }

  async function onCopyLink() {
    const url = displayLink ?? await runSubmit([]);
    if (!url) return;
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      setToast(label("share.linkCopied"));
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  async function onCopyEmbed() {
    if (!embedCode) return;
    const ok = await copyToClipboard(embedCode);
    if (ok) {
      setCopiedEmbed(true);
      setToast(label("share.embedCopied"));
      window.setTimeout(() => setCopiedEmbed(false), 2000);
    }
  }

  async function onRevokeShare(shareId: string) {
    setBusyShareId(shareId);
    setError(null);
    try {
      await revokeShare(shareId);
      if (primaryShare?.id === shareId) setLinkUrl(null);
      await refreshShares();
      onChanged?.();
      setToast(label("share.revoked"));
    } catch (cause) {
      setError(label(friendlyErrorMessageKey(cause)));
    } finally {
      setBusyShareId(null);
    }
  }

  async function onRemoveRecipient(shareId: string, userId: string) {
    setBusyShareId(`${shareId}:${userId}`);
    setError(null);
    try {
      await removeShareRecipient(shareId, userId);
      await refreshShares();
      onChanged?.();
      setToast(label("share.recipientRemoved"));
    } catch (cause) {
      setError(label(friendlyErrorMessageKey(cause)));
    } finally {
      setBusyShareId(null);
    }
  }

  async function onChangeRecipientPermission(shareId: string, userId: string, next: SharePermission) {
    setBusyShareId(`${shareId}:${userId}`);
    setError(null);
    try {
      await updateShareRecipientPermission(shareId, userId, next);
      await refreshShares();
      onChanged?.();
    } catch (cause) {
      setError(label(friendlyErrorMessageKey(cause)));
    } finally {
      setBusyShareId(null);
    }
  }

  const modalTitle = launchMode === "downloadLink"
    ? label("share.titleDownloadLink")
    : launchMode === "embed"
      ? label("share.titleEmbed")
      : label("share.title");

  const permissionField = (
    <div className="wd-field">
      <label>{label("share.permission")}</label>
      <ImkanOptionPicker
        value={permission}
        onChange={setPermission as (value: SharePermission | "") => void}
        ariaLabel={label("share.permission")}
        fullWidth
        options={permissionOptions.map((option) => ({
          value: option,
          label: label(permissionOptionLabel(option) as Parameters<typeof label>[0]),
        }))}
      />
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

  return (
    <Modal title={modalTitle} onClose={onClose} className="w-full max-w-[560px]">
      <div className="flex flex-col gap-3">
        {resourceName ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
            {label("share.resourceLabel").replace("{name}", resourceName)}
          </div>
        ) : null}

        {!loadingShares && primaryShare ? (
          <section className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-[12px] font-semibold text-slate-800">{label("share.peopleWithAccess")}</h3>
              {primaryShare.linkUrl ? (
                <button type="button" className="text-[11px] font-medium text-[color:var(--wd-primary)]" onClick={() => void onCopyLink()}>
                  {copied ? label("share.copied") : label("share.copyLink")}
                </button>
              ) : null}
            </div>
            {primaryShare.recipients?.length ? (
              <ul className="mt-2 space-y-1.5">
                {primaryShare.recipients.map((recipient) => (
                  <li key={recipient.userId} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[12px]">
                    <span className="min-w-0 flex-1 truncate">{recipient.user?.name || recipient.user?.email || recipient.userId}</span>
                    <ImkanOptionPicker
                      value={(permissionOptions.includes(recipient.permission as SharePermission) ? recipient.permission : "VIEW") as SharePermission}
                      onChange={(next) => { if (next) void onChangeRecipientPermission(primaryShare.id, recipient.userId, next); }}
                      ariaLabel={label("share.permission")}
                      options={permissionOptions.map((option) => ({ value: option, label: label(permissionOptionLabel(option) as Parameters<typeof label>[0]) }))}
                    />
                    <button
                      type="button"
                      disabled={busyShareId === `${primaryShare.id}:${recipient.userId}`}
                      className="shrink-0 text-[12px] text-red-600 disabled:opacity-50"
                      onClick={() => void onRemoveRecipient(primaryShare.id, recipient.userId)}
                    >
                      {label("share.removeRecipient")}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[11px] text-slate-500">{label("share.noRecipientsYet")}</p>
            )}
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                disabled={busyShareId === primaryShare.id}
                className="text-[11px] font-medium text-red-600 disabled:opacity-50"
                onClick={() => void onRevokeShare(primaryShare.id)}
              >
                {label("share.revokeLink")}
              </button>
            </div>
          </section>
        ) : null}

        {error ? <p className="text-red-500 text-[length:var(--imkan-font-size-secondary)]">{error}</p> : null}

        <form onSubmit={(event) => { event.preventDefault(); setActiveTab("invite"); void runSubmit(recipientUserIds); }} className="flex flex-col gap-3">
          <section className="rounded-xl border border-slate-200 p-3">
            <h3 className="mb-2 text-[13px] font-semibold text-slate-900">{label("share.addMembers")}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <input type="search" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} className="wd-input min-w-[180px] flex-1" placeholder={label("share.recipients.search")} aria-label={label("share.recipients.search")} />
              <div className="w-[150px]">{permissionField}</div>
              <button type="submit" className="h-9 rounded-full bg-[color:var(--wd-primary)] px-4 text-[13px] font-semibold text-white transition hover:bg-[color:var(--wd-primary-dark)] disabled:opacity-50" disabled={submitting || recipientUserIds.length === 0}>{submitting && activeTab === "invite" ? "…" : label("share.add")}</button>
            </div>
            {memberQuery.trim() && filteredMembers.length === 0 ? <p className="mt-2 text-[12px] text-slate-500">{label("share.recipients.none")}</p> : null}
            {filteredMembers.length > 0 ? (
              <div className="imkan-share-recipient-list mt-2">
                {filteredMembers.slice(0, 6).map((member) => {
                  const memberId = member.userId || member.id;
                  const displayName = member.name?.trim() || member.email.split("@")[0];
                  const selected = recipientUserIds.includes(memberId);
                  return (
                    <button type="button" key={memberId} className={`imkan-share-recipient${selected ? " selected" : ""}`} onClick={() => toggleRecipient(memberId)}>
                      <span className="imkan-share-avatar">{displayName.slice(0, 2).toUpperCase()}</span>
                      <span><b>{displayName}</b><small>{member.email}</small></span>
                      <span>{selected ? "✓" : "＋"}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-200 p-3">
            <h3 className="text-[13px] font-semibold text-slate-900">{label("share.linkAccess")}</h3>
            <p className="mt-1 text-[12px] text-slate-500">{locale === "ar" ? "عرض، تعليق، تعديل، تنظيم للمجلدات، أو مشاركة لإعادة المشاركة." : "View, Comment, Edit, Organize for folders, or Share to reshare."}</p>
            {displayLink ? <code className="mt-2 block break-all rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-700">{displayLink}</code> : null}
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="wd-field">
                <label>{label("share.password")}</label>
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="wd-input" placeholder={label("share.password")} minLength={8} />
              </div>
              <div className="wd-field">
                <label>{label("share.expires")}</label>
                <ImkanOptionPicker
                  value={expiryKind}
                  onChange={setExpiryKind as (value: ExpiryKind | "") => void}
                  ariaLabel={label("share.expires")}
                  fullWidth
                  options={(["never", "1d", "7d", "30d", "custom"] as ExpiryKind[]).map((option) => ({
                    value: option,
                    label: label(`share.expiry.${option}` as Parameters<typeof label>[0]),
                  }))}
                />
              </div>
            </div>
            {expiryKind === "custom" ? (
              <div className="wd-field">
                <label>{label("share.expiry.custom")}</label>
                <input type="date" value={customExpiryDate} onChange={(event) => setCustomExpiryDate(event.target.value)} className="wd-input" min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)} />
              </div>
            ) : null}
            {downloadField}
            {permissionField}
            <div className="wd-field">
              <label>{locale === "ar" ? "إرسال الرابط بالبريد" : "Email the link"}</label>
              <input type="text" value={emailRecipients} onChange={(event) => setEmailRecipients(event.target.value)} className="wd-input" placeholder="email@example.com" />
            </div>
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <button type="button" className="h-9 rounded-full border border-slate-200 px-4 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50" onClick={() => { setActiveTab("link"); void runSubmit([]); }} disabled={submitting}>{submitting && activeTab === "link" ? "…" : label(displayLink ? "share.updateLink" : "share.submit")}</button>
              <button type="button" className="h-9 rounded-full bg-[color:var(--wd-primary)] px-4 text-[13px] font-semibold text-white transition hover:bg-[color:var(--wd-primary-dark)] disabled:opacity-50" disabled={!displayLink && submitting} onClick={() => void onCopyLink()}>{copied ? label("share.copied") : label("share.copyLink")}</button>
            </div>
          </section>
        </form>
        {embedCode ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-[12px] font-semibold text-slate-800">{label("share.embedCode")}</div>
            <textarea readOnly value={embedCode} rows={3} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 font-mono text-[10px]" />
            <button type="button" className="mt-2 h-8 rounded-full border border-slate-200 px-3 text-[12px] font-medium text-slate-700 transition hover:bg-white" onClick={() => void onCopyEmbed()}>
              {copiedEmbed ? label("share.copied") : label("share.copyEmbed")}
            </button>
          </div>
        ) : null}
      </div>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </Modal>
  );
}
