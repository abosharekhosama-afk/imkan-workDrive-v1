"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "../../../../../components/locale-provider";
import { useConfirmAction } from "../../../../../components/confirm-action-modal";
import { ImkanOptionPicker, toImkanPickerOptions } from "../../../../../components/imkan-option-picker";
import { ApiError } from "../../../../../lib/api/client";
import {
  addTeamFolderMember,
  addTeamFolderGroup,
  updateTeamFolderGroup,
  removeTeamFolderGroup,
  deleteTeamFolder,
  getCurrentUserTeamFolderRole,
  getTeamFolder,
  listTeamFolderMembers,
  removeTeamFolderMember,
  renameTeamFolder,
  updateTeamFolderSettings,
  updateTeamFolderMember,
  type TeamFolderMember,
  type TeamFolderGroup,
  type TeamFolderRecord,
  type TeamFolderRole,
  listTeamFolderActivity,
  listTeamFolderShared,
  listTeamFolderTrash,
  type TeamFolderActivity,
  type TeamFolderSharedItem,
  type TeamFolderTrashItem,
} from "../../../../../lib/api/team-folders";
import { listOrganizationMembers, listGroups, type OrgMember, type GroupOption } from "../../../../../lib/api/organization";
import { canManageMembers } from "../../../../../lib/permissions";
import { formatBytes } from "../../../../../lib/api/quota";
import { permanentDeleteFile } from "../../../../../lib/api/files";
import { restoreFile } from "../../../../../lib/api/trash";
import { formatDateLocalized } from "../../../../../lib/localized";
import { getTeamFolderDataTemplateMandate, listDataTemplates, setTeamFolderDataTemplateMandate, type DataTemplate } from "../../../../../lib/api/metadata";

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

