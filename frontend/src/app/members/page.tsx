"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../../components/locale-provider";
import { Icons } from "../../components/layout/icons";
import { Toast } from "../../components/toast";
import {
  getMemberManagement,
  inviteOrganizationMember,
  suspendOrganizationMember,
  activateOrganizationMember,
  removeOrganizationMemberWithSuccessor,
  type ManagedMember,
  type OrgRole,
} from "../../lib/api/organization";

type Filter = "ACTIVE" | "SUSPENDED" | "REMOVED" | "INVITED";

function initials(name: string | null, email: string) {
  const source = (name?.trim() || email.split("@")[0] || "?").trim();
  return source.slice(0, 2).toUpperCase();
}
function bytes(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "0 byte";
  const units = ["Bytes", "KB", "MB", "GB", "TB"];
  let i = 0; let x = n;
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
  return `${x >= 10 || i === 0 ? Math.round(x) : x.toFixed(1)} ${units[i]}`;
}

export default function MembersPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [filter, setFilter] = useState<Filter>("ACTIVE");
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<Awaited<ReturnType<typeof getMemberManagement>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const next = await getMemberManagement(filter === "INVITED" ? undefined : filter);
      if (filter === "INVITED") {
        next.members = next.invitations.map((inv) => ({
          id: `invite:${inv.id}`, userId: `invite:${inv.id}`, name: null, email: inv.email,
          role: inv.role, status: "PENDING", joinedAt: null, createdAt: inv.createdAt,
          storageUsed: "0", teamFolderCount: 0, groupCount: 0,
        }));
      }
      setData(next);
      setSelected([]);
    } catch (e) {
      setToast({ message: ar ? "تعذر تحميل الأعضاء." : "Unable to load members.", tone: "error" });
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [filter]);

  const members = useMemo(() => {
    const rows = data?.members ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((m) => (m.name ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
  }, [data, query]);

  const selectedRows = members.filter((m) => selected.includes(m.id));
  const allSelected = members.length > 0 && selected.length === members.length;
  const toggleAll = () => setSelected(allSelected ? [] : members.map((m) => m.id));
  const toggleOne = (id: string) => setSelected((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);

  async function perform(action: "suspend" | "activate" | "remove", rows: ManagedMember[]) {
    if (rows.some((row) => row.status === "PENDING")) return;
    try {
      for (const row of rows) {
        if (action === "suspend") await suspendOrganizationMember(row.id);
        if (action === "activate") await activateOrganizationMember(row.id);
        if (action === "remove") await removeOrganizationMemberWithSuccessor(row.id);
      }
      setToast({ message: ar ? "تم تحديث الأعضاء بنجاح." : "Members updated successfully.", tone: "success" });
      setMenuId(null); setBulkOpen(false);
      await load();
    } catch {
      setToast({ message: ar ? "تعذر تنفيذ العملية على أحد الأعضاء." : "The operation could not be completed for one or more members.", tone: "error" });
    }
  }

  const roleLabel = (role: OrgRole) => role === "SUPER_ADMIN" ? (ar ? "مسؤول عام" : "Super Admin") : role === "ADMIN" ? (ar ? "مسؤول" : "Admin") : (ar ? "عضو" : "Member");
  const exportMembers = () => {
    const header = ["Name", "Email", "Role", "Status", "Storage used"];
    const lines = members.map((m) => [m.name || "", m.email, roleLabel(m.role), m.status, bytes(m.storageUsed)].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "imkan-members.csv"; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="members-page min-h-full bg-white text-[#202124]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-[#ececec] px-7 py-4">
          <h1 className="text-[20px] font-semibold">{ar ? "الأعضاء" : "Members"}</h1>
          <div className="flex items-center gap-2">
            <button type="button" className="member-soft-button" onClick={exportMembers}>
              <Icons.download size={16} /> {ar ? "تصدير" : "Export"}
            </button>
            <button type="button" className="member-primary-button" onClick={() => setInviteOpen(true)}>
              <Icons.plus size={16} /> {ar ? "دعوة أعضاء" : "Invite Members"}
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-auto px-5 py-6 lg:px-7">
            <div className="members-toolbar">
              <div className="member-search-combo">
                <div className="relative">
                  <button type="button" className="member-filter-button" onClick={() => setFilterOpen((v) => !v)} aria-expanded={filterOpen}>
                    <Icons.funnel size={15} /> {filter === "ACTIVE" ? (ar ? "نشط" : "Active") : filter === "SUSPENDED" ? (ar ? "موقوف" : "Suspended") : filter === "REMOVED" ? (ar ? "محذوف" : "Deleted") : (ar ? "مدعو" : "Invited")}
                    <Icons.chevD size={13} />
                  </button>
                  {filterOpen ? (
                    <div className="member-popover start-0 top-10">
                      {(["ACTIVE", "SUSPENDED", "REMOVED", "INVITED"] as Filter[]).map((key) => (
                        <button key={key} type="button" className={filter === key ? "is-active" : ""} onClick={() => { setFilter(key); setFilterOpen(false); }}>
                          {key === "ACTIVE" ? (ar ? "نشط" : "Active") : key === "SUSPENDED" ? (ar ? "موقوف" : "Suspended") : key === "REMOVED" ? (ar ? "محذوف" : "Deleted") : (ar ? "مدعو" : "Invited")}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <label className="member-search">
                  <Icons.search size={16} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={ar ? "أدخل الاسم أو البريد الإلكتروني للبحث" : "Enter name or email address to search"} />
                </label>
              </div>
            </div>

            {selected.length > 0 ? (
              <div className="member-selection-bar">
                <span className="flex items-center gap-2 font-semibold text-[#315da8]"><Icons.check size={16} /> {selected.length} {ar ? "عضو محدد" : selected.length === 1 ? "member selected" : "members selected"}</span>
                <div className="flex items-center gap-2">
                  <button type="button" className="member-outline-button" onClick={() => setBulkOpen((v) => !v)}><Icons.gear size={15} /> {ar ? "إدارة" : "Manage"}</button>
                  <button type="button" className="member-circle-button" aria-label="More" onClick={() => setBulkOpen((v) => !v)}><Icons.dots size={16} /></button>
                  {bulkOpen ? (
                    <div className="member-popover end-0 top-11 min-w-[210px]">
                      {filter === "SUSPENDED" ? <button type="button" onClick={() => void perform("activate", selectedRows)}>{ar ? "تنشيط العضو" : "Activate member"}</button> : <button type="button" onClick={() => void perform("suspend", selectedRows)}>{ar ? "إيقاف العضو" : "Suspend member"}</button>}
                      <button type="button" className="danger" onClick={() => void perform("remove", selectedRows)}>{ar ? "حذف العضو" : "Delete member"}</button>
                    </div>
                  ) : null}
                  <button type="button" className="member-escape" onClick={() => setSelected([])}>Esc <span>×</span></button>
                </div>
              </div>
            ) : null}

            <div className="members-table">
              <div className="members-table-head">
                <span className="member-check"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" /></span>
                <span>{ar ? "الاسم" : "Name"}</span>
                <span>{ar ? "المساحة المستخدمة" : "Storage used"}</span>
                <span />
              </div>
              {loading ? (
                <div className="member-empty-row">{ar ? "جارٍ تحميل الأعضاء..." : "Loading members..."}</div>
              ) : members.length === 0 ? (
                <div className="member-empty-row">{ar ? "لا يوجد أعضاء في هذا القسم." : "No members in this section."}</div>
              ) : members.map((m) => (
                <div key={m.id} className={`members-table-row ${selected.includes(m.id) ? "is-selected" : ""}`}>
                  <span className="member-check"><input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggleOne(m.id)} aria-label={`Select ${m.email}`} /></span>
                  <Link href={`/members/${encodeURIComponent(m.id)}`} className="member-name-cell">
                    <span className="member-avatar">{m.avatarUrl ? <img src={m.avatarUrl} alt="" /> : initials(m.name, m.email)}</span>
                    <span className="min-w-0">
                      <span className="member-name">{m.name || m.email.split("@")[0]}</span>
                      <span className="member-email">{m.email}</span>
                    </span>
                    <span className="member-role-badges">
                      {m.role !== "MEMBER" ? <span>{roleLabel(m.role)}</span> : null}
                    </span>
                  </Link>
                  <span className="member-storage">{bytes(m.storageUsed)}</span>
                  <span className="relative flex items-center justify-end gap-2 pe-1">
                    <Link href={`/members/${encodeURIComponent(m.id)}`} className="member-row-manage"><Icons.gear size={14} /> {ar ? "إدارة" : "Manage"}</Link>
                    <button type="button" className="member-circle-button" onClick={() => setMenuId(menuId === m.id ? null : m.id)} aria-label="More"><Icons.dots size={16} /></button>
                    {menuId === m.id ? (
                      <div className="member-popover end-0 top-10 min-w-[220px]">
                        <Link href={`/members/${encodeURIComponent(m.id)}`}>{ar ? "إدارة العضو" : "Manage member"}</Link>
                        {m.status === "SUSPENDED" ? <button type="button" onClick={() => void perform("activate", [m])}>{ar ? "تنشيط" : "Activate"}</button> : <button type="button" onClick={() => void perform("suspend", [m])}>{ar ? "إيقاف" : "Suspend"}</button>}
                        <button type="button" className="danger" onClick={() => void perform("remove", [m])}>{ar ? "حذف" : "Delete"}</button>
                      </div>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </main>

          <aside className="members-license-panel hidden w-[285px] shrink-0 border-s border-[#ededed] px-4 py-5 xl:block">
            <h2>{ar ? "تفاصيل الترخيص" : "License Details"}</h2>
            <div className="license-info">
              <Icons.info size={16} />
              <p>{ar ? <>يمكنك الحصول على حد أقصى <b>{data?.licenseLimit ?? 10}</b> مستخدمين في حسابك التجريبي. <b>{Math.max((data?.licenseLimit ?? 10) - (data?.counts.licensed ?? 0), 0)} تراخيص مستخدم متبقية.</b></> : <>You can have a maximum of <b>{data?.licenseLimit ?? 10}</b> users in your trial account. <b>{Math.max((data?.licenseLimit ?? 10) - (data?.counts.licensed ?? 0), 0)} user licenses remaining.</b></>}</p>
            </div>
            <button type="button" className="license-link" onClick={() => setToast({ message: ar ? "إضافة التراخيص مرتبطة بخطة المؤسسة." : "Additional licenses are managed with the organization plan.", tone: "success" })}>{ar ? "إضافة تراخيص" : "Add Licenses"}</button>
            <div className="license-list">
              {[
                [data?.counts.licensed ?? 0, ar ? "الأعضاء المرخصون" : "Licensed Members"],
                [data?.counts.active ?? 0, ar ? "الأعضاء النشطون" : "Active Members"],
                [data?.counts.invited ?? 0, ar ? "الأعضاء المدعوون" : "Invited Members"],
                [data?.counts.suspended ?? 0, ar ? "الأعضاء الموقوفون" : "Suspended Members"],
                [data?.counts.removed ?? 0, ar ? "الأعضاء المحذوفون" : "Deleted Members"],
                [data?.counts.templateAdmins ?? 0, ar ? "مسؤولو القوالب" : "Template Admins"],
              ].map(([count, text]) => <div key={text as string}><b>{count as number}</b><span>{text as string}</span></div>)}
            </div>
            <div className="license-divider" />
            <div className="license-subtitle">{ar ? `مسؤولو الفريق (${data?.counts.teamAdmins ?? 0})` : `Team Admins (${data?.counts.teamAdmins ?? 0})`}</div>
            {selectedRows.filter((m) => m.role !== "MEMBER").slice(0, 4).map((m) => (
              <div className="license-admin" key={m.id}>
                <span className="member-avatar small">{m.avatarUrl ? <img src={m.avatarUrl} alt="" /> : initials(m.name, m.email)}</span>
                <span><b>{m.name || m.email.split("@")[0]}</b><small>{m.email}</small></span>
              </div>
            ))}
            {selectedRows.length === 0 ? <div className="license-admin"><span className="member-avatar small">{initials("Admin", "admin")}</span><span><b>{ar ? "المسؤولون يظهرون هنا" : "Team admins"}</b><small>{ar ? "اختر عضواً لعرض التفاصيل" : "Select a member to view details"}</small></span></div> : null}
          </aside>
        </div>
      </div>

      {inviteOpen ? <InviteModal ar={ar} onClose={() => setInviteOpen(false)} onDone={async () => { setInviteOpen(false); await load(); }} setToast={setToast} /> : null}
      {toast ? <Toast message={toast.message} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}

function InviteModal({ ar, onClose, onDone, setToast }: { ar: boolean; onClose: () => void; onDone: () => Promise<void>; setToast: (v: { message: string; tone?: "success" | "error" } | null) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("MEMBER");
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    try { await inviteOrganizationMember(email.trim(), role); setToast({ message: ar ? "تم إرسال الدعوة." : "Invitation sent.", tone: "success" }); await onDone(); }
    catch { setToast({ message: ar ? "تعذر إرسال الدعوة." : "Unable to send invitation.", tone: "error" }); }
    finally { setSaving(false); }
  }
  return (
    <div className="member-modal-backdrop" onMouseDown={onClose}>
      <form className="member-modal" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <header><h2>{ar ? "دعوة أعضاء" : "Invite Members"}</h2><button type="button" onClick={onClose}>×</button></header>
        <label>{ar ? "البريد الإلكتروني" : "Email address"}<input value={email} onChange={(e) => setEmail(e.target.value)} autoFocus placeholder="name@example.com" type="email" /></label>
        <label>{ar ? "الدور" : "Role"}<select value={role} onChange={(e) => setRole(e.target.value as OrgRole)}><option value="MEMBER">{ar ? "عضو" : "Member"}</option><option value="ADMIN">{ar ? "مسؤول" : "Admin"}</option><option value="SUPER_ADMIN">{ar ? "مسؤول عام" : "Super Admin"}</option></select></label>
        <footer><button type="button" className="member-soft-button" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</button><button type="submit" className="member-primary-button" disabled={saving}>{ar ? "إرسال الدعوة" : "Send invitation"}</button></footer>
      </form>
    </div>
  );
}
