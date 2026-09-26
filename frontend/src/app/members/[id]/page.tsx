"use client";

import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../../../components/locale-provider";
import { Icons } from "../../../components/layout/icons";
import {
  activateOrganizationMember, getMemberDetails, removeOrganizationMemberWithSuccessor,
  suspendOrganizationMember, updateOrganizationMember, listGroups, addGroupMember, removeGroupMember,
  type MemberDetails, type OrgRole, type GroupOption
} from "../../../lib/api/organization";
import { addTeamFolderMember, removeTeamFolderMember, updateTeamFolderMember, type TeamFolderRole } from "../../../lib/api/team-folders";
import { Toast } from "../../../components/toast";

type Tab = "settings" | "team-folders" | "groups";
const TEAM_ROLES: TeamFolderRole[] = ["ADMIN", "ORGANIZER", "EDITOR", "COMMENTER", "VIEWER"];

function initials(name: string | null, email: string) {
  const s = (name?.trim() || email.split("@")[0] || "?").trim();
  return s.slice(0, 2).toUpperCase();
}
function sizeLabel(value: string) {
  const n = Number(value); if (!Number.isFinite(n) || n <= 0) return "0 byte";
  const units = ["Bytes","KB","MB","GB","TB"]; let x=n,i=0; while(x>=1024&&i<units.length-1){x/=1024;i++;}
  return `${x >= 10 || i === 0 ? Math.round(x) : x.toFixed(1)} ${units[i]}`;
}
function roleLabel(role: string, ar: boolean) {
  const map: Record<string,string> = ar ? { ADMIN:"مسؤول", ORGANIZER:"منظّم", EDITOR:"محرر", COMMENTER:"معلّق", VIEWER:"مشاهد", SUPER_ADMIN:"مسؤول عام", MEMBER:"عضو" } : { ADMIN:"Admin", ORGANIZER:"Organizer", EDITOR:"Editor", COMMENTER:"Commenter", VIEWER:"Viewer", SUPER_ADMIN:"Super Admin", MEMBER:"Member" };
  return map[role] ?? role;
}