function SettingRow({ title, description, checked = false, disabled = false, onChange }: { title: string; description: string; checked?: boolean; disabled?: boolean; onChange?: (checked: boolean) => void }) {
  return <div className="flex min-h-[112px] items-center justify-between gap-6 py-5"><div><h3 className="text-[15px] font-medium text-[#333]">{title}</h3><p className="mt-2 max-w-[720px] text-[13px] leading-6 text-[#666]">{description}</p></div><button type="button" role="switch" aria-checked={checked} disabled={disabled || !onChange} onClick={() => onChange?.(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-[#2c66dd]" : "bg-[#d9dce0]"} ${disabled || !onChange ? "cursor-not-allowed opacity-55" : ""}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${checked ? "end-1" : "start-1"}`} /></button></div>;
}

export default function TeamFolderManagePage() {
  const params = useParams<{ teamFolderId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { locale } = useLocale();
  const { requestConfirm, confirmModal } = useConfirmAction();
  const id = params.teamFolderId;
  const adminBase = pathname.startsWith("/admin/team-folders") ? "/admin/team-folders" : "/files/team-folders";
  const manageBase = `${adminBase}/${encodeURIComponent(id)}/manage`;
  const initialTab = isTab(searchParams.get("tab")) ? searchParams.get("tab") as TabKey : "details";

  const [tab, setTab] = useState<TabKey>(initialTab);
  const [folder, setFolder] = useState<TeamFolderRecord | null>(null);
  const [members, setMembers] = useState<TeamFolderMember[]>([]);
  const [groups, setGroups] = useState<TeamFolderGroup[]>([]);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [profiles, setProfiles] = useState<OrgMember[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<OrgMember | null>(null);
  const [inviteRole, setInviteRole] = useState<TeamFolderRole>("EDITOR");
  const [selectedGroup, setSelectedGroup] = useState<GroupOption | null>(null);
  const [groupRole, setGroupRole] = useState<TeamFolderRole>("EDITOR");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [panelLoading, setPanelLoading] = useState(false);
  const [activityRows, setActivityRows] = useState<TeamFolderActivity[]>([]);
  const [trashRows, setTrashRows] = useState<TeamFolderTrashItem[]>([]);
  const [sharedRows, setSharedRows] = useState<TeamFolderSharedItem[]>([]);
  const [dataTemplates, setDataTemplates] = useState<DataTemplate[]>([]);
  const [mandateTemplateId, setMandateTemplateId] = useState<string | null>(null);
  const [mandateTarget, setMandateTarget] = useState<"FILES"|"FOLDERS"|"BOTH">("BOTH");
  const [mandateEnabled, setMandateEnabled] = useState(false);

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
      setGroups(memberRes.groups ?? []);
      setRole(details.role === "ORG_ADMIN" ? "ORG_ADMIN" : currentRole);
      if (canManageMembers(details.role)) {
        try {
          const [profilesData, groupsData] = await Promise.all([listOrganizationMembers({ status: "ACTIVE" }), listGroups()]);
          setProfiles(profilesData);
          setGroupOptions(groupsData);
        } catch {
          setProfiles([]);
          setGroupOptions([]);
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

  useEffect(() => {
    if (tab !== "templates") return;
    let live = true;
    setPanelLoading(true);
    Promise.all([listDataTemplates(false), getTeamFolderDataTemplateMandate(id)]).then(([templates, mandate]) => {
      if (!live) return;
      setDataTemplates(templates);
      setMandateTemplateId(mandate.template?.id ?? null);
      setMandateTarget(mandate.target);
      setMandateEnabled(mandate.enabled);
    }).catch((cause) => { if (live) setError(cause instanceof ApiError ? cause.message : (locale === "ar" ? "تعذر تحميل قوالب البيانات." : "Unable to load data templates.")); }).finally(() => { if (live) setPanelLoading(false); });
    return () => { live = false; };
  }, [id, locale, tab]);

  useEffect(() => {
    if (tab !== "activity" && tab !== "trash" && tab !== "shared") return;
    let live = true;
    setPanelLoading(true);
    const loadPanel = async () => {
      try {
        if (tab === "activity") setActivityRows(await listTeamFolderActivity(id));
        if (tab === "trash") setTrashRows(await listTeamFolderTrash(id));
        if (tab === "shared") setSharedRows(await listTeamFolderShared(id));
      } catch (cause) {
        if (live) setError(cause instanceof ApiError ? cause.message : (locale === "ar" ? "تعذر تحميل البيانات." : "Unable to load the data."));
      } finally {
        if (live) setPanelLoading(false);
      }
    };
    void loadPanel();
    return () => { live = false; };
  }, [id, locale, tab]);

  const visibleMembers = useMemo(() => {
    const q = memberSearch.trim().toLocaleLowerCase();
    return members.filter((member) => {
      const nameValue = displayMemberName(member, profiles).toLocaleLowerCase();
      return !q || nameValue.includes(q) || member.email.toLocaleLowerCase().includes(q);
    });
  }, [members, memberSearch, profiles]);

  const availableProfiles = useMemo(() => {
    const assigned = new Set(members.map((member) => member.userId));
    return profiles.filter((profile) => {
      const profileId = profile.userId || profile.id;
      return Boolean(profileId) && !assigned.has(profileId);
    });
  }, [profiles, members]);

  const selectTab = (next: TabKey) => {
    setTab(next);
    router.replace(`${manageBase}?tab=${next}`, { scroll: false });
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
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : (locale === "ar" ? "تعذر إضافة العضو." : "Unable to add the member."));
    } finally {
      setBusy(false);
    }
  };

  const availableGroups = useMemo(() => {
    const assigned = new Set(groups.map((group) => group.groupId));
    return groupOptions.filter((group) => !assigned.has(group.id));
  }, [groups, groupOptions]);

  const addGroup = async () => {
    if (!selectedGroup || !canManage || busy) return;
    setBusy(true); setError("");
    try { await addTeamFolderGroup(id, selectedGroup.id, groupRole); setSelectedGroup(null); await load(); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : (locale === "ar" ? "تعذر إضافة المجموعة." : "Unable to add the group.")); }
    finally { setBusy(false); }
  };

  const changeGroupRole = async (groupId: string, next: TeamFolderRole) => {
    if (!canManage || busy) return;
    setBusy(true); setError("");
    try { await updateTeamFolderGroup(id, groupId, next); await load(); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : (locale === "ar" ? "تعذر تحديث دور المجموعة." : "Unable to update the group role.")); }
    finally { setBusy(false); }
  };

  const removeGroup = (groupId: string) => {
    if (!canManage || busy) return;
    requestConfirm({
      title: locale === "ar" ? "إزالة المجموعة" : "Remove group",
      description: locale === "ar" ? "هل تريد إزالة المجموعة من مجلد الفريق؟" : "Remove this group from the Team Folder?",
      confirmLabel: locale === "ar" ? "إزالة" : "Remove",
      run: async () => {
        setBusy(true); setError("");
        try { await removeTeamFolderGroup(id, groupId); await load(); }
        catch (cause) { setError(cause instanceof ApiError ? cause.message : (locale === "ar" ? "تعذر إزالة المجموعة." : "Unable to remove the group.")); }
        finally { setBusy(false); }
      },
    });
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

  const removeMember = (userId: string) => {
    if (!canManage || busy) return;
    requestConfirm({
      title: locale === "ar" ? "إزالة العضو" : "Remove member",
      description: locale === "ar" ? "هل تريد إزالة هذا العضو من مجلد الفريق؟" : "Remove this member from the Team Folder?",
      confirmLabel: locale === "ar" ? "إزالة" : "Remove",
      run: async () => {
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
      },
    });
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
      router.push(adminBase);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : (locale === "ar" ? "تعذر مغادرة مجلد الفريق." : "Unable to leave the Team Folder."));
    } finally {
      setBusy(false);
    }
  };

  const deleteFolder = () => {
    if (!canRename || busy) return;
    const name = folder?.name ?? "";
    requestConfirm({
      title: locale === "ar" ? "حذف مجلد الفريق" : "Delete Team Folder",
      description: locale === "ar" ? `هل تريد حذف «${name}»؟` : `Delete “${name}”?`,
      confirmLabel: locale === "ar" ? "حذف" : "Delete",
      run: async () => {
        setBusy(true);
        try {
          await deleteTeamFolder(id);
          window.dispatchEvent(new Event("workdrive:team-folders-changed"));
          router.push(adminBase);
        } catch (cause) {
          setError(cause instanceof ApiError ? cause.message : (locale === "ar" ? "تعذر حذف مجلد الفريق." : "Unable to delete the Team Folder."));
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const updateSettings = async (patch: { isPublicToOrg?: boolean; allowExternalSharing?: boolean; allowViewerDownloads?: boolean; allowEmailUploads?: boolean }) => {
    if (!canRename || settingsBusy) return;
    setSettingsBusy(true);
    setError("");
    try {
      const updated = await updateTeamFolderSettings(id, patch);
      setFolder((current) => current ? { ...current, ...updated } : current);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : (locale === "ar" ? "تعذر تحديث الإعداد." : "Unable to update the setting."));
    } finally {
      setSettingsBusy(false);
    }
  };

  if (!folder && !error) {
    return <section className="theme-aware-page flex h-full min-h-0 items-center justify-center text-sm" style={{ color: "var(--wd-text-muted, #64748b)", background: "var(--wd-canvas, #fff)", fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif" }}>Loading…</section>;
  }

  const rootHref = folder?.rootFolderId ? `/files/${encodeURIComponent(folder.rootFolderId)}` : adminBase;

  return (
    <section className="theme-aware-page min-w-0" style={{ fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif", color: "var(--wd-text, #212121)", background: "var(--wd-canvas, #fff)" }}>
      {confirmModal}
      <nav className="team-manage-nav">
        {tabs.map((item) => (
          <button key={item.key} type="button" onClick={() => selectTab(item.key)} className={`team-manage-tab ${tab === item.key ? "is-active" : ""}`}>
            <Icon name={item.icon} />
            <span>{locale === "ar" ? item.ar : item.en}</span>
          </button>
        ))}
      </nav>

      {error ? <div className="mx-auto mt-4 w-full max-w-[930px] rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-700" role="alert">{error}</div> : null}

      <main className="w-full">
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
                  <dt className="text-slate-500">{locale === "ar" ? "النوع" : "Type"}</dt><dd>{folder?.isPublicToOrg ? (locale === "ar" ? "مجلد فريق عام" : "Public Team Folder") : (locale === "ar" ? "مجلد فريق خاص" : "Private Team Folder")}</dd>
                  <dt className="text-slate-500">{locale === "ar" ? "الدور" : "Role"}</dt><dd>{role === "ORG_ADMIN" ? "Admin" : role || "Member"}</dd>
                  <dt className="text-slate-500">{locale === "ar" ? "الحجم" : "Size"}</dt><dd>{formatBytes(folder?.totalSize ?? 0)}</dd>
                </dl>
              </section>
              <section>
                <h2 className="mb-6 text-[14px] font-semibold text-slate-800">{folder?.memberCount ?? members.length} {locale === "ar" ? "عضو" : "Member"}{(folder?.memberCount ?? members.length) === 1 ? "" : "s"}</h2>
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
                <div className="mb-7 grid gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_180px_96px]">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-slate-500">{locale === "ar" ? "العضو المتاح" : "Available member"}</label>
                    <ImkanOptionPicker appearance="audit"
                      value={selectedUser ? (selectedUser.userId || selectedUser.id) : ""}
                      onChange={(value) => {
                        const next = availableProfiles.find((profile) => (profile.userId || profile.id) === value) || null;
                        setSelectedUser(next);
                      }}
                      ariaLabel={locale === "ar" ? "العضو المتاح" : "Available member"}
                      fullWidth
                      allowEmpty
                      emptyLabel={locale === "ar" ? "اختر عضوًا من القائمة" : "Select a member"}
                      options={availableProfiles.map((profile) => ({
                        value: profile.userId || profile.id,
                        label: profile.name ? `${profile.name} — ${profile.email}` : profile.email,
                      }))}
                    />
                  </div>
                  <ImkanOptionPicker appearance="audit"
                    value={inviteRole}
                    onChange={(value) => setInviteRole(value as TeamFolderRole)}
                    ariaLabel={locale === "ar" ? "الدور" : "Role"}
                    fullWidth
                    className="self-end"
                    options={[{ value: "EDITOR", label: "Editor" }, { value: "VIEWER", label: "Viewer" }, { value: "ORGANIZER", label: "Organizer" }, { value: "ADMIN", label: "Admin" }]}
                  />
                  <button type="button" onClick={() => void addMember()} disabled={!selectedUser || busy} className="h-[42px] self-end rounded-[9px] bg-[color:var(--wd-primary)] px-4 text-[14px] font-semibold text-white disabled:opacity-50">{locale === "ar" ? "إضافة" : "Add"}</button>
                </div>
              ) : null}
              {canManage ? (
                <div className="mb-7 rounded-lg border border-slate-200 p-4">
                  <div className="mb-3 flex items-center justify-between"><div><strong className="text-[13px]">{locale === "ar" ? "إضافة مجموعة" : "Add Group"}</strong><p className="mt-1 text-[11px] text-slate-500">{locale === "ar" ? "أضف مجموعة كاملة إلى مجلد الفريق وامنح جميع أعضائها الدور نفسه." : "Add an entire group and apply one Team Folder role to all its members."}</p></div></div>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_96px]">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-medium text-slate-500">{locale === "ar" ? "المجموعة المتاحة" : "Available group"}</label>
                      <ImkanOptionPicker appearance="audit"
                        value={selectedGroup?.id || ""}
                        onChange={(value) => {
                          const next = availableGroups.find((group) => group.id === value) || null;
                          setSelectedGroup(next);
                        }}
                        ariaLabel={locale === "ar" ? "المجموعة المتاحة" : "Available group"}
                        fullWidth
                        allowEmpty
                        emptyLabel={locale === "ar" ? "اختر مجموعة من القائمة" : "Select a group"}
                        options={availableGroups.map((group) => ({
                          value: group.id,
                          label: `${group.name} — ${group.memberCount} ${locale === "ar" ? "عضو" : "members"}`,
                        }))}
                      />
                    </div>
                    <ImkanOptionPicker appearance="audit"
                      value={groupRole}
                      onChange={(value) => setGroupRole(value as TeamFolderRole)}
                      ariaLabel={locale === "ar" ? "دور المجموعة" : "Group role"}
                      fullWidth
                      className="self-end"
                      options={[{ value: "EDITOR", label: "Editor" }, { value: "VIEWER", label: "Viewer" }, { value: "COMMENTER", label: "Commenter" }, { value: "ORGANIZER", label: "Organizer" }, { value: "ADMIN", label: "Admin" }]}
                    />
                    <button type="button" onClick={() => void addGroup()} disabled={!selectedGroup || busy} className="h-[42px] self-end rounded-[9px] bg-[color:var(--wd-primary)] px-4 text-[14px] font-semibold text-white disabled:opacity-50">{locale === "ar" ? "إضافة" : "Add"}</button>
                  </div>
                </div>
              ) : null}
              {groups.length ? <div className="mb-7 overflow-hidden rounded-lg border border-slate-200"><div className="border-b bg-slate-50 px-4 py-3 text-[12px] font-semibold">{locale === "ar" ? "المجموعات المضافة" : "Added Groups"}</div>{groups.map((group) => <div key={group.groupId} className="flex min-h-[60px] items-center gap-3 border-b border-slate-100 px-4 last:border-b-0"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#edf3ff] text-[#315da8]">👥</span><div className="min-w-0 flex-1"><strong className="block truncate text-[12px]">{group.name}</strong><span className="text-[10px] text-slate-500">{group.memberCount} {locale === "ar" ? "عضو" : "members"}</span></div>{canManage ? <ImkanOptionPicker appearance="audit" value={group.role} onChange={(value) => void changeGroupRole(group.groupId, value as TeamFolderRole)} disabled={busy} ariaLabel={locale === "ar" ? "دور المجموعة" : "Group role"} options={[{ value: "ADMIN", label: "Admin" }, { value: "ORGANIZER", label: "Organizer" }, { value: "EDITOR", label: "Editor" }, { value: "COMMENTER", label: "Commenter" }, { value: "VIEWER", label: "Viewer" }]} /> : <span className="text-[11px] text-slate-500">{group.role}</span>}{canManage ? <button type="button" onClick={() => void removeGroup(group.groupId)} className="h-8 w-8 rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600">×</button> : null}</div>)}</div> : null}
              <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2"><strong className="text-[13px]">{members.length} {locale === "ar" ? "عضو" : "Member"}{members.length === 1 ? "" : "s"}</strong><input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder={locale === "ar" ? "بحث" : "Search"} className="h-9 w-[285px] rounded-full border border-slate-200 px-3 text-[13px] outline-none focus:border-[color:var(--wd-primary)]" /></div>
              <div className="divide-y divide-slate-100 border-y border-slate-100">
                {visibleMembers.map((member) => <div key={member.userId} className="flex min-h-[66px] items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{displayMemberName(member, profiles).slice(0,2).toUpperCase()}</span><div className="min-w-0 flex-1"><strong className="block text-[13px]">{displayMemberName(member, profiles)}</strong><span className="text-[12px] text-slate-500">{member.email}</span></div>{canManage ? <ImkanOptionPicker appearance="audit" value={member.role} onChange={(value) => void changeRole(member.userId, value as TeamFolderRole)} disabled={busy} ariaLabel={locale === "ar" ? "دور العضو" : "Member role"} options={toImkanPickerOptions([member.role, ...ROLE_ORDER.filter((r) => r !== member.role)])} /> : <span className="text-[12px] text-slate-500">{member.role}</span>}{canManage ? <button type="button" onClick={() => void removeMember(member.userId)} className="h-8 w-8 rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600" title={locale === "ar" ? "إزالة" : "Remove"}>×</button> : null}</div>)}
              </div>
            </section>
          ) : null}

          {tab === "settings" ? (
            <section className="mx-auto w-full max-w-[930px] rounded-[16px] border border-[#e5e5e5] bg-white p-7">
              <h2 className="text-[17px] font-medium text-[#2d2d2d]">{locale === "ar" ? "نوع مجلد الفريق" : "Team Folder type"}</h2>
              <div className="mt-4 flex gap-8 text-[13px]">
                <label className="flex items-center gap-2"><input type="radio" name="team-folder-visibility" checked={Boolean(folder?.isPublicToOrg)} disabled={!canRename || settingsBusy} onChange={() => void updateSettings({ isPublicToOrg: true })} /> {locale === "ar" ? "عام" : "Public"}</label>
                <label className="flex items-center gap-2"><input type="radio" name="team-folder-visibility" checked={!folder?.isPublicToOrg} disabled={!canRename || settingsBusy} onChange={() => void updateSettings({ isPublicToOrg: false })} /> {locale === "ar" ? "خاص" : "Private"}</label>
              </div>
              <p className="mt-3 text-[13px] leading-6 text-[#666]">{locale === "ar" ? "خاص: يقتصر الوصول على الأعضاء المضافين. عام: يمكن لأعضاء المؤسسة الانضمام." : "Private limits access to added members. Public lets team members join the Team Folder."}</p>
              <div className="mt-7 divide-y divide-[#ededed] border-y border-[#ededed]">
                <SettingRow title={locale === "ar" ? "السماح برفع الملفات عبر البريد الإلكتروني" : "Allow file uploads via email"} description={locale === "ar" ? "عند التفعيل يمكن قبول الملفات الواردة عبر عنوان البريد المرتبط بمجلد الفريق (حسب إعدادات المجموعة)." : "When enabled, this Team Folder can accept files submitted via its associated email address."} checked={Boolean((folder as { allowEmailUploads?: boolean } | null)?.allowEmailUploads)} disabled={!canRename || settingsBusy} onChange={(checked) => void updateSettings({ allowEmailUploads: checked })} />
                <SettingRow title={locale === "ar" ? "السماح لأعضاء مجلد الفريق بالمشاركة خارج الفريق" : "Allow Team Folder members to share outside your team"} description={locale === "ar" ? "يتحكم هذا الإعداد في المشاركة الخارجية لهذا المجلد." : "Controls whether this Team Folder permits external sharing."} checked={folder?.allowExternalSharing ?? true} disabled={role !== "ORG_ADMIN" && role !== "ADMIN" || settingsBusy} onChange={(checked) => void updateSettings({ allowExternalSharing: checked })} />
                <SettingRow title={locale === "ar" ? "إظهار خيارات التنزيل والطباعة" : "Show download and print options"} description={locale === "ar" ? "يتحكم هذا الإعداد في تنزيل وطباعة المستخدمين ذوي صلاحية العرض." : "Controls download and print access for viewers in this Team Folder."} checked={folder?.allowViewerDownloads ?? true} disabled={role !== "ORG_ADMIN" && role !== "ADMIN" || settingsBusy} onChange={(checked) => void updateSettings({ allowViewerDownloads: checked })} />
              </div>
            </section>
          ) : null}

          {tab === "activity" ? (
            <section className="mx-auto w-full max-w-[930px]">
              <div className="mb-5 flex flex-wrap items-center justify-center gap-3">
                <ImkanOptionPicker
                  appearance="audit"
                  value={activityFilter}
                  onChange={(value) => setActivityFilter(value || "ALL")}
                  ariaLabel="Activity filter"
                  options={[
                    { value: "ALL", label: locale === "ar" ? "كل الأنشطة" : "All Activities" },
                    { value: "UPLOAD", label: locale === "ar" ? "رفع" : "Uploads" },
                    { value: "SHARE", label: locale === "ar" ? "مشاركة" : "Sharing" },
                    { value: "DELETE", label: locale === "ar" ? "حذف" : "Deletes" },
                    { value: "UPDATE", label: locale === "ar" ? "تحديث" : "Updates" },
                  ]}
                />
                <button
                  type="button"
                  className="inline-flex h-[42px] items-center rounded-[9px] border border-[#d7d9dc] bg-white px-3 text-[14px] text-[#202124] transition hover:border-[#b8bdc5] hover:bg-slate-50"
                  onClick={() => {
                    const rows = activityFilter === "ALL"
                      ? activityRows
                      : activityRows.filter((row) => String(row.action || "").toUpperCase().includes(activityFilter));
                    const header = ["time", "actor", "action", "name"];
                    const lines = [header.join(",")].concat(
                      rows.map((row) => {
                        const actor = row.actor?.name || row.actor?.email || "";
                        const name = row.metadata && typeof row.metadata === "object" && "name" in row.metadata ? String((row.metadata as { name?: string }).name || "") : "";
                        const cells = [row.createdAt || "", actor, row.action || "", name].map((c) => `"${String(c).replace(/"/g, '""')}"`);
                        return cells.join(",");
                      }),
                    );
                    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `team-folder-activity-${id || "export"}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  {locale === "ar" ? "تصدير تقرير النشاط" : "Export Activity Report"}
                </button>
              </div>
              {panelLoading ? <div className="py-12 text-center text-[13px] text-slate-500">Loading…</div> : activityRows.length === 0 ? <div className="py-16 text-center text-[14px] text-slate-500">{locale === "ar" ? "لا يوجد نشاط بعد" : "No activity yet"}</div> : <div className="relative mx-auto max-w-[610px] border-s border-[#d9dce0] ps-8">{(activityFilter === "ALL" ? activityRows : activityRows.filter((row) => String(row.action || "").toUpperCase().includes(activityFilter))).map((row) => <div key={row.id} className="relative mb-8"><span className="absolute -start-[9px] top-0 h-[18px] w-[18px] rounded-full border-4 border-white bg-[#e6e7e9]" /><div className="-ms-16 mb-1 w-12 text-end text-[12px] leading-4 text-[#555]">{formatDateLocalized(row.createdAt, locale)}</div><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">{(row.actor?.name || row.actor?.email || "You").slice(0,2).toUpperCase()}</span><div><strong className="block text-[13px] text-[#2457B8]">{row.actor?.name || row.actor?.email || "You"}</strong><div className="text-[13px] text-[#333]">{row.action.replaceAll("_", " ")}</div>{row.metadata && typeof row.metadata === "object" && "name" in row.metadata ? <div className="mt-1 text-[13px] text-[#555]">{String(row.metadata.name)}</div> : null}</div></div></div>)}</div>}
            </section>
          ) : null}

          {tab === "trash" ? (
            <section className="mx-auto w-full max-w-[930px]">
              {panelLoading ? <div className="py-12 text-center text-[13px] text-slate-500">Loading…</div> : trashRows.length === 0 ? <div className="flex min-h-[420px] items-center justify-center"><div className="text-center"><div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-50 text-slate-300"><Icon name="trash" /></div><h2 className="text-[15px] font-medium text-[#333]">{locale === "ar" ? "لا توجد عناصر في سلة المهملات" : "No items in Trash"}</h2><p className="mt-2 text-[13px] text-[#777]">{locale === "ar" ? "العناصر المحذوفة من مجلد الفريق ستظهر هنا." : "Deleted items from this Team Folder will appear here."}</p></div></div> : <div className="overflow-hidden rounded-lg border border-slate-200"><div className="grid grid-cols-[1fr_170px_140px] border-b border-slate-200 bg-slate-50 px-4 py-3 text-[12px] font-medium text-slate-500"><span>Name</span><span>Deleted</span><span>Actions</span></div>{trashRows.map((row) => <div key={row.id} className="grid grid-cols-[1fr_170px_140px] items-center border-b border-slate-100 px-4 py-3 text-[13px]"><span>{row.file?.name || row.folder?.name || "—"}</span><span className="text-slate-500">{formatDateLocalized(row.deletedAt, locale)}</span><span className="flex gap-2">{row.fileId ? <><button type="button" className="text-[12px] text-[#2457B8]" onClick={() => void restoreFile(row.fileId!).then(() => listTeamFolderTrash(id).then(setTrashRows))}>Restore</button><button type="button" className="text-[12px] text-red-600" onClick={() => void permanentDeleteFile(row.fileId!).then(() => listTeamFolderTrash(id).then(setTrashRows))}>Delete</button></> : null}</span></div>)}</div>}
            </section>
          ) : null}

          {tab === "shared" ? (
            <section className="mx-auto w-full max-w-[930px]">
              <div className="mb-4 flex items-center gap-2"><button type="button" className="inline-flex h-[42px] items-center gap-2 rounded-[9px] border border-[#d7d9dc] bg-white px-3 text-start text-[14px] text-[#202124] transition hover:border-[#b8bdc5]">Direct sharing to external users <span className="text-[#5f6368]">⌄</span></button><button type="button" className="inline-flex h-[42px] items-center gap-2 rounded-[9px] border border-[#d7d9dc] bg-white px-3 text-start text-[14px] text-[#202124] transition hover:border-[#b8bdc5]">All File Types <span className="text-[#5f6368]">⌄</span></button></div>
              {panelLoading ? <div className="py-12 text-center text-[13px] text-slate-500">Loading…</div> : sharedRows.length === 0 ? <div className="flex min-h-[420px] items-center justify-center text-center"><div><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#f4f7fb] text-[#9aa6b2]"><Icon name="share" /></div><h2 className="text-[15px] font-medium text-[#333]">There are no Shared Items here</h2></div></div> : <div className="divide-y divide-slate-100 border-y border-slate-100">{sharedRows.map((row) => <div key={row.id} className="flex min-h-[62px] items-center gap-3 px-3"><Icon name={row.resourceType === "FILE" ? "template" : "folder"} /><div className="min-w-0 flex-1"><strong className="block truncate text-[13px]">{row.name}</strong><span className="text-[11px] text-slate-500">{row.recipients.map((recipient) => recipient.name || recipient.email).join(", ")}</span></div><span className="text-[12px] text-slate-500">{row.permission}</span></div>)}</div>}
            </section>
          ) : null}

          {tab === "templates" ? (
            <section className="mx-auto w-full max-w-[930px] space-y-6">
              <div className="rounded-[16px] border border-[#e5e5e5] bg-white p-7">
                <div className="flex items-start justify-between gap-6"><div><h2 className="text-[17px] font-medium text-[#2d2d2d]">{locale === "ar" ? "فرض قالب بيانات" : "Mandate data template association"}</h2><p className="mt-3 max-w-[760px] text-[13px] leading-6 text-[#666]">{locale === "ar" ? "سيتم ربط القالب تلقائيًا بالعناصر الجديدة التي تضاف مباشرة إلى مجلد الفريق، مع طلب الخصائص المطلوبة." : "Automatically associate the template with new items added directly to this Team Folder and require the custom properties."}</p></div><button type="button" disabled={!canManage || !dataTemplates.length} onClick={() => setMandateEnabled((v) => !v)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${mandateEnabled ? "bg-[#2c66dd]" : "bg-[#d9dce0]"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${mandateEnabled ? "end-1" : "start-1"}`} /></button></div>
                <div className="mt-6 grid gap-4 md:grid-cols-2"><label><span className="mb-1.5 block text-[11px] font-medium text-[#555]">{locale === "ar" ? "قالب البيانات" : "Data Template"}</span><ImkanOptionPicker appearance="audit" disabled={!canManage || !mandateEnabled} value={mandateTemplateId ?? ""} onChange={(value) => setMandateTemplateId(value || null)} ariaLabel={locale === "ar" ? "قالب البيانات" : "Data Template"} fullWidth allowEmpty emptyLabel={locale === "ar" ? "اختر قالبًا" : "Select a template"} options={dataTemplates.map((t) => ({ value: t.id, label: t.name }))} /></label><label><span className="mb-1.5 block text-[11px] font-medium text-[#555]">{locale === "ar" ? "يطبق على" : "Apply to"}</span><ImkanOptionPicker appearance="audit" disabled={!canManage || !mandateEnabled} value={mandateTarget} onChange={(value) => setMandateTarget(value as "FILES"|"FOLDERS"|"BOTH")} ariaLabel={locale === "ar" ? "يطبق على" : "Apply to"} fullWidth options={[{ value: "FILES", label: locale === "ar" ? "الملفات فقط" : "Files only" }, { value: "FOLDERS", label: locale === "ar" ? "المجلدات فقط" : "Folders only" }, { value: "BOTH", label: locale === "ar" ? "الملفات والمجلدات" : "Files and folders" }]} /></label></div>
                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-5"><span className="text-[11px] text-slate-500">{dataTemplates.length ? `${dataTemplates.length} ${locale === "ar" ? "قالبًا نشطًا متاحًا" : "active templates available"}` : (locale === "ar" ? "لا توجد قوالب بيانات نشطة." : "No active data templates available.")}</span><button disabled={!canManage || (mandateEnabled && !mandateTemplateId) || settingsBusy} onClick={async () => { setSettingsBusy(true); try { await setTeamFolderDataTemplateMandate(id, { templateId: mandateEnabled ? mandateTemplateId : null, target: mandateTarget }); setError(""); } catch (cause) { setError(cause instanceof ApiError ? cause.message : (locale === "ar" ? "تعذر حفظ الإعداد." : "Unable to save the setting.")); } finally { setSettingsBusy(false); } }} className="h-9 rounded-lg bg-[color:var(--wd-primary)] px-4 text-[11px] font-semibold text-white disabled:opacity-50">{settingsBusy ? (locale === "ar" ? "جارٍ الحفظ..." : "Saving...") : (locale === "ar" ? "حفظ" : "Save")}</button></div>
              </div>
              <div className="rounded-[16px] border border-[#e5e5e5] bg-white p-7"><h3 className="text-[17px] font-medium text-[#333]">{locale === "ar" ? "قوالب المؤسسة المتاحة" : "Available Data Templates"}</h3><p className="mt-2 text-[13px] leading-6 text-[#666]">{locale === "ar" ? "يمكن لمسؤول المؤسسة إدارة القوالب والحقول من Admin Console." : "Organization admins can manage templates and custom fields from the Admin Console."}</p><Link href="/admin/data-templates" className="mt-5 inline-flex h-9 items-center rounded-full bg-[color:var(--wd-primary)] px-4 text-[13px] font-semibold text-white">{locale === "ar" ? "إدارة قوالب البيانات" : "Manage Data Templates"}</Link></div>
            </section>
          ) : null}

          {canManage ? <div className="mt-10 border-t border-slate-100 pt-6"><button type="button" onClick={() => void deleteFolder()} disabled={busy} className="text-[13px] font-medium text-red-600 hover:underline">{locale === "ar" ? "حذف مجلد الفريق" : "Delete Team Folder"}</button></div> : null}
          {!canManage && role ? <div className="mt-10 border-t border-slate-100 pt-6"><button type="button" onClick={() => void leave()} disabled={busy} className="text-[13px] font-medium text-red-600 hover:underline">{locale === "ar" ? "مغادرة مجلد الفريق" : "Leave Team Folder"}</button></div> : null}
        </div>
      </main>
    </section>
  );
}
