"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale } from "@/components/locale-provider";
import { Icons } from "@/components/layout/icons";
import { ImkanOptionPicker } from "@/components/imkan-option-picker";
import { listFolderTree, type FolderTreeItem } from "@/lib/api/folders";
import {
  createDlpLabel, createDlpPolicy, deleteDlpLabel, deleteDlpPolicy, detachDlpLabelFile,
  getDlpLabelFiles, getDlpLabels, getDlpPolicies, updateDlpLabel, updateDlpPolicy,
  type DlpLabel, type DlpPolicy,
} from "@/lib/api/enterprise";

const COLORS = ["#E84C3D", "#F5A623", "#F8E71C", "#7ED321", "#4A90E2", "#9013FE", "#50E3C2", "#4A4A4A"];
const REGIONS = [
  { id: "US", en: "United States", ar: "الولايات المتحدة", types: ["CREDIT_CARD", "SSN", "EMAIL"] },
  { id: "EU", en: "European Union", ar: "الاتحاد الأوروبي", types: ["CREDIT_CARD", "IBAN", "EMAIL"] },
  { id: "UK", en: "United Kingdom", ar: "المملكة المتحدة", types: ["CREDIT_CARD", "IBAN", "UK_NINO"] },
  { id: "IN", en: "India", ar: "الهند", types: ["CREDIT_CARD", "AADHAAR", "PAN"] },
  { id: "SA", en: "Saudi Arabia", ar: "السعودية", types: ["CREDIT_CARD", "IBAN", "SA_NATIONAL_ID"] },
  { id: "AE", en: "United Arab Emirates", ar: "الإمارات", types: ["CREDIT_CARD", "IBAN", "UAE_EMIRATES_ID"] },
  { id: "AU", en: "Australia", ar: "أستراليا", types: ["CREDIT_CARD", "AU_TFN", "EMAIL"] },
  { id: "CA", en: "Canada", ar: "كندا", types: ["CREDIT_CARD", "CA_SIN", "EMAIL"] },
  { id: "SG", en: "Singapore", ar: "سنغافورة", types: ["CREDIT_CARD", "IBAN", "EMAIL"] },
];
const SENSITIVE = [
  ["CREDIT_CARD", "Credit card number", "رقم بطاقة ائتمان"],
  ["EMAIL", "Email address", "بريد إلكتروني"],
  ["IBAN", "IBAN", "آيبان"],
  ["SSN", "US Social Security number", "رقم الضمان الاجتماعي الأمريكي"],
  ["AADHAAR", "India Aadhaar", "آدهار الهند"],
  ["PAN", "India PAN", "رقم PAN الهندي"],
  ["UK_NINO", "UK National Insurance number", "رقم التأمين الوطني البريطاني"],
  ["AU_TFN", "Australia TFN", "رقم الملف الضريبي الأسترالي"],
  ["CA_SIN", "Canada SIN", "رقم التأمين الاجتماعي الكندي"],
  ["SA_NATIONAL_ID", "Saudi national ID", "الهوية الوطنية السعودية"],
  ["UAE_EMIRATES_ID", "UAE Emirates ID", "الهوية الإماراتية"],
] as const;
type Rule = { kind: "SENSITIVE" | "KEYWORD" | "EXTENSION"; value: string };
const emptyRule = (): Rule => ({ kind: "SENSITIVE", value: "CREDIT_CARD" });

