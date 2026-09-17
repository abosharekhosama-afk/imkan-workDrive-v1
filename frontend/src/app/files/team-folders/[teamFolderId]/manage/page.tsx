"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "../../../../../components/locale-provider";
import { ApiError } from "../../../../../lib/api/client";
import {
  addTeamFolderMember,
  deleteTeamFolder,
  getCurrentUserTeamFolderRole,
  getTeamFolder,
  listTeamFolderMembers,
  removeTeamFolderMember,
  renameTeamFolder,
  updateTeamFolderMember,
  type TeamFolderMember,
  type TeamFolderRecord,
  type TeamFolderRole,
} from "../../../../../lib/api/team-folders";
import { listOrganizationMembers, type OrgMember } from "../../../../../lib/api/organization";
import { canManageMembers } from "../../../../../lib/permissions";
import { formatBytes } from "../../../../../lib/api/quota";
import { getCurrentUserId } from "../../../../../lib/api/jwt";

type TabKey = "details" | "members" | "settings" | "trash" | "activity" | "shared" | "templates";

const ROLE_ORDER: TeamFolderRole[] = ["ADMIN", "ORGANIZER", "EDITOR", "VIEWER"];

function Icon({ name }: { name: string }) {
  const common = { width: 19, height: 19, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true } as const;
  if (name === "info") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 10v6M12 7.5h.01" /></svg>;
  if (name === "members") return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M17 11a3 3 0 0 0 0-6M16.5 15a4.8 4.8 0 0 1 4 5" /></svg>;
  if (name === "settings") return <svg {...common}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /><circle cx="12" cy="12" r="3.5" /></svg>;
  if (name === "trash") return <svg {...common}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>;
  if (name === "activity") return <svg {...common}><path d="M3 12h4l2-7 4 14 2-7h6" /></svg>;
  if (name === "share") return <svg {...common}><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>;
  if (name === "template") return <svg {...common}><path d="M4 4h16v16H4z" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
  if (name === "folder") return <svg {...common}><path d="M3 7.5A2 2 0 0 1 5 5.5h4l2 2h8a2 2 0 0 1 2 2v7A2 2 0 0 1 19 18.5H5a2 2 0 0 1-2-2z" /></svg>;
  return null;
}

const tabs: Array<{ key: TabKey; icon: string; en: string; ar: string }> = [
  { key: "details", icon: "info", en: "Team Folder Details", ar: "تفاصيل مجلد الفريق" },
  { key: "members", icon: "members", en: "Members", ar: "الأعضاء" },
  { key: "settings", icon: "settings", en: "Settings", ar: "الإعدادات" },
  { key: "trash", icon: "trash", en: "Trash", ar: "سلة المهملات" },
  { key: "activity", icon: "activity", en: "Activity", ar: "النشاط" },
  { key: "shared", icon: "share", en: "Shared Items", ar: "العناصر المشتركة" },
  { key: "templates", icon: "template", en: "Data Templates", ar: "قوالب البيانات" },
];

function isTab(value: string | null): value is TabKey {
  return !!value && tabs.some((tab) => tab.key === value);
}

function displayMemberName(member: TeamFolderMember, profiles: OrgMember[]) {
  const profile = profiles.find((item) => item.userId === member.userId || item.id === member.userId);
  return profile?.name || member.email.split("@")[0] || member.userId;
}

