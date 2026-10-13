"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "../locale-provider";
import { AccountAvatar } from "../account-avatar";

type Props = { open: boolean; onClose: () => void; teamName?: string };

type Member = { id: string; name: string; email: string; role: string; avatarUrl?: string | null };

export function TeamDetailsModal({ open, onClose, teamName = "IMKAN" }: Props) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const [tab, setTab] = useState<"members" | "groups">("members");
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    // Load from local session / mock realistic data matching screenshot
    try {
      const raw = localStorage.getItem("workdrive_user");
      const u = raw ? JSON.parse(raw) : null;
      setMembers([
        {
          id: u?.id || "932846641",
          name: u?.name || "Osama Sharekh",
          email: u?.email || "osamasharekh0@gmail.com",
          role: "Super Admin",
          avatarUrl: u?.avatarUrl || null,
        },
      ]);
    } catch {
      setMembers([{ id: "1", name: "Osama Sharekh", email: "osamasharekh0@gmail.com", role: "Super Admin" }]);
    }
  }, [open]);

  if (!open) return null;

  const filtered = members.filter(
    (m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="prefs-overlay" role="dialog" aria-modal="true" aria-label={ar ? "تفاصيل الفريق" : "Team Details"}>
      <div className="team-details-panel" dir={ar ? "rtl" : "ltr"}>
        <div className="prefs-header">
          <div className="prefs-title-row">
            <span className="team-badge">{teamName}</span>
            <h2>{ar ? "تفاصيل الفريق" : "Team Details"}</h2>
          </div>
          <button type="button" className="prefs-close" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"}>×</button>
        </div>

        <div className="team-tabs">
          <button type="button" className={tab === "members" ? "is-active" : ""} onClick={() => setTab("members")}>
            {ar ? "الأعضاء" : "MEMBERS"}
          </button>
          <button type="button" className={tab === "groups" ? "is-active" : ""} onClick={() => setTab("groups")}>
            {ar ? "المجموعات" : "GROUPS"}
          </button>
        </div>

        {tab === "members" ? (
          <div className="team-members-body">
            <div className="team-members-toolbar">
              <div className="team-search">
                <span>🔍</span>
                <input
                  type="search"
                  placeholder={ar ? "أدخل الاسم أو البريد للبحث" : "Enter name or email address to search"}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="team-actions">
                <button type="button" className="team-btn-primary" onClick={() => { onClose(); router.push("/admin/members"); }}>
                  + {ar ? "أعضاء" : "Members"}
                </button>
                <button type="button" className="team-btn-outline" onClick={() => { onClose(); router.push("/admin/members"); }}>
                  {ar ? "إدارة الأعضاء" : "Manage members"}
                </button>
              </div>
            </div>

            <table className="team-table">
              <thead>
                <tr>
                  <th>{ar ? "الاسم" : "NAME"}</th>
                  <th>{ar ? "الدور" : "ROLE"}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={2} className="team-empty">{ar ? "لا يوجد أعضاء" : "No members found"}</td></tr>
                ) : (
                  filtered.map((m) => (
                    <tr key={m.id} onClick={() => { onClose(); router.push(`/members/${m.id}`); }} className="team-row-clickable">
                      <td>
                        <div className="team-member-cell">
                          <AccountAvatar name={m.name} email={m.email} avatarUrl={m.avatarUrl} size={36} />
                          <div>
                            <div className="team-member-name">{m.name} <span className="team-role-tag">{ar ? "مسؤول القالب" : "Template Admin"}</span></div>
                            <div className="team-member-email">{m.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>{ar && m.role === "Super Admin" ? "مسؤول عام" : m.role}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="team-groups-body">
            <div className="team-groups-empty">
              <div className="team-groups-icon">👥+</div>
              <h3>{ar ? "لا توجد مجموعات متاحة" : "No groups available"}</h3>
              <button type="button" className="team-btn-link" onClick={() => { onClose(); router.push("/admin/groups"); }}>
                {ar ? "إنشاء مجموعة" : "Create Group"}
              </button>
              <p>{ar ? "المجموعات طريقة رائعة لإدارة صلاحيات الوصول. يمكنك إضافة مجموعات إلى مجلد الفريق ومشاركة الملفات والمجلدات مع مجموعة." : "Groups are a great way to manage access permission. You can easily add groups to a team folder, and share individual files and folders with a group."}</p>
              <a href="https://www.zoho.com/workdrive/help/groups.html" target="_blank" rel="noreferrer" className="team-btn-link">
                {ar ? "معرفة المزيد عن المجموعات" : "Learn more about groups"}
              </a>
            </div>
            <div className="team-groups-toolbar">
              <button type="button" className="team-btn-primary" onClick={() => { onClose(); router.push("/admin/groups"); }}>
                + {ar ? "جديد" : "New"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
