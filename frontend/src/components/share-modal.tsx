"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale } from "./locale-provider";
import { Modal } from "./modal";
import { Toast } from "./toast";
import { buildCreateShareBody, createShare } from "../lib/api/shares";
import { listOrganizationMembers, type OrgMember } from "../lib/api/organization";

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
  const [password, setPassword] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [canDownload, setCanDownload] = useState(true);
  const [recipientUserIds, setRecipientUserIds] = useState("");
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  useEffect(() => { void listOrganizationMembers().then(setMembers).catch(() => setMembers([])); }, []);
  const [permission, setPermission] = useState<"VIEW" | "COMMENT" | "EDIT">("VIEW");
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const result = await createShare(
        buildCreateShareBody({
          resourceType,
          resourceId,
          password: password || undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
          canDownload,
          recipientUserIds: recipientUserIds.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean),
          permission,
        }),
      );
      setLinkUrl(result.link_url);
    } catch {
      setError(label("error.generic"));
    }
  }

  async function copyLink() {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
      setToast(label("share.linkCopied"));
    } catch {
      setToast(label("share.copyFailed"));
    }
  }

  return (
    <Modal title={label("share.title")} onClose={onClose}>
      <form onSubmit={onSubmit} className="text-[length:var(--imkan-font-size-ui)]">
        <label className="mb-2 flex flex-col gap-1">
          {label("share.password")}
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="imkan-input"
          />
        </label>
        <label className="mb-2 flex flex-col gap-1">
          {label("share.expires")}
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            className="imkan-input"
          />
        </label>
        <label className="mb-2 flex flex-col gap-1">
          Search organization members
          <input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} className="imkan-input" placeholder="Name or email" />
        </label>
        <div className="imkan-share-recipient-list">
          {members.filter(m => `${m.name ?? ""} ${m.email}`.toLowerCase().includes(memberQuery.toLowerCase())).slice(0,8).map(m => {
            const selected = recipientUserIds.split(/[,\s]+/).filter(Boolean).includes(m.id);
            return <button type="button" key={m.id} className={`imkan-share-recipient ${selected ? "selected" : ""}`} onClick={() => {
              const ids = recipientUserIds.split(/[,\s]+/).filter(Boolean);
              const next = selected ? ids.filter(id => id !== m.id) : [...ids, m.id];
              setRecipientUserIds(next.join(","));
            }}><span className="imkan-share-avatar">{(m.name || m.email).slice(0,1).toUpperCase()}</span><span><b>{m.name || m.email}</b><small>{m.email}</small></span><span>{selected ? "✓" : "＋"}</span></button>;
          })}
        </div>
        <p className="imkan-meta">Selected recipients are submitted by immutable user ID; email/name are only search fields.</p>
        <label className="mb-3 flex flex-col gap-1">
          Permission
          <select value={permission} onChange={(event) => setPermission(event.target.value as "VIEW" | "COMMENT" | "EDIT")} className="imkan-select"><option value="VIEW">View</option><option value="COMMENT">Comment</option><option value="EDIT">Edit</option></select>
        </label>
        <label className="mb-3 flex items-center gap-2">
          <input
            type="checkbox"
            checked={canDownload}
            onChange={(event) => setCanDownload(event.target.checked)}
          />
          {label("share.allowDownload")}
        </label>
        {linkUrl ? (
          <div className="mb-3 flex-wrap items-center gap-2">
            <p className="break-all text-[length:var(--imkan-font-size-secondary)]">{label("share.created")}: {linkUrl}</p>
            <button type="button" className="imkan-button-secondary" onClick={() => void copyLink()}>{label("share.copyLink")}</button>
          </div>
        ) : null}
        {error ? (
          <p className="mb-3 text-[length:var(--imkan-font-size-secondary)]">{error}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="imkan-button-secondary" onClick={onClose}>{label("share.cancel")}</button>
          <button type="submit" className="imkan-button">{label("share.submit")}</button>
        </div>
      </form>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </Modal>
  );
}
