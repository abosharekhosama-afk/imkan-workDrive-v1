"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { listFolderTree, type FolderTreeItem } from "@/lib/api/folders";
import {
  createIntegrationKey,
  listIntegrationKeys,
  revokeIntegrationKey,
  type IntegrationKey,
  type IntegrationKeyScope,
} from "@/lib/api/integration-keys";

function text(ar: boolean, en: string, arText: string) {
  return ar ? arText : en;
}

function formatWhen(value: string | null, ar: boolean, never: string) {
  if (!value) return never;
  try {
    return new Date(value).toLocaleString(ar ? "ar" : "en", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return value;
  }
}

const PERMISSIONS: Array<{ scope: IntegrationKeyScope; en: string; ar: string; hintEn: string; hintAr: string }> = [
  { scope: "folders:read", en: "Browse folders", ar: "تصفح المجلدات", hintEn: "See folders and their contents", hintAr: "عرض المجلدات ومحتوياتها" },
  { scope: "folders:write", en: "Create and remove folders", ar: "إنشاء المجلدات وحذفها", hintEn: "Organize content into folders", hintAr: "تنظيم المحتوى داخل مجلدات" },
  { scope: "files:read", en: "View and download files", ar: "عرض الملفات وتنزيلها", hintEn: "Open, preview and download files", hintAr: "فتح الملفات ومعاينتها وتنزيلها" },
  { scope: "files:write", en: "Upload and delete files", ar: "رفع الملفات وحذفها", hintEn: "Add new files and move them to trash", hintAr: "إضافة ملفات جديدة ونقلها إلى سلة المهملات" },
];

const EXPIRY_OPTIONS: Array<{ days: number | null; en: string; ar: string }> = [
  { days: null, en: "Never expires", ar: "بدون انتهاء" },
  { days: 30, en: "30 days", ar: "30 يوماً" },
  { days: 90, en: "90 days", ar: "90 يوماً" },
  { days: 365, en: "1 year", ar: "سنة واحدة" },
];

function folderPaths(tree: FolderTreeItem[]) {
  const byId = new Map(tree.map((f) => [f.id, f]));
  const pathOf = (f: FolderTreeItem) => {
    const parts: string[] = [];
    let cur: FolderTreeItem | undefined = f;
    let guard = 0;
    while (cur && guard++ < 64) {
      parts.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts.join(" / ");
  };
  return tree.map((f) => ({ id: f.id, path: pathOf(f) })).sort((a, b) => a.path.localeCompare(b.path));
}

export default function AdminIntegrationKeysPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [keys, setKeys] = useState<IntegrationKey[] | null>(null);
  const [folders, setFolders] = useState<Array<{ id: string; path: string }>>([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<IntegrationKeyScope[]>(["folders:read", "folders:write", "files:read", "files:write"]);
  const [rootFolderId, setRootFolderId] = useState("");
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ name: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<IntegrationKey | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError("");
    void listIntegrationKeys()
      .then(setKeys)
      .catch(() => setError(text(ar, "Unable to load access keys.", "تعذر تحميل مفاتيح الوصول.")));
  }, [ar]);

  useEffect(() => {
    load();
    void listFolderTree().then((tree) => setFolders(folderPaths(tree))).catch(() => setFolders([]));
  }, [load]);

  const activeCount = useMemo(() => (keys ?? []).filter((k) => k.status === "active").length, [keys]);

  const resetForm = () => {
    setName("");
    setScopes(["folders:read", "folders:write", "files:read", "files:write"]);
    setRootFolderId("");
    setExpiryDays(null);
  };

  const toggleScope = (scope: IntegrationKeyScope) =>
    setScopes((cur) => (cur.includes(scope) ? cur.filter((s) => s !== scope) : [...cur, scope]));

  const submit = async () => {
    if (!name.trim()) {
      setError(text(ar, "Enter a name for the key.", "أدخل اسماً للمفتاح."));
      return;
    }
    if (scopes.length === 0) {
      setError(text(ar, "Choose at least one permission.", "اختر صلاحية واحدة على الأقل."));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const expiresAt = expiryDays ? new Date(Date.now() + expiryDays * 86_400_000).toISOString() : null;
      const result = await createIntegrationKey({ name: name.trim(), scopes, rootFolderId: rootFolderId || null, expiresAt });
      setCreated({ name: result.key.name, secret: result.secret });
      setCopied(false);
      setShowForm(false);
      resetForm();
      load();
    } catch {
      setError(text(ar, "Unable to create the access key.", "تعذر إنشاء مفتاح الوصول."));
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (key: IntegrationKey) => {
    setBusyId(key.id);
    setError("");
    try {
      await revokeIntegrationKey(key.id);
      setConfirmRevoke(null);
      load();
    } catch {
      setError(text(ar, "Unable to revoke the access key.", "تعذر إلغاء مفتاح الوصول."));
    } finally {
      setBusyId(null);
    }
  };

  const copySecret = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const statusBadge = (status: IntegrationKey["status"]) => {
    const map = {
      active: { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", en: "Active", ar: "نشط" },
      revoked: { cls: "bg-red-50 text-red-700 ring-red-200", en: "Revoked", ar: "ملغى" },
      expired: { cls: "bg-amber-50 text-amber-700 ring-amber-200", en: "Expired", ar: "منتهي" },
    }[status];
    return <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ${map.cls}`}>{text(ar, map.en, map.ar)}</span>;
  };

  const permissionLabel = (scope: IntegrationKeyScope) => {
    const p = PERMISSIONS.find((x) => x.scope === scope);
    return p ? text(ar, p.en, p.ar) : scope;
  };

  return (
    <main className="admin-integration-keys-page h-full overflow-y-auto bg-[#f4f6f9] p-5 sm:p-7 lg:p-8" dir={ar ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-[1180px]">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{text(ar, "Security", "الأمان")}</p>
            <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-slate-900">{text(ar, "App Access Keys", "مفاتيح وصول التطبيقات")}</h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-slate-500">
              {text(
                ar,
                "Allow trusted apps, such as OMA, to store and read files in this workspace. Each key can be limited to one folder and to the permissions you choose.",
                "اسمح للتطبيقات الموثوقة مثل OMA بحفظ الملفات وقراءتها في مساحة العمل هذه. يمكن حصر كل مفتاح في مجلد واحد وفي الصلاحيات التي تختارها.",
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={load} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
              {text(ar, "Refresh", "تحديث")}
            </button>
            <button
              type="button"
              data-testid="new-access-key"
              onClick={() => { setShowForm(true); setError(""); }}
              className="rounded-xl bg-[#2f61b7] px-4 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#254f97]"
            >
              {text(ar, "New access key", "مفتاح وصول جديد")}
            </button>
          </div>
        </header>

        {error ? <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-[12px] text-red-700">{error}</div> : null}

        {created ? (
          <section className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]" data-testid="new-key-secret">
            <h2 className="text-[15px] font-semibold text-emerald-900">{text(ar, `“${created.name}” is ready`, `المفتاح «${created.name}» جاهز`)}</h2>
            <p className="mt-1 text-[12px] leading-5 text-emerald-800">
              {text(ar, "Copy this key now and paste it into the app you are connecting. For your security it will not be shown again.", "انسخ هذا المفتاح الآن والصقه في التطبيق الذي تربطه. حفاظاً على أمانك لن يظهر مرة أخرى.")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code dir="ltr" className="min-w-0 flex-1 break-all rounded-xl border border-emerald-200 bg-white px-3 py-2 font-mono text-[12px] text-slate-800">{created.secret}</code>
              <button type="button" onClick={() => void copySecret()} className="rounded-xl bg-emerald-600 px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-emerald-700">
                {copied ? text(ar, "Copied", "تم النسخ") : text(ar, "Copy key", "نسخ المفتاح")}
              </button>
              <button type="button" onClick={() => setCreated(null)} className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-[12px] font-semibold text-emerald-800 transition hover:bg-emerald-50">
                {text(ar, "Done", "تم")}
              </button>
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { label: text(ar, "Active keys", "المفاتيح النشطة"), value: keys ? activeCount : "—", hint: text(ar, "Keys that apps can use right now", "مفاتيح يمكن للتطبيقات استخدامها الآن"), accent: "from-[#e8f1ff] to-white", ring: "ring-[#c5d8f8]" },
            { label: text(ar, "Total keys", "إجمالي المفاتيح"), value: keys ? keys.length : "—", hint: text(ar, "Including revoked and expired keys", "بما فيها المفاتيح الملغاة والمنتهية"), accent: "from-[#e9f8ef] to-white", ring: "ring-[#bde5cb]" },
            { label: text(ar, "Last activity", "آخر نشاط"), value: keys && keys.some((k) => k.lastUsedAt) ? formatWhen([...keys].map((k) => k.lastUsedAt).filter(Boolean).sort().reverse()[0] ?? null, ar, "—") : "—", hint: text(ar, "Most recent use by any app", "آخر استخدام من أي تطبيق"), accent: "from-[#fff1e8] to-white", ring: "ring-[#f5d2b8]" },
          ].map((stat) => (
            <article key={stat.label} className={`rounded-2xl border border-white/80 bg-gradient-to-br ${stat.accent} p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] ring-1 ${stat.ring}`}>
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{stat.label}</div>
              <div className="mt-3 text-[22px] font-semibold leading-tight tracking-tight text-slate-900">{stat.value}</div>
              <p className="mt-3 text-[11px] leading-5 text-slate-500">{stat.hint}</p>
            </article>
          ))}
        </section>

        {showForm ? (
          <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]" data-testid="new-key-form">
            <h2 className="text-[15px] font-semibold text-slate-900">{text(ar, "Create an access key", "إنشاء مفتاح وصول")}</h2>
            <div className="mt-4 grid gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                <label className="block">
                  <span className="text-[12px] font-semibold text-slate-700">{text(ar, "Key name", "اسم المفتاح")}</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={text(ar, "For example: OMA marketing", "مثال: تسويق OMA")} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none transition focus:border-[#2f61b7] focus:ring-2 focus:ring-[#2f61b7]/15" />
                </label>
                <label className="block">
                  <span className="text-[12px] font-semibold text-slate-700">{text(ar, "Folder access", "نطاق المجلدات")}</span>
                  <select value={rootFolderId} onChange={(e) => setRootFolderId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-[#2f61b7]">
                    <option value="">{text(ar, "Entire workspace", "مساحة العمل بالكامل")}</option>
                    {folders.map((f) => <option key={f.id} value={f.id}>{f.path}</option>)}
                  </select>
                  <span className="mt-1 block text-[11px] text-slate-500">{text(ar, "The app can only see this folder and everything inside it.", "لن يرى التطبيق إلا هذا المجلد وكل ما بداخله.")}</span>
                </label>
                <label className="block">
                  <span className="text-[12px] font-semibold text-slate-700">{text(ar, "Expiry", "مدة الصلاحية")}</span>
                  <select value={expiryDays ?? ""} onChange={(e) => setExpiryDays(e.target.value ? Number(e.target.value) : null)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-[#2f61b7]">
                    {EXPIRY_OPTIONS.map((o) => <option key={o.en} value={o.days ?? ""}>{text(ar, o.en, o.ar)}</option>)}
                  </select>
                </label>
              </div>
              <fieldset>
                <legend className="text-[12px] font-semibold text-slate-700">{text(ar, "Permissions", "الصلاحيات")}</legend>
                <div className="mt-1.5 space-y-2">
                  {PERMISSIONS.map((p) => (
                    <label key={p.scope} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3 py-2.5 transition hover:bg-slate-50">
                      <input type="checkbox" checked={scopes.includes(p.scope)} onChange={() => toggleScope(p.scope)} className="mt-0.5 h-4 w-4 accent-[#2f61b7]" />
                      <span>
                        <span className="block text-[13px] font-medium text-slate-800">{text(ar, p.en, p.ar)}</span>
                        <span className="block text-[11px] text-slate-500">{text(ar, p.hintEn, p.hintAr)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50">{text(ar, "Cancel", "إلغاء")}</button>
              <button type="button" disabled={saving} onClick={() => void submit()} className="rounded-xl bg-[#2f61b7] px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-[#254f97] disabled:opacity-50">
                {saving ? text(ar, "Creating…", "جارٍ الإنشاء…") : text(ar, "Create key", "إنشاء المفتاح")}
              </button>
            </div>
          </section>
        ) : null}

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900">{text(ar, "Access keys", "مفاتيح الوصول")}</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">{text(ar, "Revoke a key at any time to disconnect the app that uses it.", "يمكنك إلغاء أي مفتاح في أي وقت لفصل التطبيق الذي يستخدمه.")}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold text-slate-600">{keys?.length ?? 0} {text(ar, "keys", "مفاتيح")}</span>
          </div>

          {!keys ? (
            <div className="px-5 py-16 text-center text-[13px] text-slate-400">{text(ar, "Loading access keys…", "جارٍ تحميل مفاتيح الوصول…")}</div>
          ) : keys.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto max-w-md rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-8">
                <h3 className="text-[14px] font-semibold text-slate-800">{text(ar, "No access keys yet", "لا توجد مفاتيح وصول بعد")}</h3>
                <p className="mt-2 text-[12px] leading-5 text-slate-500">{text(ar, "Create a key to connect an app to this workspace.", "أنشئ مفتاحاً لربط تطبيق بمساحة العمل هذه.")}</p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {keys.map((key) => (
                <li key={key.id} className="flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-slate-50/70" data-testid="access-key-row">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eef3ff] text-[12px] font-bold text-[#2f61b7]">{(key.name || "?").slice(0, 1).toUpperCase()}</div>
                  <div className="min-w-[220px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold text-slate-900">{key.name}</span>
                      {statusBadge(key.status)}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      <span>{text(ar, "Key ID", "معرّف المفتاح")}: <code dir="ltr" className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">{key.prefix}</code></span>
                      <span>{text(ar, "Folder", "المجلد")}: {key.rootFolder ? key.rootFolder.name || text(ar, "Unavailable folder", "مجلد غير متاح") : text(ar, "Entire workspace", "مساحة العمل بالكامل")}</span>
                      <span>{text(ar, "Created by", "أنشأه")}: {key.createdBy?.name || key.createdBy?.email || "—"}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {key.scopes.map((s) => <span key={s} className="rounded-md bg-[#eef3ff] px-2 py-0.5 text-[10px] font-medium text-[#2f61b7]">{permissionLabel(s)}</span>)}
                    </div>
                  </div>
                  <div className="text-[11px] leading-5 text-slate-500">
                    <div>{text(ar, "Created", "تاريخ الإنشاء")}: {formatWhen(key.createdAt, ar, "—")}</div>
                    <div>{text(ar, "Last used", "آخر استخدام")}: {formatWhen(key.lastUsedAt, ar, text(ar, "Not used yet", "لم يُستخدم بعد"))}</div>
                    <div>{text(ar, "Expires", "ينتهي")}: {formatWhen(key.expiresAt, ar, text(ar, "Never", "أبداً"))}</div>
                  </div>
                  {key.status === "active" ? (
                    confirmRevoke?.id === key.id ? (
                      <div className="flex items-center gap-2">
                        <button type="button" disabled={busyId === key.id} onClick={() => void revoke(key)} className="rounded-xl bg-red-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">
                          {busyId === key.id ? text(ar, "Revoking…", "جارٍ الإلغاء…") : text(ar, "Confirm revoke", "تأكيد الإلغاء")}
                        </button>
                        <button type="button" onClick={() => setConfirmRevoke(null)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">{text(ar, "Keep", "إبقاء")}</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmRevoke(key)} className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-50">{text(ar, "Revoke", "إلغاء المفتاح")}</button>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