export default function AdminDlpPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const [tab, setTab] = useState<"policies" | "labels">("policies");
  const [labels, setLabels] = useState<DlpLabel[]>([]);
  const [policies, setPolicies] = useState<DlpPolicy[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
  const [region, setRegion] = useState("SA");
  const [policyOpen, setPolicyOpen] = useState<DlpPolicy | "new" | null>(null);
  const [labelOpen, setLabelOpen] = useState<DlpLabel | "new" | null>(null);
  const [labelForPolicy, setLabelForPolicy] = useState(false);
  const [query, setQuery] = useState("");
  const [freshLabelId, setFreshLabelId] = useState<string | null>(null);
  const [filesLabel, setFilesLabel] = useState<DlpLabel | null>(null);
  const [files, setFiles] = useState<Array<{ id: string; fileId: string; source: string; file: { name: string } | null }>>([]);
  const [menu, setMenu] = useState<string | null>(null);

  const load = () => Promise.all([getDlpLabels(), getDlpPolicies()]).then(([nextLabels, nextPolicies]) => { setLabels(nextLabels); setPolicies(nextPolicies); }).catch((e) => setError(e instanceof Error ? e.message : t("Unable to load Data Loss Prevention", "تعذر تحميل منع فقدان البيانات")));
  useEffect(() => { void load(); }, []);

  async function createRegionPolicy() {
    const selected = REGIONS.find((item) => item.id === region) ?? REGIONS[0];
    setBusy(true); setError("");
    try {
      const regionName = ar ? selected.ar : selected.en;
      const label = await createDlpLabel({ name: `${regionName} Sensitive`, description: t("Created from a region-based DLP policy. External sharing shows a warning.", "أُنشئ من سياسة حسب المنطقة. المشاركة الخارجية تعرض تحذيراً."), color: "#E84C3D", manualOnly: false, actions: ["WARN_EXTERNAL_SHARE"] });
      await createDlpPolicy({ name: `${regionName} DLP Policy`, description: t("Region-based sensitive content identifiers. Existing files are not scanned.", "معرّفات محتوى حساس حسب المنطقة. لا تُفحص الملفات الحالية."), labelId: label.id, sensitiveTypes: selected.types, scopeType: "ALL", enabled: true });
      setRegionOpen(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : t("Unable to create the policy", "تعذر إنشاء السياسة")); }
    finally { setBusy(false); }
  }

  const needle = query.trim().toLowerCase();
  const visiblePolicies = useMemo(() => policies.filter((policy) => `${policy.name} ${policy.description || ""}`.toLowerCase().includes(needle)), [policies, needle]);
  const visibleLabels = useMemo(() => labels.filter((label) => `${label.name} ${label.description || ""}`.toLowerCase().includes(needle)), [labels, needle]);
  const selectedRegion = REGIONS.find((item) => item.id === region) ?? REGIONS[0];

  return (
    <main className="min-h-full bg-white" dir={ar ? "rtl" : "ltr"} onClick={() => setMenu(null)}>
      <header className="flex items-start justify-between gap-4 border-b border-[#ededed] px-7 pb-0 pt-5">
        <div>
          <h1 className="text-[20px] font-semibold text-[#202124]">{t("Data Loss Prevention", "منع فقدان البيانات")}</h1>
          <div className="mt-4 flex gap-6 text-[13px]">
            {(["policies", "labels"] as const).map((key) => (
              <button key={key} type="button" onClick={() => setTab(key)} className={`border-b-2 pb-3 ${tab === key ? "border-[#2c66dd] font-semibold text-[#2c66dd]" : "border-transparent text-[#5f6368]"}`}>{key === "policies" ? t("Policies", "السياسات") : t("Classification Labels", "تصنيفات البيانات")}</button>
            ))}
          </div>
        </div>
        <button type="button" className="mt-1 rounded-full bg-[#2c66dd] px-4 py-2 text-[12px] font-semibold text-white" onClick={() => tab === "policies" ? setChooser(true) : setLabelOpen("new")}>+ {tab === "policies" ? t("New Policy", "سياسة جديدة") : t("New Classification Label", "تصنيف جديد")}</button>
      </header>
      {error && <div className="mx-7 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}
      {(tab === "policies" ? policies.length : labels.length) > 0 && <div className="px-7 pt-4"><div className="flex h-10 max-w-sm items-center gap-2 rounded-lg border border-[#dadce0] px-3"><Icons.search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 text-[13px] outline-none" placeholder={tab === "policies" ? t("Search policies", "البحث في السياسات") : t("Search labels", "البحث في التصنيفات")} /></div></div>}
      {tab === "policies" ? (
        policies.length === 0 ? <Empty title={t("No policies created yet", "لم تُنشأ سياسات بعد")} body={t("Create a policy to automatically classify files that contain sensitive information. New policies scan only new or modified files.", "أنشئ سياسة لتصنيف الملفات التي تحتوي على معلومات حساسة تلقائياً. السياسات الجديدة تفحص الملفات الجديدة أو المعدّلة فقط.")} action={t("Create a new policy", "إنشاء سياسة جديدة")} onClick={() => setChooser(true)} /> : (
          <div className="px-7 py-4">
            <table className="w-full text-[13px]">
              <thead className="text-start text-[11px] uppercase tracking-wide text-[#80868b]"><tr>{[t("Policy name", "اسم السياسة"), t("Classification label", "التصنيف"), t("Rules", "القواعد"), t("Status", "الحالة"), ""].map((heading) => <th key={heading} className="border-b border-[#ededed] px-2 py-2 text-start font-medium">{heading}</th>)}</tr></thead>
              <tbody>{visiblePolicies.map((policy) => (
                <tr key={policy.id} className="border-b border-[#f3f3f3] hover:bg-[#f8f9fb]">
                  <td className="px-2 py-3"><div className="font-medium">{policy.name}</div>{policy.description ? <div className="mt-0.5 max-w-[280px] truncate text-[11px] text-[#80868b]">{policy.description}</div> : null}</td>
                  <td className="px-2 py-3"><LabelChip label={policy.label} /></td>
                  <td className="px-2 py-3 text-[#5f6368]">{(policy.keywords?.length ?? 0) + (policy.extensions?.length ?? 0) + (policy.sensitiveTypes?.length ?? 0)}</td>
                  <td className="px-2 py-3"><button type="button" role="switch" aria-checked={policy.enabled} aria-label={policy.enabled ? t("Disable", "تعطيل") : t("Enable", "تفعيل")} className={`relative h-5 w-9 rounded-full ${policy.enabled ? "bg-[#2c66dd]" : "bg-[#dadce0]"}`} onClick={(event) => { event.stopPropagation(); void updateDlpPolicy(policy.id, { enabled: !policy.enabled }).then(load).catch((e) => setError(e instanceof Error ? e.message : t("Unable to update the policy", "تعذر تحديث السياسة"))); }}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white ${policy.enabled ? "end-0.5" : "start-0.5"}`} /></button></td>
                  <td className="relative px-2 py-3 text-end"><MenuButton open={menu === policy.id} onOpen={() => setMenu(policy.id)} items={[
                    [t("Edit", "تعديل"), () => setPolicyOpen(policy)],
                    [t("Delete", "حذف"), () => { if (confirm(t("Delete this DLP policy?", "حذف سياسة منع فقدان البيانات؟"))) void deleteDlpPolicy(policy.id).then(load); }],
                  ]} /></td>
                </tr>
              ))}</tbody>
            </table>
            {visiblePolicies.length === 0 && <p className="py-8 text-center text-[13px] text-[#80868b]">{t("No policies match your search.", "لا توجد سياسات مطابقة للبحث.")}</p>}
          </div>
        )
      ) : labels.length === 0 ? <Empty title={t("No classification labels yet", "لا توجد تصنيفات بعد")} body={t("Labels identify sensitive files and can block sharing, download, copy, and print, or warn before an external share.", "تحدد التصنيفات الملفات الحساسة ويمكنها منع المشاركة والتنزيل والنسخ والطباعة، أو التحذير قبل المشاركة الخارجية.")} action={t("New Classification Label", "تصنيف جديد")} onClick={() => setLabelOpen("new")} /> : (
        <div className="px-7 py-4">
          <table className="w-full text-[13px]">
            <thead className="text-[11px] uppercase tracking-wide text-[#80868b]"><tr>{[t("Label", "التصنيف"), t("Description", "الوصف"), t("Type", "النوع"), t("Restrictions", "القيود"), t("Files", "الملفات"), ""].map((heading) => <th key={heading} className="border-b border-[#ededed] px-2 py-2 text-start font-medium">{heading}</th>)}</tr></thead>
            <tbody>{visibleLabels.map((label) => (
              <tr key={label.id} className="border-b border-[#f3f3f3] hover:bg-[#f8f9fb]">
                <td className="px-2 py-3"><LabelChip label={label} /></td>
                <td className="max-w-[240px] truncate px-2 py-3 text-[#5f6368]">{label.description || "—"}</td>
                <td className="px-2 py-3">{label.manualOnly ? t("Manual", "يدوي") : t("Automatic", "تلقائي")}</td>
                <td className="px-2 py-3 text-[#5f6368]">{restrictionText(label.actions, t)}</td>
                <td className="px-2 py-3">{label._count?.files ?? 0}</td>
                <td className="relative px-2 py-3 text-end"><MenuButton open={menu === label.id} onOpen={() => setMenu(label.id)} items={[
                  [t("View associated files", "عرض الملفات المرتبطة"), () => { setFilesLabel(label); void getDlpLabelFiles(label.id).then(setFiles).catch((e) => setError(e instanceof Error ? e.message : "Unable to load files")); }],
                  [t("Edit", "تعديل"), () => setLabelOpen(label)],
                  [t("Delete", "حذف"), () => { if (confirm(t("Delete this classification label?", "حذف هذا التصنيف؟"))) void deleteDlpLabel(label.id).then(load).catch((e) => setError(e instanceof Error ? e.message : "Unable to delete")); }],
                ]} /></td>
              </tr>
            ))}</tbody>
          </table>
          {visibleLabels.length === 0 && <p className="py-8 text-center text-[13px] text-[#80868b]">{t("No labels match your search.", "لا توجد تصنيفات مطابقة للبحث.")}</p>}
        </div>
      )}

      {chooser && <Modal title={t("Create a new policy", "إنشاء سياسة جديدة")} onClose={() => setChooser(false)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Choice title={t("Region-based policy", "سياسة حسب المنطقة")} body={t("Use preconfigured sensitive information types for a region. External sharing is set to warning mode.", "استخدم أنواع المعلومات الحساسة الجاهزة لمنطقة. المشاركة الخارجية تكون في وضع التحذير.")} onClick={() => { setChooser(false); setRegionOpen(true); }} />
          <Choice title={t("Build a custom policy", "إنشاء سياسة مخصصة")} body={t("Define keywords, file extensions, and sensitive content identifiers. Up to 10 rules.", "حدد كلمات وأنواع ملفات ومعرّفات محتوى حساس. حتى 10 قواعد.")} onClick={() => { setChooser(false); setPolicyOpen("new"); }} />
        </div>
      </Modal>}

      {regionOpen && <Modal title={t("Region-based policy", "سياسة حسب المنطقة")} onClose={() => setRegionOpen(false)}>
        <label className="block text-[12px] font-medium">{t("Select your region", "اختر المنطقة")}<div className="mt-1"><ImkanOptionPicker fullWidth value={region} onChange={setRegion} ariaLabel={t("Select your region", "اختر المنطقة")} options={REGIONS.map((item) => ({ value: item.id, label: ar ? item.ar : item.en }))} /></div></label>
        <div className="mt-3 flex flex-wrap gap-2">{selectedRegion.types.map((id) => { const row = SENSITIVE.find((item) => item[0] === id); return <span key={id} className="rounded-full bg-[#eef3ff] px-3 py-1 text-[12px] text-[#2c66dd]">{row ? (ar ? row[2] : row[1]) : id}</span>; })}</div>
        <p className="mt-3 text-[12px] leading-5 text-[#5f6368]">{t("These identifiers are preselected. External sharing warns users. Files already stored are not scanned.", "هذه المعرّفات محددة مسبقاً. المشاركة الخارجية تعرض تحذيراً. الملفات المخزنة حالياً لا تُفحص.")}</p>
        <Footer busy={busy} cancel={t("Cancel", "إلغاء")} label={t("Create", "إنشاء")} onCancel={() => setRegionOpen(false)} onSave={() => void createRegionPolicy()} />
      </Modal>}

      {policyOpen && <PolicyDialog ar={ar} t={t} labels={labels.filter((label) => !label.manualOnly)} initial={policyOpen === "new" ? null : policyOpen} freshLabelId={freshLabelId} busy={busy} onClose={() => setPolicyOpen(null)} onCreateLabel={() => { setLabelForPolicy(true); setLabelOpen("new"); }} onSave={async (body) => { setBusy(true); setError(""); try { if (policyOpen === "new") await createDlpPolicy(body); else await updateDlpPolicy(policyOpen.id, body); setPolicyOpen(null); await load(); } catch (e) { setError(e instanceof Error ? e.message : t("Unable to save the policy", "تعذر حفظ السياسة")); } finally { setBusy(false); } }} />}

      {labelOpen && <LabelDialog t={t} initial={labelOpen === "new" ? null : labelOpen} busy={busy} onClose={() => { setLabelOpen(null); setLabelForPolicy(false); }} onSave={async (body) => { setBusy(true); setError(""); try { const creating = labelOpen === "new"; const saved = creating ? await createDlpLabel(body) : await updateDlpLabel(labelOpen.id, body); setLabelOpen(null); if (labelForPolicy && creating) setFreshLabelId(saved.id); setLabelForPolicy(false); await load(); } catch (e) { setError(e instanceof Error ? e.message : t("Unable to save the label", "تعذر حفظ التصنيف")); } finally { setBusy(false); } }} />}

      {filesLabel && <Modal title={`${t("Associated files", "الملفات المرتبطة")} · ${filesLabel.name}`} onClose={() => setFilesLabel(null)}>
        {files.length === 0 ? <p className="text-[13px] text-[#5f6368]">{t("No files are associated with this label.", "لا توجد ملفات مرتبطة بهذا التصنيف.")}</p> : <ul className="max-h-80 space-y-2 overflow-auto">{files.map((row) => <li key={row.id} className="flex items-center justify-between rounded-lg border border-[#ededed] px-3 py-2 text-[13px]"><span>{row.file?.name || row.fileId}<span className="ms-2 text-[11px] text-[#80868b]">{row.source === "AUTOMATIC" ? t("Automatic", "تلقائي") : t("Manual", "يدوي")}</span></span><button type="button" className="text-[12px] text-[#2c66dd]" onClick={() => void detachDlpLabelFile(filesLabel.id, row.fileId).then(() => getDlpLabelFiles(filesLabel.id).then(setFiles)).then(load)}>{t("Remove classification", "إزالة التصنيف")}</button></li>)}</ul>}
      </Modal>}
    </main>
  );
}

function restrictionText(actions: string[] | undefined, t: (en: string, ar: string) => string) {
  const list = actions ?? [];
  const parts = [];
  if (list.includes("BLOCK_EXTERNAL_SHARE")) parts.push(t("Block external sharing", "منع المشاركة الخارجية"));
  if (list.some((item) => ["BLOCK_DOWNLOAD", "BLOCK_COPY", "BLOCK_PRINT"].includes(item))) parts.push(t("Block download, copy, and print", "منع التنزيل والنسخ والطباعة"));
  if (list.includes("WARN_EXTERNAL_SHARE")) parts.push(t("Warn before external sharing", "تحذير قبل المشاركة الخارجية"));
  return parts.join(" · ") || "—";
}

function LabelChip({ label }: { label?: { name: string; color?: string | null } | null }) {
  if (!label) return <span>—</span>;
  return <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: label.color || "#4A90E2" }} />{label.name}</span>;
}

function Empty({ title, body, action, onClick }: { title: string; body: string; action: string; onClick: () => void }) {
  return <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center"><div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-[#eef3ff] text-[#2c66dd]"><Icons.shield size={28} /></div><h2 className="text-[18px] font-semibold">{title}</h2><p className="mt-2 max-w-md text-[13px] leading-6 text-[#5f6368]">{body}</p><button type="button" className="mt-5 rounded-full bg-[#2c66dd] px-5 py-2 text-[13px] font-semibold text-white" onClick={onClick}>{action}</button></div>;
}

function Choice({ title, body, onClick }: { title: string; body: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-xl border border-[#e3e5e8] p-4 text-start hover:border-[#2c66dd] hover:bg-[#f7faff]"><div className="text-[14px] font-semibold">{title}</div><p className="mt-2 text-[12px] leading-5 text-[#5f6368]">{body}</p></button>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="max-h-[90vh] w-[min(680px,96vw)] overflow-auto rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true"><header className="mb-4 flex items-center justify-between"><h2 className="text-[18px] font-semibold">{title}</h2><button type="button" onClick={onClose} className="text-xl text-[#5f6368]">×</button></header>{children}</section></div>;
}

function Footer({ busy, label, cancel, onCancel, onSave }: { busy: boolean; label: string; cancel: string; onCancel: () => void; onSave: () => void }) {
  return <div className="mt-5 flex justify-end gap-2"><button type="button" className="rounded-full px-4 py-2 text-[12px] text-[#5f6368]" onClick={onCancel}>{cancel}</button><button type="button" disabled={busy} className="rounded-full bg-[#2c66dd] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50" onClick={onSave}>{label}</button></div>;
}

function PolicyDialog({ ar, t, labels, initial, freshLabelId, busy, onClose, onSave, onCreateLabel }: { ar: boolean; t: (en: string, ar: string) => string; labels: DlpLabel[]; initial: DlpPolicy | null; freshLabelId: string | null; busy: boolean; onClose: () => void; onCreateLabel: () => void; onSave: (body: Record<string, unknown>) => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [labelId, setLabelId] = useState(initial?.labelId ?? labels[0]?.id ?? "");
  const [scopeType, setScopeType] = useState(initial?.scopeType ?? "ALL");
  const [folderIds, setFolderIds] = useState<string[]>(initial?.folderIds ?? []);
  const [caseSensitive, setCaseSensitive] = useState(initial?.caseSensitive ?? false);
  const [folders, setFolders] = useState<FolderTreeItem[]>([]);
  const [rules, setRules] = useState<Rule[]>(() => {
    if (!initial) return [emptyRule()];
    const next: Rule[] = [
      ...(initial.sensitiveTypes ?? []).map((value) => ({ kind: "SENSITIVE" as const, value })),
      ...(initial.keywords ?? []).map((value) => ({ kind: "KEYWORD" as const, value })),
      ...(initial.extensions ?? []).map((value) => ({ kind: "EXTENSION" as const, value })),
    ];
    return next.length ? next : [emptyRule()];
  });
  useEffect(() => { if (freshLabelId) setLabelId(freshLabelId); }, [freshLabelId]);
  useEffect(() => { if (!labelId && labels[0]) setLabelId(labels[0].id); }, [labels, labelId]);
  useEffect(() => { void listFolderTree().then(setFolders).catch(() => setFolders([])); }, []);
  return <Modal title={initial ? t("Edit policy", "تعديل السياسة") : t("Create Policy", "إنشاء سياسة")} onClose={onClose}>
    <div className="space-y-3">
      <label className="block text-[12px] font-medium">{t("Policy name", "اسم السياسة")}<input className="mt-1 w-full rounded-lg border border-[#dadce0] px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="block text-[12px] font-medium">{t("Description", "الوصف")}<textarea className="mt-1 w-full rounded-lg border border-[#dadce0] px-3 py-2" value={description ?? ""} onChange={(event) => setDescription(event.target.value)} /></label>
      <div>
        <div className="mb-2 flex items-center justify-between text-[12px] font-medium"><span>{t("Policy rules", "قواعد السياسة")} ({rules.length}/10)</span><button type="button" disabled={rules.length >= 10} className="text-[#2c66dd] disabled:opacity-40" onClick={() => setRules([...rules, emptyRule()])}>+ {t("Add rule", "إضافة قاعدة")}</button></div>
        <div className="space-y-2">{rules.map((rule, index) => <div key={index} className="flex gap-2"><ImkanOptionPicker value={rule.kind} onChange={(value) => setRules(rules.map((item, i) => i === index ? { kind: (value || "KEYWORD") as Rule["kind"], value: value === "SENSITIVE" ? "CREDIT_CARD" : "" } : item))} ariaLabel={t("Rule type", "نوع القاعدة")} options={[{ value: "SENSITIVE", label: t("Sensitive content identifier", "معرّف محتوى حساس") }, { value: "KEYWORD", label: t("Keyword", "كلمة مفتاحية") }, { value: "EXTENSION", label: t("File extension", "امتداد الملف") }]} />{rule.kind === "SENSITIVE" ? <ImkanOptionPicker fullWidth value={rule.value} onChange={(value) => setRules(rules.map((item, i) => i === index ? { ...item, value } : item))} ariaLabel={t("Sensitive content identifier", "معرّف محتوى حساس")} options={SENSITIVE.map(([id, en, arabic]) => ({ value: id, label: ar ? arabic : en }))} /> : <input className="min-w-0 flex-1 rounded-lg border border-[#dadce0] px-2 py-2 text-[12px]" value={rule.value} placeholder={rule.kind === "KEYWORD" ? t("Keyword", "كلمة") : "pdf"} onChange={(event) => setRules(rules.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} />}<button type="button" className="px-2 text-[#80868b]" onClick={() => setRules(rules.filter((_, i) => i !== index))}>×</button></div>)}</div>
      </div>
      <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} />{t("Match keywords with case sensitivity", "مطابقة الكلمات مع حساسية الأحرف")}</label>
      <label className="block text-[12px] font-medium">{t("Classification label", "تصنيف البيانات")}<div className="mt-1 flex gap-2"><ImkanOptionPicker fullWidth allowEmpty emptyLabel={t("Select a label", "اختر تصنيفاً")} value={labelId} onChange={setLabelId} ariaLabel={t("Classification label", "تصنيف البيانات")} options={labels.map((label) => ({ value: label.id, label: label.name }))} /><button type="button" className="shrink-0 text-[12px] text-[#2c66dd]" onClick={onCreateLabel}>+ {t("Create Classification Label", "إنشاء تصنيف")}</button></div></label>
      <fieldset className="text-[12px]"><legend className="mb-2 font-medium">{t("Apply this policy to", "تطبيق السياسة على")}</legend><div className="space-y-2">{[["ALL", t("All folders", "كل المجلدات")], ["SELECTED_FOLDERS", t("Selected folders", "مجلدات محددة")], ["EXCLUDED_FOLDERS", t("All folders except selected", "كل المجلدات ما عدا المحددة")]].map(([value, caption]) => <label key={value} className="flex gap-2"><input type="radio" checked={scopeType === value} onChange={() => setScopeType(value)} />{caption}</label>)}</div>{scopeType !== "ALL" && <div className="mt-2 max-h-36 space-y-1 overflow-auto rounded-lg border border-[#ededed] p-2">{folders.length === 0 ? <p className="text-[#80868b]">{t("No folders available.", "لا توجد مجلدات.")}</p> : folders.map((folder) => <label key={folder.id} className="flex gap-2"><input type="checkbox" checked={folderIds.includes(folder.id)} onChange={(event) => setFolderIds(event.target.checked ? [...folderIds, folder.id] : folderIds.filter((id) => id !== folder.id))} />{folder.name}</label>)}</div>}</fieldset>
      <p className="text-[11px] leading-5 text-[#80868b]">{t("Only automatic labels can be used. A new policy classifies files uploaded or modified after it is created. A file matches when any rule matches.", "يمكن استخدام التصنيفات التلقائية فقط. السياسة الجديدة تصنّف الملفات المرفوعة أو المعدّلة بعدها. يطابق الملف عند تحقق أي قاعدة.")}</p>
    </div>
    <Footer busy={busy || !name.trim() || !labelId || rules.length === 0 || (scopeType !== "ALL" && folderIds.length === 0)} cancel={t("Cancel", "إلغاء")} label={initial ? t("Save", "حفظ") : t("Create Policy", "إنشاء السياسة")} onCancel={onClose} onSave={() => onSave({ name: name.trim(), description, labelId, scopeType, folderIds: scopeType === "ALL" ? [] : folderIds, caseSensitive, sensitiveTypes: rules.filter((rule) => rule.kind === "SENSITIVE").map((rule) => rule.value), keywords: rules.filter((rule) => rule.kind === "KEYWORD" && rule.value.trim()).map((rule) => rule.value.trim()), extensions: rules.filter((rule) => rule.kind === "EXTENSION" && rule.value.trim()).map((rule) => rule.value.trim()) })} />
  </Modal>;
}

function LabelDialog({ t, initial, busy, onClose, onSave }: { t: (en: string, ar: string) => string; initial: DlpLabel | null; busy: boolean; onClose: () => void; onSave: (body: Record<string, unknown>) => void }) {
  const actions = initial?.actions ?? [];
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [color, setColor] = useState(initial?.color || COLORS[0]);
  const [manualOnly, setManualOnly] = useState(initial?.manualOnly ?? false);
  const [blockShare, setBlockShare] = useState(actions.includes("BLOCK_EXTERNAL_SHARE"));
  const [blockFile, setBlockFile] = useState(actions.some((item) => ["BLOCK_DOWNLOAD", "BLOCK_COPY", "BLOCK_PRINT"].includes(item)));
  const [warn, setWarn] = useState(actions.includes("WARN_EXTERNAL_SHARE"));
  return <Modal title={initial ? t("Edit Classification Label", "تعديل التصنيف") : t("Create Classification Label", "إنشاء تصنيف")} onClose={onClose}>
    <div className="space-y-3 text-[12px]">
      <label className="block font-medium">{t("Name", "الاسم")}<input className="mt-1 w-full rounded-lg border border-[#dadce0] px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="block font-medium">{t("Description", "الوصف")}<textarea className="mt-1 w-full rounded-lg border border-[#dadce0] px-3 py-2" value={description ?? ""} onChange={(event) => setDescription(event.target.value)} /></label>
      <div><div className="mb-2 font-medium">{t("Badge color", "لون الشارة")}</div><div className="flex gap-2">{COLORS.map((item) => <button key={item} type="button" aria-label={item} className={`h-7 w-7 rounded-full ${color === item ? "ring-2 ring-offset-2 ring-[#2c66dd]" : ""}`} style={{ background: item }} onClick={() => setColor(item)} />)}</div></div>
      <div className="space-y-2"><label className="flex gap-2"><input type="radio" checked={!manualOnly} onChange={() => setManualOnly(false)} />{t("For automatic classification via a DLP policy", "للتصنيف التلقائي عبر سياسة منع فقدان البيانات")}</label><label className="flex gap-2"><input type="radio" checked={manualOnly} onChange={() => setManualOnly(true)} />{t("For manual classification only", "للتصنيف اليدوي فقط")}</label></div>
      <div className="space-y-2">
        <label className="flex gap-2"><input type="checkbox" checked={blockShare} onChange={(event) => setBlockShare(event.target.checked)} />{t("Block external sharing options for files", "منع خيارات المشاركة الخارجية للملفات")}</label>
        <label className="flex gap-2"><input type="checkbox" checked={blockFile} onChange={(event) => setBlockFile(event.target.checked)} />{t("Block download, copy, and print actions for files", "منع التنزيل والنسخ والطباعة للملفات")}</label>
        <label className="flex gap-2"><input type="checkbox" checked={warn} onChange={(event) => setWarn(event.target.checked)} />{t("Display a warning before users share externally", "عرض تحذير قبل المشاركة الخارجية")}</label>
      </div>
    </div>
    <Footer busy={busy || !name.trim()} cancel={t("Cancel", "إلغاء")} label={initial ? t("Save", "حفظ") : t("Create", "إنشاء")} onCancel={onClose} onSave={() => onSave({ name: name.trim(), description, color, manualOnly, actions: [...(blockShare ? ["BLOCK_EXTERNAL_SHARE"] : []), ...(blockFile ? ["BLOCK_DOWNLOAD", "BLOCK_COPY", "BLOCK_PRINT"] : []), ...(warn ? ["WARN_EXTERNAL_SHARE"] : [])] })} />
  </Modal>;
}

function MenuButton({ open, onOpen, items }: { open: boolean; onOpen: () => void; items: Array<[string, () => void]> }) {
  return <div className="inline-block" onClick={(event) => event.stopPropagation()}><button type="button" aria-label="More actions" className="rounded-full px-2 py-1 text-[#5f6368] hover:bg-[#f1f3f4]" onClick={onOpen}>⋯</button>{open && <div className="absolute end-6 z-20 w-52 rounded-xl border border-[#e3e5e8] bg-white p-1 text-start shadow-lg">{items.map(([label, action]) => <button key={label} type="button" className="block w-full rounded-lg px-3 py-2 text-[12px] hover:bg-[#f7faff]" onClick={action}>{label}</button>)}</div>}</div>;
}