export default function TeamFolderManagePage() {
  const params = useParams<{ teamFolderId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const id = params.teamFolderId;
  const initialTab = isTab(searchParams.get("tab")) ? searchParams.get("tab") as TabKey : "details";

  const [tab, setTab] = useState<TabKey>(initialTab);
  const [folder, setFolder] = useState<TeamFolderRecord | null>(null);
  const [members, setMembers] = useState<TeamFolderMember[]>([]);
  const [profiles, setProfiles] = useState<OrgMember[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [inviteSearch, setInviteSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<OrgMember | null>(null);
  const [inviteRole, setInviteRole] = useState<TeamFolderRole>("EDITOR");
  const [manageOpen, setManageOpen] = useState(false);

  const canManage = role === "ORG_ADMIN" || canManageMembers(role);
  const canRename = role === "ORG_ADMIN" || role === "ADMIN";

  const load = useCallback(async () => {
    try {
      setError("");
      const [details, memberRes, currentRole] = await Promise.all([
        getTeamFolder(id),
        listTeamFolderMembers(id),
        getCurrentUserTeamFolderRole(id),
      ]);
      setFolder(details);
      setName(details.name);
      setMembers(memberRes.members);
      setRole(details.role === "ORG_ADMIN" ? "ORG_ADMIN" : currentRole);
      if (canManageMembers(details.role)) {
        try {
          setProfiles(await listOrganizationMembers({ status: "ACTIVE" }));
        } catch {
          setProfiles([]);
        }
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : (locale === "ar" ? "تعذر تحميل مجلد الفريق." : "Unable to load the Team Folder."));
    }
  }, [id, locale]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const visibleMembers = useMemo(() => {
    const q = memberSearch.trim().toLocaleLowerCase();
    return members.filter((member) => {
      const nameValue = displayMemberName(member, profiles).toLocaleLowerCase();
      return !q || nameValue.includes(q) || member.email.toLocaleLowerCase().includes(q);
    });
  }, [members, memberSearch, profiles]);

  const availableProfiles = useMemo(() => {
    const assigned = new Set(members.map((member) => member.userId));
    const q = inviteSearch.trim().toLocaleLowerCase();
    return profiles.filter((profile) => {
      const profileId = profile.userId || profile.id;
      if (!profileId || assigned.has(profileId)) return false;
      return !q || (profile.name || "").toLocaleLowerCase().includes(q) || profile.email.toLocaleLowerCase().includes(q);
    });
  }, [profiles, members, inviteSearch]);

  const selectTab = (next: TabKey) => {
    setTab(next);
    router.replace(`/files/team-folders/${encodeURIComponent(id)}/manage?tab=${next}`, { scroll: false });
  };

  const saveName = async () => {
    const clean = name.trim();
    if (!clean || !canRename || busy) return;
    setBusy(true);
    setError("");
    try {
      await renameTeamFolder(id, clean);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : (locale === "ar" ? "تعذر حفظ الاسم." : "Unable to save the name."));
    } finally {
      setBusy(false);
    }
  };

  const addMember = async () => {
    if (!selectedUser || !canManage || busy) return;
    const userId = selectedUser.userId || selectedUser.id;
    if (!userId) return;
    setBusy(true);
    setError("");
    try {
      await addTeamFolderMember(id, userId, inviteRole);
      setSelectedUser(null);
      setInviteSearch("");
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : (locale === "ar" ? "تعذر إضافة العضو." : "Unable to add the member."));
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (userId: string, next: TeamFolderRole) => {
    if (!canManage || busy) return;
    setBusy(true);
    setError("");
    try {
      await updateTeamFolderMember(id, userId, next);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : (locale === "ar" ? "تعذر تحديث الدور." : "Unable to update the role."));
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (userId: string) => {
    if (!canManage || busy) return;
    const ok = window.confirm(locale === "ar" ? "هل تريد إزالة هذا العضو من مجلد الفريق؟" : "Remove this member from the Team Folder?");
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await removeTeamFolderMember(id, userId);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : (locale === "ar" ? "تعذر إزالة العضو." : "Unable to remove the member."));
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!role || role === "ORG_ADMIN") {
      setError(locale === "ar" ? "مسؤول المؤسسة لا يمكنه مغادرة مجلد الفريق من هذا الإجراء." : "An organization administrator cannot leave from this action.");
      return;
    }
    const me = members.find((member) => member.userId);
    if (!me) return;
    setBusy(true);
    try {
      await removeTeamFolderMember(id, me.userId);
      router.push("/files/team-folders");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : (locale === "ar" ? "تعذر مغادرة مجلد الفريق." : "Unable to leave the Team Folder."));
    } finally {
      setBusy(false);
    }
  };

  const deleteFolder = async () => {
    if (!canRename || busy) return;
    const ok = window.confirm(locale === "ar" ? `هل تريد حذف «${folder?.name ?? ""}»؟` : `Delete “${folder?.name ?? ""}”?`);
    if (!ok) return;
    setBusy(true);
    try {
      await deleteTeamFolder(id);
      window.dispatchEvent(new Event("workdrive:team-folders-changed"));
      router.push("/files/team-folders");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : (locale === "ar" ? "تعذر حذف مجلد الفريق." : "Unable to delete the Team Folder."));
    } finally {
      setBusy(false);
    }
  };

  if (!folder && !error) {
    return <section className="flex min-h-full items-center justify-center bg-white text-sm text-slate-500">Loading…</section>;
  }

  const rootHref = folder?.rootFolderId ? `/files/${encodeURIComponent(folder.rootFolderId)}` : "/files/team-folders";

  return (
    <section className="flex min-h-full min-w-0 flex-col bg-white">
      <header className="flex h-[68px] shrink-0 items-center border-b border-slate-100 px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center text-slate-700"><Icon name="folder" /></span>
          <h1 className="truncate text-[21px] font-semibold tracking-[-0.025em] text-slate-900">{folder?.name}</h1>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-medium text-slate-700">{role === "ORG_ADMIN" ? "Admin" : role || "Member"}</span>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[12px] font-medium text-slate-700">{members.length}</span>
          <div className="ms-2 h-5 w-px bg-slate-200" />
          <div className="relative ms-2">
            <button type="button" onClick={() => setManageOpen((open) => !open)} className="wd-pill-manage inline-flex items-center gap-1.5" aria-expanded={manageOpen} aria-haspopup="menu">
              <Icon name="settings" /> {locale === "ar" ? "إدارة" : "Manage"} <span aria-hidden="true">⌄</span>
            </button>
            {manageOpen ? (
              <div role="menu" className="absolute start-0 top-9 z-[120] w-[235px] rounded-[16px] border border-slate-200 bg-white p-1.5 shadow-[0_8px_28px_rgba(0,0,0,.12)]">
                {tabs.map((item) => (
                  <button key={item.key} type="button" role="menuitem" onClick={() => { setManageOpen(false); selectTab(item.key); }} className={`flex min-h-[38px] w-full items-center gap-3 rounded-[10px] px-3 text-start text-[13px] ${tab === item.key ? "bg-[#EEF4FF] text-[#285CB4]" : "text-slate-700 hover:bg-slate-50"}`}>
                    <span className={tab === item.key ? "text-[#285CB4]" : "text-slate-500"}><Icon name={item.icon} /></span><span>{locale === "ar" ? item.ar : item.en}</span>
                  </button>
                ))}
                <div className="my-1 border-t border-slate-100" />
                {folder?.rootFolderId ? <button type="button" role="menuitem" onClick={() => { setManageOpen(false); router.push(rootHref); }} className="flex min-h-[38px] w-full items-center gap-3 rounded-[10px] px-3 text-start text-[13px] text-slate-700 hover:bg-slate-50"><Icon name="folder" /><span>{locale === "ar" ? `البحث في ${folder.name}` : `Search in ${folder.name}`}</span></button> : null}
                <button type="button" role="menuitem" onClick={() => { setManageOpen(false); void deleteFolder(); }} disabled={!canRename || busy} className="flex min-h-[38px] w-full items-center gap-3 rounded-[10px] px-3 text-start text-[13px] text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Icon name="trash" /><span>{locale === "ar" ? "حذف مجلد الفريق" : "Delete Team Folder"}</span></button>
                <button type="button" role="menuitem" onClick={() => { setManageOpen(false); void leave(); }} disabled={role === "ORG_ADMIN" || !role || busy} className="flex min-h-[38px] w-full items-center gap-3 rounded-[10px] px-3 text-start text-[13px] text-red-600 hover:bg-red-50 disabled:opacity-40"><span>↪</span><span>{locale === "ar" ? "مغادرة مجلد الفريق" : "Leave Team Folder"}</span></button>
              </div>
            ) : null}
          </div>
          <Link href={rootHref} className="ms-1 text-[13px] font-medium text-[color:var(--wd-primary)] hover:underline">
            {locale === "ar" ? "فتح الملفات" : "Open files"}
          </Link>
        </div>
        <Link href="/files/team-folders" className="ms-auto text-[15px] text-slate-500 hover:text-slate-800" aria-label={locale === "ar" ? "إغلاق" : "Close"}>×</Link>
      </header>

      <nav className="grid shrink-0 grid-cols-7 border-b border-slate-200">
        {tabs.map((item) => (
          <button key={item.key} type="button" onClick={() => selectTab(item.key)} className={`flex min-h-[88px] flex-col items-center justify-center gap-2 border-e border-slate-200 px-2 text-center text-[13px] transition ${tab === item.key ? "border-t-2 border-t-[color:var(--wd-primary)] bg-white text-[color:var(--wd-primary)]" : "border-t-2 border-t-transparent text-slate-600 hover:bg-slate-50"}`}>
            <Icon name={item.icon} />
            <span>{locale === "ar" ? item.ar : item.en}</span>
          </button>
        ))}
      </nav>

      {error ? <div className="mx-auto mt-4 w-full max-w-[930px] rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-700" role="alert">{error}</div> : null}

      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[930px] px-8 pb-14 pt-8">
          {tab === "details" ? (
            <div className="grid grid-cols-[1fr_1fr] gap-12 max-[760px]:grid-cols-1">
              <section className="border-e border-slate-100 pe-10 max-[760px]:border-e-0 max-[760px]:pe-0">
                <h2 className="mb-7 text-[14px] font-semibold text-slate-800">{locale === "ar" ? "الاسم" : "Name"}</h2>
                <div className="flex items-center gap-2">
                  <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canRename || busy} className="h-9 min-w-0 flex-1 border-b border-slate-200 bg-transparent px-0 text-[14px] outline-none focus:border-[color:var(--wd-primary)] disabled:text-slate-700" />
                  {canRename ? <button type="button" onClick={() => void saveName()} disabled={busy || !name.trim()} className="text-[12px] font-medium text-[color:var(--wd-primary)]">{busy ? "…" : locale === "ar" ? "حفظ" : "Save"}</button> : null}
                </div>
                <h2 className="mb-3 mt-9 text-[14px] font-semibold text-slate-800">{locale === "ar" ? "الوصف" : "Description"}</h2>
                <p className="text-[13px] leading-6 text-slate-600">{locale === "ar" ? "مساحة مشتركة للتعاون على ملفات ومجلدات الفريق." : "A shared space for collaborating on team files and folders."}</p>
                <dl className="mt-9 grid grid-cols-[145px_1fr] gap-y-5 text-[13px]">
                  <dt className="text-slate-500">{locale === "ar" ? "النوع" : "Type"}</dt><dd>{locale === "ar" ? "مجلد فريق خاص" : "Private Team Folder"}</dd>
                  <dt className="text-slate-500">{locale === "ar" ? "الدور" : "Role"}</dt><dd>{role === "ORG_ADMIN" ? "Admin" : role || "Member"}</dd>
                  <dt className="text-slate-500">{locale === "ar" ? "يحتوي على" : "Contains"}</dt><dd>{formatBytes(0) === "0 B" ? "—" : formatBytes(0)}</dd>
                </dl>
              </section>
              <section>
                <h2 className="mb-6 text-[14px] font-semibold text-slate-800">{members.length} {locale === "ar" ? "عضو" : "Member"}{members.length === 1 ? "" : "s"}</h2>
                <div className="space-y-3">
                  {members.slice(0, 6).map((member) => <div key={member.userId} className="flex items-center gap-3 border-b border-slate-100 pb-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-[12px] font-semibold text-slate-600">{displayMemberName(member, profiles).slice(0, 2).toUpperCase()}</span><span className="min-w-0"><strong className="block truncate text-[13px]">{displayMemberName(member, profiles)}</strong><small className="block truncate text-[12px] text-slate-500">{member.email}</small></span></div>)}
                </div>
                <button type="button" onClick={() => selectTab("members")} className="mt-5 text-[13px] font-medium text-[color:var(--wd-primary)]">{locale === "ar" ? "+ إضافة أعضاء" : "+ Add Members"}</button>
              </section>
            </div>
          ) : null}

          {tab === "members" ? (
            <section>
              {canManage ? (
                <div className="mb-7 grid grid-cols-[1fr_130px_80px] overflow-visible rounded-lg border border-slate-200">
                  <div className="relative">
                    <input value={inviteSearch} onChange={(e) => setInviteSearch(e.target.value)} placeholder={locale === "ar" ? "أضف أعضاء باستخدام البريد الإلكتروني أو من المجموعة" : "Add members by their email address or from a group"} className="h-12 w-full border-0 px-4 text-[13px] outline-none" />
                    {inviteSearch && availableProfiles.length > 0 ? <div className="absolute start-0 top-12 z-20 w-full border border-slate-200 bg-white p-1 shadow-lg">{availableProfiles.slice(0, 8).map((profile) => <button key={profile.userId || profile.id} type="button" onClick={() => { setSelectedUser(profile); setInviteSearch(profile.email); }} className="flex w-full items-center gap-2 px-3 py-2 text-start text-[13px] hover:bg-slate-50"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold">{(profile.name || profile.email).slice(0,2).toUpperCase()}</span><span className="min-w-0 truncate">{profile.name || profile.email}</span></button>)}</div> : null}
                  </div>
                  <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as TeamFolderRole)} className="border-y-0 border-slate-200 px-3 text-[12px] outline-none"><option value="EDITOR">Editor</option><option value="VIEWER">Viewer</option><option value="ORGANIZER">Organizer</option><option value="ADMIN">Admin</option></select>
                  <button type="button" onClick={() => void addMember()} disabled={!selectedUser || busy} className="bg-[color:var(--wd-primary)] text-[13px] font-semibold text-white disabled:opacity-50">{locale === "ar" ? "إضافة" : "Add"}</button>
                </div>
              ) : null}
              <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2"><strong className="text-[13px]">{members.length} {locale === "ar" ? "عضو" : "Member"}{members.length === 1 ? "" : "s"}</strong><input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder={locale === "ar" ? "بحث" : "Search"} className="h-9 w-[285px] rounded-full border border-slate-200 px-3 text-[13px] outline-none focus:border-[color:var(--wd-primary)]" /></div>
              <div className="divide-y divide-slate-100 border-y border-slate-100">
                {visibleMembers.map((member) => <div key={member.userId} className="flex min-h-[66px] items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{displayMemberName(member, profiles).slice(0,2).toUpperCase()}</span><div className="min-w-0 flex-1"><strong className="block text-[13px]">{displayMemberName(member, profiles)}</strong><span className="text-[12px] text-slate-500">{member.email}</span></div>{canManage ? <select value={member.role} onChange={(e) => void changeRole(member.userId, e.target.value as TeamFolderRole)} disabled={busy} className="h-8 rounded-full border border-slate-200 px-3 text-[12px]"><option value={member.role}>{member.role}</option>{ROLE_ORDER.filter((r) => r !== member.role).map((r) => <option key={r} value={r}>{r}</option>)}</select> : <span className="text-[12px] text-slate-500">{member.role}</span>}{canManage ? <button type="button" onClick={() => void removeMember(member.userId)} className="h-8 w-8 rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600" title={locale === "ar" ? "إزالة" : "Remove"}>×</button> : null}</div>)}
              </div>
            </section>
          ) : null}

          {tab === "settings" ? (
            <section className="rounded-[16px] border border-slate-200 bg-white p-6">
              <h2 className="text-[17px] font-medium text-slate-900">{locale === "ar" ? "نوع مجلد الفريق" : "Team Folder type"}</h2>
              <div className="mt-4 flex gap-8 text-[13px]"><label className="flex items-center gap-2"><input type="radio" checked={false} readOnly /> Public</label><label className="flex items-center gap-2"><input type="radio" checked readOnly /> Private</label></div>
              <p className="mt-3 text-[13px] leading-6 text-slate-500">{locale === "ar" ? "تتبع إعدادات النوع الحالية لعقد Team Folder الموجود." : "The current Team Folder API stores the existing folder type; no unsupported setting is written from this screen."}</p>
              <div className="mt-7 divide-y divide-slate-100 border-y border-slate-100">
                {[["Allow file uploads via email", "Enable this option to let members and external users upload by email."], ["Allow Team Folder members to share outside your team", "External sharing controls are not exposed by the current Team Folder API."], ["Show download and print options", "Download and print availability follows the existing file permissions."]].map(([title, desc]) => <div key={title} className="flex min-h-[112px] items-center justify-between gap-6 py-5"><div><h3 className="text-[15px] font-medium text-slate-800">{locale === "ar" ? title : title}</h3><p className="mt-2 max-w-[700px] text-[13px] leading-6 text-slate-500">{desc}</p></div><span className="h-6 w-11 rounded-full bg-slate-200 opacity-60" aria-label="Unavailable setting" /></div>)}
              </div>
            </section>
          ) : null}

          {tab === "trash" || tab === "activity" || tab === "shared" || tab === "templates" ? (
            <section className="rounded-[16px] border border-slate-200 bg-white p-8">
              <div className="flex items-center gap-3"><Icon name={tabs.find((item) => item.key === tab)?.icon || "info"} /><h2 className="text-[18px] font-medium text-slate-900">{tabs.find((item) => item.key === tab)?.[locale === "ar" ? "ar" : "en"]}</h2></div>
              <p className="mt-3 max-w-[680px] text-[13px] leading-6 text-slate-500">{locale === "ar" ? "تم إبقاء هذه العملية ضمن الواجهات الحالية للمشروع حتى لا يتم اختراع API غير موجود." : "This operation is kept on the existing project surface so the Team Folder UI does not invent an unsupported API."}</p>
              <Link href={tab === "trash" ? "/files/trash" : tab === "activity" ? "/files/activity" : tab === "shared" ? "/files/shared-by-me" : "/files/templates"} className="mt-6 inline-flex h-9 items-center rounded-full bg-[color:var(--wd-primary)] px-4 text-[13px] font-semibold text-white">{locale === "ar" ? "فتح" : "Open"}</Link>
            </section>
          ) : null}

          {canManage ? <div className="mt-10 border-t border-slate-100 pt-6"><button type="button" onClick={() => void deleteFolder()} disabled={busy} className="text-[13px] font-medium text-red-600 hover:underline">{locale === "ar" ? "حذف مجلد الفريق" : "Delete Team Folder"}</button></div> : null}
          {!canManage && role ? <div className="mt-10 border-t border-slate-100 pt-6"><button type="button" onClick={() => void leave()} disabled={busy} className="text-[13px] font-medium text-red-600 hover:underline">{locale === "ar" ? "مغادرة مجلد الفريق" : "Leave Team Folder"}</button></div> : null}
        </div>
      </main>
    </section>
  );
}