export default function MemberDetailsPage() {
  const { locale } = useLocale(); const ar=locale==="ar";
  const params=useParams<{id:string}>(); const search=useSearchParams(); const pathname=usePathname();
  const memberBase = pathname.startsWith("/admin/members") ? "/admin/members" : "/members";
  const id=decodeURIComponent(params.id);
  const [tab,setTab]=useState<Tab>((search.get("tab") as Tab) || "settings");
  const [data,setData]=useState<MemberDetails|null>(null);
  const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  const [toast,setToast]=useState<{message:string;tone?: "success"|"error"}|null>(null);
  const [teamOpen,setTeamOpen]=useState(false); const [groupOpen,setGroupOpen]=useState(false);
  const load=async()=>{setLoading(true);try{setData(await getMemberDetails(id));setError("")}catch{setError(ar?"تعذر تحميل بيانات العضو.":"Unable to load member details.")}finally{setLoading(false)}};
  useEffect(()=>{void load()},[id]);
  useEffect(()=>{const t=search.get("tab") as Tab|null;if(t&&["settings","team-folders","groups"].includes(t))setTab(t)},[search]);
  const member=data?.member;
  const setRole=async(role:OrgRole)=>{try{await updateOrganizationMember(id,role);setToast({message:ar?"تم تحديث الدور.":"Role updated.",tone:"success"});await load()}catch{setToast({message:ar?"تعذر تغيير الدور.":"Unable to change role.",tone:"error"})}};
  const setStatus=async()=>{if(!member)return;try{if(member.status==="SUSPENDED")await activateOrganizationMember(id);else await suspendOrganizationMember(id);await load();setToast({message:ar?"تم تحديث حالة الحساب.":"Account status updated.",tone:"success"})}catch{setToast({message:ar?"تعذر تحديث الحالة.":"Unable to update status.",tone:"error"})}};
  if(loading)return <div className="members-page flex min-h-full items-center justify-center text-sm text-slate-500">{ar?"جارٍ التحميل...":"Loading..."}</div>;
  if(error||!member)return <div className="members-page p-8"><p className="text-red-600">{error||"Member not found"}</p><Link className="member-soft-button mt-4 inline-flex" href={memberBase}>{ar?"العودة":"Back"}</Link></div>;

  return <div className="member-detail-page min-h-full bg-white">
    <div className="member-detail-topbar"><Link href={memberBase} className="member-back"><Icons.chevR size={16} className="rotate-180"/>{ar?"رجوع":"Back"}</Link></div>
    <div className="member-profile-card">
      <div className="member-profile-main">
        <span className="member-profile-avatar">{member.avatarUrl?<img src={member.avatarUrl} alt=""/>:initials(member.name,member.email)}</span>
        <div className="min-w-0"><div className="member-profile-name">{member.name||member.email.split("@")[0]}
          {member.role!=="MEMBER"?<span className="member-badge">{roleLabel(member.role,ar)}</span>:null}
        </div><div className="member-profile-email">{member.email} <button type="button" title="Copy email" onClick={()=>void navigator.clipboard?.writeText(member.email)}>▣</button></div></div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="member-outline-button" onClick={() => setTeamOpen(true)}><Icons.folder size={15}/>{ar?"إضافة مجلدات الفريق":"Add Team Folders"}</button>
        <button type="button" className="member-outline-button" onClick={() => setGroupOpen(true)}><Icons.users size={15}/>{ar?"إضافة مجموعات":"Add Groups"}</button>
      </div>
    </div>

    <div className="member-detail-card">
      <div className="member-tabs">
        {(["settings","team-folders","groups"] as Tab[]).map((key)=><button key={key} className={tab===key?"is-active":""} onClick={()=>setTab(key)}>
          {key==="settings"?<Icons.gear size={16}/>:key==="team-folders"?<Icons.folder size={16}/>:<Icons.users size={16}/>}
          {key==="settings"?(ar?"الإعدادات":"Settings"):key==="team-folders"?(ar?"مجلدات الفريق":"Team Folders"):(ar?"المجموعات":"Groups")}
        </button>)}
      </div>

      {tab==="settings"?<SettingsPanel member={member} ar={ar} onRole={setRole} onStatus={setStatus} onDelete={async()=>{try{await removeOrganizationMemberWithSuccessor(id);location.href=memberBase}catch{setToast({message:ar?"تعذر حذف العضو.":"Unable to delete member.",tone:"error"})}}}/>:null}
      {tab==="team-folders"?<TeamFoldersPanel data={data} ar={ar} onRefresh={load} setToast={setToast}/>:null}
      {tab==="groups"?<GroupsPanel data={data} ar={ar} onRefresh={load} setToast={setToast}/>:null}
    </div>

    {teamOpen?<AddTeamFoldersModal data={data} ar={ar} memberId={member.userId} onClose={()=>setTeamOpen(false)} onDone={async()=>{setTeamOpen(false);await load()}} setToast={setToast}/>:null}
    {groupOpen?<AddGroupsModal data={data} ar={ar} memberId={member.userId} onClose={()=>setGroupOpen(false)} onDone={async()=>{setGroupOpen(false);await load()}} setToast={setToast}/>:null}
    {toast?<Toast message={toast.message} tone={toast.tone} onClose={()=>setToast(null)}/>:null}
  </div>;
}

function SettingsPanel({member,ar,onRole,onStatus,onDelete}:{member:MemberDetails["member"];ar:boolean;onRole:(r:OrgRole)=>Promise<void>;onStatus:()=>Promise<void>;onDelete:()=>Promise<void>}) {
  return <div className="member-settings-panel">
    <SettingRow label={ar?"حالة الحساب":"Account Status"}><span className="member-state-badge">{member.status==="ACTIVE"?(ar?"نشط":"ACTIVE"):(ar?"موقوف":"SUSPENDED")}</span><button className="member-info-icon"><Icons.info size={13}/></button></SettingRow>
    <SettingRow label={ar?"تغيير الدور":"Change Role"}><RolePicker value={member.role} onChange={onRole} ar={ar}/><button className="member-info-icon"><Icons.info size={13}/></button></SettingRow>
    <SettingRow label={ar?"المشاركة الخارجية":"External Sharing"}><span className="member-setting-value">{ar?"مفعلة":"Enabled"}</span><button className="member-info-icon"><Icons.info size={13}/></button></SettingRow>
    <SettingRow label={ar?"مسؤول القوالب":"Template Admin"}><span className="member-state-badge">{ar?"مفعلة":"Enabled"}</span><button className="member-info-icon"><Icons.info size={13}/></button></SettingRow>
    <div className="member-danger-zone"><p>{ar?"حذف هذا العضو سيزيل حسابه من المؤسسة ويفقده الوصول إلى الملفات والمجلدات والبيانات المشتركة. لا يمكن التراجع عن هذا الإجراء.":"Deleting this member will permanently remove their account from your Team. They will immediately lose all access to the Team, including all files, folders, and shared data. This action cannot be undone."}</p><div className="flex gap-2"><button className="member-danger-button" onClick={()=>void onDelete()}>{ar?"حذف العضو":"Delete Member"}</button><button className="member-soft-button" onClick={()=>void onStatus()}>{member.status==="SUSPENDED"?(ar?"تنشيط الحساب":"Activate account"):(ar?"إيقاف الحساب":"Suspend account")}</button></div></div>
  </div>;
}
function SettingRow({label,children}:{label:string;children:React.ReactNode}){return <div className="member-setting-row"><span className="member-setting-label">{label}</span><div className="member-setting-control">{children}</div></div>}

