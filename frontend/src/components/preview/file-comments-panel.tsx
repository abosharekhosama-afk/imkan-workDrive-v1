"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../locale-provider";
import { listOrganizationMembers } from "../../lib/api/organization";
import {
  addFileComment, deleteFileComment, listFileComments, setFileCommentResolved, updateFileComment, type FileComment,
} from "../../lib/api/comments";
import {
  activeMentionQuery, commentBodyParts, commentPermalink, filterMentionMembers, insertMention, visibleThreads,
  type MentionMember,
} from "../../lib/comment-panel-logic";

type SessionUser = { id: string; role?: string };

function sessionUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem("workdrive_user");
    return raw ? JSON.parse(raw) as SessionUser : null;
  } catch {
    return null;
  }
}

function initials(name?: string | null, email?: string | null) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "?";
}

function relativeTime(value: string, locale: string) {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.round(delta / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (minutes < 1) return rtf.format(0, "minute");
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 7) return rtf.format(-days, "day");
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function FileCommentsPanel({
  fileId, focusCommentId, onCount, onClose,
}: {
  fileId: string;
  focusCommentId?: string | null;
  onCount?: (count: number) => void;
  onClose?: () => void;
}) {
  const { locale, label } = useLocale();
  const ar = locale === "ar";
  const [rows, setRows] = useState<FileComment[]>([]);
  const [members, setMembers] = useState<MentionMember[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [me, setMe] = useState<SessionUser | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState(0);
  const labels = useMemo(() => members.map((member) => member.name || member.email), [members]);
  const visible = visibleThreads(rows, showResolved);
  const mention = activeMentionQuery(draft, caret);
  const suggestions = mention ? filterMentionMembers(members, mention.query) : [];

  async function reload() {
    const next = await listFileComments(fileId);
    setRows(next);
    onCount?.(next.length + next.reduce((sum, row) => sum + (row.replies?.length ?? 0), 0));
    return next;
  }

  useEffect(() => {
    setMe(sessionUser());
    let cancelled = false;
    setError("");
    void reload().catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : label("preview.error")); });
    void listOrganizationMembers({ status: "ACTIVE" }).then((people) => {
      if (!cancelled) setMembers(people.map((person) => ({ userId: person.userId || person.id, name: person.name, email: person.email })));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [fileId]);

  useEffect(() => {
    if (!focusCommentId) return;
    const node = document.getElementById(`file-comment-${focusCommentId}`);
    node?.scrollIntoView({ block: "center" });
  }, [focusCommentId, rows, showResolved]);

  async function post(body: string, parentId?: string) {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true); setError("");
    try {
      await addFileComment(fileId, text, parentId);
      setDraft(""); setReplyDraft(""); setReplyTo(null);
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : label("preview.error")); }
    finally { setBusy(false); }
  }

  function isMine(comment: FileComment) {
    return Boolean(me && comment.userId === me.id);
  }
  function canDelete(comment: FileComment) {
    return Boolean(me && (comment.userId === me.id || me.role === "ADMIN" || me.role === "SUPER_ADMIN"));
  }

  function Body({ text }: { text: string }) {
    return <p className="whitespace-pre-wrap text-[13px] leading-5 text-[#202124]">{commentBodyParts(text, labels).map((part, index) => part.kind === "mention" ? <span key={index} className="font-semibold text-[#2c66dd]">{part.text}</span> : <span key={index}>{part.text}</span>)}</p>;
  }

  function CommentCard({ comment, nested = false }: { comment: FileComment; nested?: boolean }) {
    const open = menu === comment.id;
    return (
      <article id={`file-comment-${comment.id}`} className={`group relative rounded-xl px-2 py-2 ${focusCommentId === comment.id ? "bg-[#f3f7ff]" : ""} ${nested ? "ms-8" : ""}`}>
        <div className="flex gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eef3ff] text-[11px] font-semibold text-[#2c66dd]">{initials(comment.user?.name, comment.user?.email)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[12px]">
              <strong className="truncate">{comment.user?.name || comment.user?.email || "—"}</strong>
              <time className="text-[#80868b]" dateTime={comment.createdAt}>{relativeTime(comment.createdAt, locale)}</time>
              {comment.editedAt ? <span className="text-[#80868b]">{label("preview.commentEdited")}</span> : null}
            </div>
            {editing === comment.id ? (
              <div className="mt-2">
                <textarea value={editDraft} onChange={(event) => setEditDraft(event.target.value)} rows={3} className="w-full rounded-lg border border-[#dadce0] px-2 py-1.5 text-[13px]" />
                <div className="mt-1 flex justify-end gap-2">
                  <button type="button" className="text-[12px] text-[#5f6368]" onClick={() => setEditing(null)}>{label("preview.commentCancel")}</button>
                  <button type="button" className="rounded-full bg-[#2c66dd] px-3 py-1 text-[12px] font-semibold text-white" onClick={() => void updateFileComment(fileId, comment.id, editDraft).then(reload).then(() => setEditing(null)).catch((e) => setError(e instanceof Error ? e.message : label("preview.error")))}>{label("preview.commentSave")}</button>
                </div>
              </div>
            ) : <div className="mt-1"><Body text={comment.body} /></div>}
            {!nested ? (
              <div className="mt-1 flex gap-3 text-[12px] text-[#2c66dd]">
                <button type="button" onClick={() => { setReplyTo(comment.id); setReplyDraft(""); }}>{label("preview.commentReply")}</button>
                {comment.resolvedAt
                  ? <button type="button" onClick={() => void setFileCommentResolved(fileId, comment.id, false).then(reload).then(() => setShowResolved(false))}>{label("preview.commentReopen")}</button>
                  : <button type="button" onClick={() => void setFileCommentResolved(fileId, comment.id, true).then(reload)}>{label("preview.commentResolve")}</button>}
              </div>
            ) : null}
          </div>
          <div className="relative" onClick={(event) => event.stopPropagation()}>
            <button type="button" aria-label={label("files.actions")} className="rounded-full px-2 py-1 text-[#5f6368] opacity-0 group-hover:opacity-100" onClick={() => setMenu(open ? null : comment.id)}>⋯</button>
            {open ? (
              <div className="absolute end-0 z-10 w-40 rounded-xl border border-[#e3e5e8] bg-white p-1 text-start shadow-lg">
                {isMine(comment) ? <button type="button" className="block w-full rounded-lg px-3 py-2 text-[12px] hover:bg-[#f7faff]" onClick={() => { setEditing(comment.id); setEditDraft(comment.body); setMenu(null); }}>{label("preview.commentEdit")}</button> : null}
                <button type="button" className="block w-full rounded-lg px-3 py-2 text-[12px] hover:bg-[#f7faff]" onClick={() => { void navigator.clipboard.writeText(commentPermalink(window.location.origin, fileId, comment.id)); setMenu(null); }}>{label("preview.commentCopyLink")}</button>
                {canDelete(comment) ? <button type="button" className="block w-full rounded-lg px-3 py-2 text-start text-[12px] text-red-600 hover:bg-red-50" onClick={() => { setMenu(null); void deleteFileComment(fileId, comment.id).then(reload); }}>{label("preview.commentDelete")}</button> : null}
              </div>
            ) : null}
          </div>
        </div>
        {!nested ? comment.replies?.map((reply) => <div key={reply.id} className="mt-1"><CommentCard comment={reply} nested /></div>) : null}
        {replyTo === comment.id ? (
          <div className="ms-10 mt-2">
            <textarea value={replyDraft} onChange={(event) => setReplyDraft(event.target.value)} rows={2} placeholder={label("preview.commentPlaceholder")} className="w-full rounded-lg border border-[#dadce0] px-2 py-1.5 text-[13px]" />
            <div className="mt-1 flex justify-end gap-2">
              <button type="button" className="text-[12px] text-[#5f6368]" onClick={() => setReplyTo(null)}>{label("preview.commentCancel")}</button>
              <button type="button" disabled={busy || !replyDraft.trim()} className="rounded-full bg-[#2c66dd] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40" onClick={() => void post(replyDraft, comment.id)}>{label("preview.commentPost")}</button>
            </div>
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <aside className="zoho-comments-panel" dir={ar ? "rtl" : "ltr"} onClick={() => setMenu(null)}>
      <header className="flex items-center justify-between border-b border-[#ededed] px-4 py-3">
        <h2 className="text-[15px] font-semibold text-[#202124]">{label("preview.comments")}</h2>
        <div className="flex items-center gap-2">
          <select aria-label={label("preview.comments")} className="rounded-lg border border-[#dadce0] bg-white px-2 py-1 text-[12px]" value={showResolved ? "resolved" : "open"} onChange={(event) => setShowResolved(event.target.value === "resolved")}>
            <option value="open">{label("preview.commentsAll")}</option>
            <option value="resolved">{label("preview.commentsResolved")}</option>
          </select>
          {onClose ? <button type="button" className="text-lg text-[#5f6368]" onClick={onClose} aria-label={label("preview.close")}>×</button> : null}
        </div>
      </header>
      {error ? <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div> : null}
      <div className="min-h-0 flex-1 overflow-auto px-2 py-3">
        {visible.length === 0 ? <p className="px-3 py-8 text-center text-[13px] text-[#80868b]">{label("preview.commentEmpty")}</p> : visible.map((comment) => <CommentCard key={comment.id} comment={comment} />)}
      </div>
      <form className="border-t border-[#ededed] p-3" onSubmit={(event) => { event.preventDefault(); void post(draft); }}>
        <div className="relative">
          {suggestions.length > 0 && mention ? (
            <ul className="absolute bottom-full z-10 mb-1 max-h-48 w-full overflow-auto rounded-xl border border-[#e3e5e8] bg-white p-1 shadow-lg">
              {suggestions.map((member) => (
                <li key={member.userId}><button type="button" className="block w-full rounded-lg px-3 py-2 text-start text-[12px] hover:bg-[#f7faff]" onMouseDown={(event) => {
                  event.preventDefault();
                  const next = insertMention(draft, mention.start, caret, member.name || member.email);
                  setDraft(next.text);
                  setCaret(next.caret);
                }}><strong>{member.name || member.email}</strong><span className="ms-2 text-[#80868b]">{member.email}</span></button></li>
              ))}
            </ul>
          ) : null}
          <textarea ref={box} value={draft} onChange={(event) => { setDraft(event.target.value); setCaret(event.target.selectionStart); }} onClick={(event) => setCaret(event.currentTarget.selectionStart)} rows={3} maxLength={5000} placeholder={label("preview.commentPlaceholder")} className="w-full resize-none rounded-xl border border-[#dadce0] px-3 py-2 text-[13px] outline-none focus:border-[#2c66dd]" />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-[#80868b]">{label("preview.commentMention")}</span>
          <button type="submit" disabled={busy || !draft.trim()} className="rounded-full bg-[#2c66dd] px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">{label("preview.commentPost")}</button>
        </div>
      </form>
    </aside>
  );
}