function RolePicker({value,onChange,ar}:{value:OrgRole;onChange:(v:OrgRole)=>void;ar:boolean}) {
  const [open,setOpen]=useState(false);
  const roles:OrgRole[]=["SUPER_ADMIN","ADMIN","MEMBER"];
  return <div className="relative"><button type="button" className="member-role-pill" onClick={()=>setOpen(v=>!v)}>{roleLabel(value,ar)}<Icons.chevD size={12}/></button>{open?<div className="member-role-menu">
    {roles.map(r=><button type="button" key={r} className={value===r?"is-active":""} onClick={()=>{onChange(r);setOpen(false)}}><b>{roleLabel(r,ar)}</b><small>{r==="SUPER_ADMIN"?(ar?"صلاحيات كاملة":"Full control"):r==="ADMIN"?(ar?"إدارة وتنظيم المؤسسة":"Can organize, share, create, edit, and manage members"):(ar?"الوصول كعضو":"Standard member access")}</small></button>)}
  </div>:null}</div>;
}

function TeamFoldersPanel({data,ar,onRefresh,setToast}:{data:MemberDetails;ar:boolean;onRefresh:()=>Promise<void>;setToast:(x:{message:string;tone?:"success"|"error"}|null)=>void}) {
  const [openId,setOpenId]=useState<string|null>(null);
  const [query,setQuery]=useState("");
  async function change(id:string,role:TeamFolderRole){try{await updateTeamFolderMember(id,data.member.userId,role);await onRefresh()}catch{setToast({message:ar?"تعذر تغيير الصلاحية.":"Unable to change permission.",tone:"error"})}}
  async function remove(id:string){try{await removeTeamFolderMember(id,data.member.userId);await onRefresh()}catch{setToast({message:ar?"تعذر إزالة المجلد.":"Unable to remove the team folder.",tone:"error"})}}
  const rows=data.teamFolders.filter(tf=>tf.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const exportFolders = () => {
    const header = ["Team Folder", "Role"];
    const lines = rows.map((tf) => [`"${tf.name.replaceAll('"', '""')}"`, `"${roleLabel(tf.role, false)}"`].join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "imkan-team-folders.csv"; a.click(); URL.revokeObjectURL(url);
  };
  return <div className="member-content-panel">
    <div className="member-team-toolbar">
      <div className="member-search-combo">
        <label className="member-search"><Icons.search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={ar?"البحث باسم مجلد الفريق":"Search by team folder name"}/></label>
      </div>
      <div className="member-team-toolbar-actions"><button type="button" className="member-export-button" onClick={exportFolders}>{ar?"تصدير":"Export"}</button></div>
    </div>
    {rows.length===0?<EmptyPanel icon="folder" title={data.teamFolders.length===0?(ar?"هذا العضو ليس ضمن أي مجلد فريق بعد.":"This member isn't part of any team folders yet."):(ar?"لا توجد نتائج مطابقة.":"No matching team folders.")} text={data.teamFolders.length===0?(ar?"أضفهم إلى مجلد فريق لإدارة الوصول إلى الملفات.":"Add them to a Team Folder to manage file access."):(ar?"جرّب تغيير عبارة البحث.":"Try changing your search.")}/>:<div className="member-data-table"><div className="member-data-head"><span>{ar?"الاسم":"Name"}</span><span>{ar?"دور العضو":"Role"}</span><span/></div>{rows.map(tf=><div className="member-data-row" key={tf.id}><span className="flex items-center gap-3"><Icons.folder size={17}/>{tf.name}</span><span className="relative"><button className="member-role-pill" onClick={()=>setOpenId(openId===tf.id?null:tf.id)}>{roleLabel(tf.role,ar)}<Icons.chevD size={12}/></button>{openId===tf.id?<TeamRoleMenu value={tf.role as TeamFolderRole} ar={ar} onChange={(r)=>{setOpenId(null);void change(tf.id,r)}}/>:null}</span><button className="member-remove-x" onClick={()=>void remove(tf.id)} aria-label={ar?"إزالة":"Remove"}><Icons.x size={15}/></button></div>)}</div>}
  </div>;
}
function TeamRoleMenu({value,ar,onChange}:{value:TeamFolderRole;ar:boolean;onChange:(v:TeamFolderRole)=>void}){return <div className="member-role-menu team-role-menu">{TEAM_ROLES.map(r=><button key={r} onClick={()=>onChange(r)} className={value===r?"is-active":""}><b>{roleLabel(r,ar)}</b><small>{r==="ADMIN"?(ar?"تحكم كامل":"Full control"):r==="ORGANIZER"?(ar?"يمكنه التنظيم والمشاركة":"Can organize, share, create, edit, and manage members"):r==="EDITOR"?(ar?"يمكنه الإنشاء والتحرير والتعليق":"Can create, edit, and comment"):r==="COMMENTER"?(ar?"يمكنه العرض والتعليق":"Can view and comment"):(ar?"يمكنه العرض":"Can view")}</small></button>)}</div>}
function EmptyPanel({icon,title,text}:{icon:"folder"|"users";title:string;text:string}){return <div className="member-empty-panel"><span className="member-empty-icon">{icon==="folder"?<Icons.folder size={42}/>:<Icons.users size={42}/>}</span><h3>{title}</h3><p>{text}</p></div>}

function AddTeamFoldersModal({data,ar,memberId,onClose,onDone,setToast}:{data:MemberDetails;ar:boolean;memberId:string;onClose:()=>void;onDone:()=>Promise<void>;setToast:(x:{message:string;tone?:"success"|"error"}|null)=>void}) {
  const [role,setRole]=useState<TeamFolderRole>("ADMIN"); const [saving,setSaving]=useState<string|null>(null); const [q,setQ]=useState("");
  const available=useMemo(()=>data.availableTeamFolders.filter(f=>f.name.toLowerCase().includes(q.trim().toLowerCase())),[data,q]);
  async function add(id:string){setSaving(id);try{await addTeamFolderMember(id,memberId,role);setToast({message:ar?"تمت إضافة مجلد الفريق.":"Team folder added.",tone:"success"});await onDone()}catch{setToast({message:ar?"تعذر إضافة مجلد الفريق.":"Unable to add team folder.",tone:"error"})}finally{setSaving(null)}}
  return <ModalShell title={ar?"إضافة مجلدات الفريق":"Add Team Folders"} ar={ar} onClose={onClose}>
    <div className="member-modal-search"><Icons.search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={ar?"البحث عن مجلد فريق":"Search team folders"}/></div>
    <div className="member-modal-role"><span>{ar?"صلاحية العضو":"Member role"}</span><select value={role} onChange={e=>setRole(e.target.value as TeamFolderRole)}>{TEAM_ROLES.map(r=><option key={r} value={r}>{roleLabel(r,ar)}</option>)}</select></div>
    <div className="team-folder-option-list">
      {available.length===0?<EmptyPanel icon="folder" title={ar?"لا توجد مجلدات فريق متاحة.":"No team folders available."} text={ar?"هذا العضو مضاف بالفعل إلى جميع مجلدات الفريق المتاحة.":"This member is already assigned to all available team folders."}/>:available.map(folder=><div className="team-folder-option" key={folder.id}>
        <div className="team-folder-option-head"><span className="team-folder-icon"><Icons.folder size={18}/></span><div><b>{folder.name}</b><small>{folder.isPublicToOrg?(ar?"متاح للمؤسسة":"Available to organization"):(ar?"مجلد فريق":"Team Folder")}</small></div><button className="member-primary-button compact" disabled={saving===folder.id} onClick={()=>void add(folder.id)}>{saving===folder.id?(ar?"جارٍ...":"Adding..."):(ar?"إضافة":"Add")}</button></div>
        <div className="team-folder-files">
          {folder.files.length===0?<div className="team-folder-no-files"><Icons.info size={15}/>{ar?"لا توجد ملفات متاحة في مجلد الفريق هذا.":"No files are currently available in this team folder."}</div>:folder.files.map(file=><div className="team-folder-file" key={file.id}><span>{file.name}</span><small>{sizeLabel(file.size)}</small></div>)}
        </div>
      </div>)}
    </div>
  </ModalShell>;
}

function GroupsPanel({data,ar,onRefresh,setToast}:{data:MemberDetails;ar:boolean;onRefresh:()=>Promise<void>;setToast:(x:{message:string;tone?:"success"|"error"}|null)=>void}) {
  async function remove(groupId:string){try{await removeGroupMember(groupId,data.member.userId);await onRefresh()}catch{setToast({message:ar?"تعذر إزالة المجموعة.":"Unable to remove group.",tone:"error"})}}
  return <div className="member-content-panel"><div className="member-section-toolbar"><div><h3>{ar?"المجموعات":"Groups"}</h3><p>{ar?"المجموعات التي ينتمي إليها العضو.":"Groups this member belongs to."}</p></div></div>
    {data.groups.length===0?<EmptyPanel icon="users" title={ar?"هذا العضو ليس ضمن أي مجموعات بعد.":"This member isn't part of any groups yet."} text={ar?"أضف العضو إلى مجموعة لإدارة الوصول إلى الملفات والصلاحيات بشكل جماعي.":"Add them to a Group to manage file access and permissions collectively."}/>:<div className="member-data-table"><div className="member-data-head"><span>{ar?"الاسم":"Name"}</span><span>{ar?"الدور":"Role"}</span><span/></div>{data.groups.map(g=><div className="member-data-row" key={g.id}><span className="flex items-center gap-3"><Icons.users size={17}/>{g.name}</span><span>{roleLabel(g.role,ar)}</span><button className="member-remove-x" onClick={()=>void remove(g.id)}><Icons.x size={15}/></button></div>)}</div>}
  </div>;
}
function AddGroupsModal({data,ar,memberId,onClose,onDone,setToast}:{data:MemberDetails;ar:boolean;memberId:string;onClose:()=>void;onDone:()=>Promise<void>;setToast:(x:{message:string;tone?:"success"|"error"}|null)=>void}) {
  const [groups,setGroups]=useState<GroupOption[]>([]); const [q,setQ]=useState(""); const [saving,setSaving]=useState<string|null>(null);
  useEffect(()=>{void listGroups().then(setGroups).catch(()=>setGroups([]))},[]);
  const assigned=new Set(data.groups.map(g=>g.id)); const available=groups.filter(g=>!assigned.has(g.id)&&g.name.toLowerCase().includes(q.trim().toLowerCase()));
  async function add(groupId:string){setSaving(groupId);try{await addGroupMember(groupId,memberId);setToast({message:ar?"تمت إضافة المجموعة.":"Group added.",tone:"success"});await onDone()}catch{setToast({message:ar?"تعذر إضافة المجموعة.":"Unable to add group.",tone:"error"})}finally{setSaving(null)}}
  return <ModalShell title={ar?"إضافة مجموعات":"Add Groups"} ar={ar} onClose={onClose}>
    <div className="member-modal-search"><Icons.search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={ar?"البحث عن مجموعة":"Search groups"}/></div>
    <div className="team-folder-option-list">{available.length===0?<EmptyPanel icon="users" title={ar?"لا توجد مجموعات متاحة.":"No groups available."} text={ar?"العضو مضاف بالفعل إلى جميع المجموعات المتاحة.":"This member is already assigned to all available groups."}/>:available.map(g=><div className="group-option" key={g.id}><div><b>{g.name}</b><small>{g.description||`${g.memberCount} ${ar?"عضو":"members"}`}</small></div><button className="member-primary-button compact" disabled={saving===g.id} onClick={()=>void add(g.id)}>{saving===g.id?(ar?"جارٍ...":"Adding..."):(ar?"إضافة":"Add")}</button></div>)}</div>
  </ModalShell>;
}
function ModalShell({title,ar,onClose,children}:{title:string;ar:boolean;onClose:()=>void;children:React.ReactNode}){return <div className="member-modal-backdrop" onMouseDown={onClose}><div className="member-modal member-large-modal" dir={ar?"rtl":"ltr"} onMouseDown={e=>e.stopPropagation()}><header><h2>{title}</h2><button type="button" onClick={onClose}>×</button></header><div className="member-modal-body">{children}</div><footer><button type="button" className="member-soft-button" onClick={onClose}>{ar?"إلغاء":"Cancel"}</button></footer></div></div>}
