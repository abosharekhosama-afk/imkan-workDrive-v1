"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useLocale } from "@/components/locale-provider";
import { Icons } from "@/components/layout/icons";
import {
  createConnection,
  deleteConnection,
  disableConnection,
  enableConnection,
  getConnectionDiagnostics,
  getConnectionShares,
  listConnectionProviders,
  listConnections,
  listWorkflowParticipants,
  reconnectConnection,
  shareConnection,
  startConnectionOAuth,
  testConnection,
  unshareConnection,
  type Connection,
  type ConnectionProvider,
} from "@/lib/api/workflows";

type View = "default" | "my" | "shared" | "system" | "custom" | "service" | "create" | "custom-create";
type Accordion = "service" | "details" | null;
type CustomService = { name: string; key: string; authType: "API_KEY" | "BEARER" | "BASIC" | "CUSTOM_HEADER"; parameterKey: string; parameterLabel: string; parameterType: "QUERY" | "HEADER" };

type ServiceCard = {
  key: string;
  name: string;
  provider: string;
  logo: string;
  bg: string;
  logoBg: string;
  authType?: string;
  oauth?: boolean;
};

const SERVICE_CATALOG: ServiceCard[] = [
  { key: "google", name: "Google", provider: "google", logo: "G", bg: "#F2F8FF", logoBg: "#fff", authType: "OAUTH2", oauth: true },
  { key: "dropbox", name: "Dropbox", provider: "dropbox", logo: "Dropbox", bg: "#FFF5F2", logoBg: "#fff", authType: "OAUTH2", oauth: true },
  { key: "mailchimp", name: "MailChimp", provider: "mailchimp", logo: "MailChimp", bg: "#FFFCEF", logoBg: "#fff", authType: "API_KEY" },
  { key: "slack", name: "Slack", provider: "slack", logo: "slack", bg: "#F1FBF7", logoBg: "#fff", authType: "BEARER" },
  { key: "asana", name: "Asana", provider: "asana", logo: "asana", bg: "#F7F2FF", logoBg: "#fff", authType: "BEARER" },
  { key: "github", name: "GitHub", provider: "github", logo: "●", bg: "#FFFDF0", logoBg: "#fff", authType: "BEARER" },
  { key: "trello", name: "Trello", provider: "trello", logo: "Trello", bg: "#F1F8FF", logoBg: "#fff", authType: "API_KEY" },
  { key: "groove", name: "Groove", provider: "groove", logo: "Groove", bg: "#F5F4FF", logoBg: "#fff", authType: "API_KEY" },
  { key: "eventbrite", name: "EventBrite", provider: "eventbrite", logo: "EventBrite", bg: "#FFFDF0", logoBg: "#fff", authType: "API_KEY" },
];

function ServiceLogo({ service, size = 58 }: { service: ServiceCard; size?: number }) {
  const isGoogle = service.provider === "google";
  const isDropbox = service.provider === "dropbox";
  return (
    <div className="grid shrink-0 place-items-center rounded-[7px] border border-white/70 shadow-[0_1px_2px_rgba(20,30,40,.04)]" style={{ width: size, height: size, background: service.logoBg }}>
      {isGoogle ? <span className="text-[38px] font-black leading-none" style={{ color: "#4285F4" }}>G</span> : null}
      {isDropbox ? <span className="text-[12px] font-extrabold tracking-[-.06em]" style={{ color: "#0061FF" }}>◆Dropbox</span> : null}
      {!isGoogle && !isDropbox ? <span className={`text-center leading-none ${service.logo.length > 8 ? "text-[9px]" : "text-[15px]"} font-bold`} style={{ color: service.provider === "github" ? "#111827" : "#52606D" }}>{service.logo}</span> : null}
    </div>
  );
}

function ConnectionsNav({ view, setView, customCount }: { view: View; setView: (view: View) => void; customCount: number }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const item = (key: View, label: string, count?: string | number) => (
    <button type="button" onClick={() => setView(key)} className={`flex w-full items-center justify-between px-7 py-[13px] text-start text-[14px] transition ${view === key ? "bg-[#EEF4FF] font-semibold text-[#0B63E5]" : "text-[#334155] hover:bg-[#F5F7FA]"}`}>
      <span>{label}</span>{count !== undefined ? <span className="text-[13px] font-semibold text-[#0B63E5]">{count}</span> : null}
    </button>
  );
  return (
    <aside className="hidden w-[280px] shrink-0 border-e border-[#E3EAF3] bg-[#F7FAFE] lg:flex lg:flex-col" dir={ar ? "rtl" : "ltr"}>
      <div className="flex h-[74px] items-center gap-3 border-b border-[#E3EAF3] px-7">
        <span className="text-[#26384A]"><Icons.link size={24} /></span>
        <span className="text-[24px] font-medium tracking-[-.03em] text-[#1F2937]">{ar ? "الاتصالات" : "Connections"}</span>
      </div>
      <div className="px-7 pt-8 text-[12px] font-semibold uppercase tracking-[.06em] text-[#64748B]">{ar ? "الاتصالات" : "CONNECTIONS"}</div>
      <nav className="mt-3">{item("my", ar ? "اتصالاتي" : "My Connections", undefined)}{item("shared", ar ? "الاتصالات المشتركة" : "Shared Connections")}{item("system", ar ? "اتصالات النظام" : "System Connections")}</nav>
      <div className="px-7 pt-8 text-[12px] font-semibold uppercase tracking-[.06em] text-[#64748B]">{ar ? "الخدمات" : "SERVICES"}</div>
      <nav className="mt-3">{item("default", ar ? "الخدمات الافتراضية" : "Default Services", 113)}{item("custom", ar ? "الخدمات المخصصة" : "Custom Services", customCount || undefined)}</nav>
    </aside>
  );
}

function PageHeader({ title, description, onBack, right }: { title: string; description?: string; onBack?: () => void; right?: ReactNode }) {
  const { locale } = useLocale();
  return (
    <div className="flex items-center justify-between border-b border-[#E7EBF0] px-8 py-6">
      <div className="flex min-w-0 items-center gap-4">
        {onBack ? <button type="button" onClick={onBack} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[#667085] hover:bg-[#F2F5F8]" aria-label={locale === "ar" ? "رجوع" : "Back"}><Icons.chevR size={24} /></button> : null}
        <div className="min-w-0">
          <h1 className="text-[22px] font-medium tracking-[-.025em] text-[#1F2937]">{title}</h1>
          {description ? <p className="mt-1 max-w-[850px] truncate text-[12px] text-[#6B7280]">{description}</p> : null}
        </div>
      </div>
      {right}
    </div>
  );
}

export default function ConnectionsPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [view, setView] = useState<View>("default");
  const [providers, setProviders] = useState<ConnectionProvider[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedService, setSelectedService] = useState<ServiceCard | null>(null);
  const [accordion, setAccordion] = useState<Accordion>("service");
  const [search, setSearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [serviceSearchOpen, setServiceSearchOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const [inspect, setInspect] = useState<Connection | null>(null);
  const [diag, setDiag] = useState<any>(null);
  const [shares, setShares] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [shareUser, setShareUser] = useState("");
  const [shareRole, setShareRole] = useState<"USE" | "MANAGE">("USE");
  const [draft, setDraft] = useState({ name: "", linkName: "", authType: "API_KEY", parameterKey: "", parameterLabel: "", secret: "", baseUrl: "" });
  const [customServices, setCustomServices] = useState<CustomService[]>([]);
  const [customDraft, setCustomDraft] = useState<CustomService>({ name: "", key: "", authType: "API_KEY", parameterKey: "", parameterLabel: "", parameterType: "QUERY" });

  const reload = async () => {
    try { setConnections(await listConnections()); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load connections"); }
  };
  useEffect(() => { void listConnectionProviders().then(setProviders).catch(() => undefined); void reload(); try { const raw = localStorage.getItem("imkan_connection_custom_services"); if (raw) setCustomServices(JSON.parse(raw)); } catch {} }, []);

  const actualProviders = useMemo(() => new Set(providers.map((p) => p.key)), [providers]);
  const visibleServices = useMemo(() => {
    const q = serviceSearch.trim().toLowerCase();
    return SERVICE_CATALOG.filter((s) => !q || `${s.name} ${s.provider}`.toLowerCase().includes(q));
  }, [serviceSearch]);
  const serviceProvider = selectedService ? providers.find((p) => p.key === selectedService.provider) : undefined;
  const authTypes = serviceProvider?.authTypes ?? (selectedService?.authType ? [selectedService.authType] : ["API_KEY"]);
  const secretField = draft.authType === "API_KEY" ? "apiKey" : draft.authType === "BEARER" ? "bearerToken" : draft.authType === "BASIC" ? "username" : draft.authType === "CUSTOM_HEADER" ? "customHeaders" : "";
  const myConnections = connections;
  const currentUserId = (() => { try { const raw = localStorage.getItem("workdrive_user"); return raw ? (JSON.parse(raw) as { id?: string; userId?: string }).id ?? (JSON.parse(raw) as { userId?: string }).userId : undefined; } catch { return undefined; } })();
  const sharedConnections = connections.filter((c) => currentUserId ? c.ownerId !== currentUserId : !c.canManage);
  const shownConnections = (view === "shared" ? sharedConnections : myConnections).filter((c) => !search || `${c.name} ${c.provider}`.toLowerCase().includes(search.toLowerCase()));

  const beginCreate = (service: ServiceCard) => {
    setSelectedService(service);
    setDraft({ name: "", linkName: service.provider, authType: service.authType ?? "API_KEY", parameterKey: "", parameterLabel: "", secret: "", baseUrl: "" });
    setAccordion("details");
    setError(""); setMessage(""); setView("create");
  };
  const openService = (service: ServiceCard) => { setSelectedService(service); setView("service"); setError(""); setMessage(""); };

  const create = async () => {
    if (!selectedService || !draft.name.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const secrets: Record<string, string> = {};
      if (secretField && draft.secret) secrets[secretField] = draft.secret;
      const provider = actualProviders.has(selectedService.provider) ? selectedService.provider : "rest";
      const authType = provider === "rest" ? draft.authType : "OAUTH2";
      await createConnection({ name: draft.name.trim(), provider, authType, visibility: "PRIVATE", baseUrl: provider === "rest" ? draft.baseUrl || undefined : undefined, metadata: { serviceName: selectedService.name, serviceLinkName: draft.linkName, parameterKey: draft.parameterKey, parameterLabel: draft.parameterLabel }, secrets: authType === "OAUTH2" ? {} : secrets });
      setMessage(ar ? "تم إنشاء الاتصال بنجاح." : "Connection created successfully.");
      await reload();
      if (selectedService.oauth && actualProviders.has(selectedService.provider)) {
        const r = await startConnectionOAuth(selectedService.provider);
        window.location.href = r.url;
        return;
      }
      setView("my");
    } catch (e) { setError(e instanceof Error ? e.message : (ar ? "تعذر إنشاء الاتصال" : "Unable to create connection")); }
    finally { setBusy(false); }
  };

  const startOAuth = async (service: ServiceCard) => {
    setBusy(true); setError("");
    try { const r = await startConnectionOAuth(service.provider); window.location.href = r.url; }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to start OAuth"); setBusy(false); }
  };
  const remove = async (id: string) => { if (!window.confirm(ar ? "حذف الاتصال؟" : "Delete this connection?")) return; setBusy(true); try { await deleteConnection(id); await reload(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to delete"); } finally { setBusy(false); } };
  const toggle = async (c: Connection) => { setBusy(true); try { if (c.status === "DISABLED") await enableConnection(c.id); else await disableConnection(c.id); await reload(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to update connection"); } finally { setBusy(false); } };
  const connectExisting = async (c: Connection) => { if (c.authType === "OAUTH2") { setBusy(true); try { const r = await reconnectConnection(c.id); window.location.href = r.url; } catch (e) { setError(e instanceof Error ? e.message : "Unable to reconnect"); setBusy(false); } } else { try { const r = await testConnection(c.id); setMessage(r.ok ? (ar ? "بيانات الاتصال صالحة." : "Connection credentials are valid.") : "Connection test failed"); await reload(); } catch (e) { setError(e instanceof Error ? e.message : "Test failed"); } } };

  const inspectConnection = async (c: Connection) => { setInspect(c); setDiag(null); setShares([]); try { const [d, s] = await Promise.all([getConnectionDiagnostics(c.id), getConnectionShares(c.id)]); setDiag(d); setShares(s.shares || []); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load connection details"); } };
  const loadMembers = async () => { try { const m = await listWorkflowParticipants(); setMembers(m.map((x) => x.user)); } catch {} };
  const addShare = async () => { if (!inspect || !shareUser) return; setBusy(true); try { await shareConnection(inspect.id, shareUser, shareRole); setShares((await getConnectionShares(inspect.id)).shares || []); setShareUser(""); } catch (e) { setError(e instanceof Error ? e.message : "Unable to share connection"); } finally { setBusy(false); } };
  const removeShare = async (uid: string) => { if (!inspect) return; setBusy(true); try { await unshareConnection(inspect.id, uid); setShares((await getConnectionShares(inspect.id)).shares || []); } catch (e) { setError(e instanceof Error ? e.message : "Unable to remove share"); } finally { setBusy(false); } };

  const saveCustomService = () => {
    if (!customDraft.name.trim() || !customDraft.key.trim()) return;
    const next = [...customServices, { ...customDraft, name: customDraft.name.trim(), key: customDraft.key.trim() }];
    setCustomServices(next); localStorage.setItem("imkan_connection_custom_services", JSON.stringify(next)); setView("custom");
  };

  const defaultDescription = ar ? "الخدمات التي تم تكوينها مسبقاً في WorkDrive مدرجة هنا. انقر على الخدمة المطلوبة لإنشاء اتصال بسرعة." : "Services that are pre-configured in WorkDrive are listed here. Click on the required service to quickly create connections using it.";

  return (
    <div className="flex min-h-full flex-1 bg-white" dir={ar ? "rtl" : "ltr"}>
      <ConnectionsNav view={view} setView={(v) => { setView(v); setError(""); setMessage(""); }} customCount={customServices.length} />
      <main className="min-w-0 flex-1 overflow-y-auto bg-white">
        {view === "default" ? (
          <>
            <PageHeader title="Default Services" description={defaultDescription} right={<div className="flex items-center gap-2">{serviceSearchOpen ? <div className="flex h-11 w-[250px] items-center gap-2 rounded-md border border-[#DCE3EC] bg-white px-3"><Icons.search size={17} /><input autoFocus value={serviceSearch} onChange={(e) => setServiceSearch(e.target.value)} className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" placeholder={ar ? "بحث" : "Search"} /></div> : null}<button type="button" onClick={() => setServiceSearchOpen((v) => !v)} className="grid h-12 w-12 place-items-center rounded-md bg-[#F7F9FC] text-[#1F2937] hover:bg-[#EEF3F8]"><Icons.search size={23} /></button></div>} />
            <div className="px-8 pb-10 pt-7">
              <div className="mb-6 text-[13px] text-[#64748B]">{ar ? "الخدمات المتاحة" : "Available services"}</div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                {visibleServices.map((service) => {
                  const supported = actualProviders.has(service.provider);
                  return <button type="button" key={service.key} onClick={() => openService(service)} className="group overflow-hidden rounded-[7px] border border-[#E3E8EF] text-start transition hover:-translate-y-[1px] hover:border-[#C7D3E1] hover:shadow-[0_7px_20px_rgba(31,41,55,.09)]" style={{ background: service.bg }}>
                    <div className="flex h-[166px] items-center justify-center"><ServiceLogo service={service} size={72} /></div>
                    <div className="min-h-[76px] border-t border-black/[.035] bg-white px-5 py-4"><div className="text-[14px] font-semibold text-[#202B38]">{service.name}</div><div className="mt-1 text-[12px] text-[#7A8491]">{supported ? (ar ? "متاح" : "Available") : (ar ? "غير مستخدم" : "Not used")}</div></div>
                  </button>;
                })}
              </div>
            </div>
          </>
        ) : null}

        {view === "service" && selectedService ? (
          <>
            <PageHeader title={selectedService.name} onBack={() => setView("default")} right={<button type="button" onClick={() => beginCreate(selectedService)} className="h-11 rounded-md bg-[#0B63E5] px-7 text-[14px] font-semibold text-white shadow-sm hover:bg-[#0958CB]">Create Connection</button>} />
            <div className="px-8 py-9"><div className="max-w-[980px] border-t border-[#E7EBF0] pt-8"><div className="grid grid-cols-2 gap-x-16 gap-y-12"><div><div className="text-[12px] uppercase text-[#7C8795]">SERVICE NAME</div><div className="mt-3 text-[20px] text-[#283444]">{selectedService.name}</div></div><div><div className="text-[12px] uppercase text-[#7C8795]">SERVICE LINK NAME</div><div className="mt-3 text-[20px] text-[#283444]">{selectedService.provider}</div></div><div><div className="text-[12px] uppercase text-[#7C8795]">SCOPES</div><div className="mt-3 text-[20px] text-[#283444]">{selectedService.oauth ? "OAuth" : "No"}</div></div><div><div className="text-[12px] uppercase text-[#7C8795]">CONNECTIONS ASSOCIATED</div><div className="mt-3 text-[20px] text-[#283444]">{connections.filter((c) => c.provider === selectedService.provider).length ? "Yes" : "No"}</div></div></div></div></div>
          </>
        ) : null}

        {view === "create" && selectedService ? (
          <>
            <PageHeader title={ar ? "إنشاء اتصال" : "Create Connection"} description={ar ? "أدخل تفاصيل الاتصال بالخدمة المطلوبة ثم اضغط إنشاء واتصال." : "Provide the connection details for the required service and click Create And Connect."} onBack={() => setView("service")} />
            <div className="px-8 py-6 pb-12">
              <div className="overflow-hidden rounded-[5px] border border-[#DCE4EC]">
                <button type="button" onClick={() => setAccordion(accordion === "service" ? null : "service")} className={`flex w-full items-center justify-between px-6 py-5 text-start ${accordion === "service" ? "bg-[#FBFEFF]" : "bg-[#F8FCFD]"}`}>
                  <div className="flex items-center gap-4"><span className="text-[18px] font-medium text-[#1F2937]">1. Pick Your Service</span>{accordion !== "service" ? <><ServiceLogo service={selectedService} size={31} /><span className="text-[16px] font-medium text-[#0B63E5]">{selectedService.name}</span></> : null}</div>{accordion !== "service" ? <span className="grid h-6 w-6 place-items-center rounded-full bg-[#16B364] text-white"><Icons.check size={15} /></span> : null}
                </button>
                {accordion === "service" ? <div className="border-t border-[#E7EDF2] bg-white p-6"><div className="mb-5 flex items-center gap-4"><ServiceLogo service={selectedService} size={44} /><span className="text-[17px] font-medium text-[#0B63E5]">{selectedService.name}</span></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{SERVICE_CATALOG.slice(0, 9).map((s) => <button key={s.key} type="button" onClick={() => { setSelectedService(s); setDraft((d) => ({ ...d, authType: s.authType ?? "API_KEY", linkName: s.provider })); setAccordion("details"); }} className={`flex items-center gap-3 rounded-[5px] border px-4 py-3 text-start transition ${selectedService.key === s.key ? "border-[#0B63E5] bg-[#F4F8FF]" : "border-[#E2E7EE] hover:border-[#B9C7D8]"}`}><ServiceLogo service={s} size={44} /><span><span className="block text-[12px] text-[#7B8794]">SERVICE NAME</span><span className="block text-[15px] text-[#1F2937]">{s.name}</span></span></button>)}</div></div> : null}
              </div>

              <div className="mt-3 overflow-hidden rounded-[5px] border border-[#DCE4EC]">
                <button type="button" onClick={() => setAccordion(accordion === "details" ? null : "details")} className={`flex w-full items-center justify-between px-6 py-5 text-start ${accordion === "details" ? "bg-white" : "bg-[#FBFCFD]"}`}><span className="text-[18px] font-medium text-[#1F2937]">2. Connection Details</span><span className={`text-[#697586] transition ${accordion === "details" ? "rotate-180" : ""}`}>⌄</span></button>
                {accordion === "details" ? <div className="border-t border-[#E7EDF2] p-7"><div className="grid grid-cols-1 gap-6 md:grid-cols-2"><label className="block"><span className="mb-2 block text-[14px] font-semibold text-[#1F2937]">Connection Name</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Enter Connection Name" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px] outline-none focus:border-[#0B63E5] focus:ring-2 focus:ring-[#0B63E5]/10" /></label><label className="block"><span className="mb-2 block text-[14px] font-semibold text-[#1F2937]">Connection Link Name</span><input value={draft.linkName} onChange={(e) => setDraft({ ...draft, linkName: e.target.value })} placeholder="Enter Connection Link Name" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px] outline-none focus:border-[#0B63E5] focus:ring-2 focus:ring-[#0B63E5]/10" /></label></div>
                  {!selectedService.oauth || !actualProviders.has(selectedService.provider) ? <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2"><label className="block"><span className="mb-2 block text-[14px] font-semibold text-[#1F2937]">Authentication Type</span><select value={draft.authType} onChange={(e) => setDraft({ ...draft, authType: e.target.value })} className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] bg-white px-4 text-[14px] outline-none focus:border-[#0B63E5]">{authTypes.map((t) => <option key={t}>{t}</option>)}</select></label><label className="block"><span className="mb-2 block text-[14px] font-semibold text-[#1F2937]">Parameter Type</span><select className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] bg-white px-4 text-[14px]"><option>Query String</option><option>Header</option></select></label></div> : <div className="mt-6 rounded-[5px] bg-[#F7FAFD] p-4 text-[13px] text-[#667085]">OAuth authentication will open in the provider authorization window after you create the connection.</div>}
                  {!selectedService.oauth || !actualProviders.has(selectedService.provider) ? <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2"><label className="block"><span className="mb-2 block text-[14px] font-semibold text-[#1F2937]">Parameter Key</span><input value={draft.parameterKey} onChange={(e) => setDraft({ ...draft, parameterKey: e.target.value })} placeholder="Enter Key" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px] outline-none focus:border-[#0B63E5]" /></label><label className="block"><span className="mb-2 block text-[14px] font-semibold text-[#1F2937]">Parameter Display Name</span><input value={draft.parameterLabel} onChange={(e) => setDraft({ ...draft, parameterLabel: e.target.value })} placeholder="Enter Display Name" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px] outline-none focus:border-[#0B63E5]" /></label></div> : null}
                  {!selectedService.oauth || !actualProviders.has(selectedService.provider) ? <div className="mt-6"><label className="block"><span className="mb-2 block text-[14px] font-semibold text-[#1F2937]">{draft.authType === "CUSTOM_HEADER" ? "Custom Headers (JSON)" : "Credential"}</span><input type={draft.authType === "BASIC" ? "password" : "text"} value={draft.secret} onChange={(e) => setDraft({ ...draft, secret: e.target.value })} placeholder={draft.authType === "CUSTOM_HEADER" ? '{"X-API-Key":"..."}' : "Enter value"} className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px] outline-none focus:border-[#0B63E5]" /></label>{selectedService.provider === "rest" || !actualProviders.has(selectedService.provider) ? <label className="mt-5 block"><span className="mb-2 block text-[14px] font-semibold text-[#1F2937]">Base URL</span><input value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} placeholder="https://api.example.com" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px] outline-none focus:border-[#0B63E5]" /></label> : null}</div> : null}
                </div> : null}
              </div>
              {error ? <div className="mt-4 rounded-md bg-[#FFF3F2] px-4 py-3 text-[12px] text-[#B42318]">{error}</div> : null}
              {message ? <div className="mt-4 rounded-md bg-[#ECFDF3] px-4 py-3 text-[12px] text-[#067647]">{message}</div> : null}
              <div className="mt-8 flex gap-3"><button type="button" onClick={create} disabled={busy || !draft.name.trim()} className="h-12 rounded-[5px] bg-[#0B63E5] px-7 text-[14px] font-semibold text-white hover:bg-[#0958CB] disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Creating..." : "Create And Connect"}</button><button type="button" onClick={() => setView("service")} className="h-12 rounded-[5px] bg-[#EEF1F4] px-7 text-[14px] font-medium text-[#475467] hover:bg-[#E3E7EB]">Cancel</button></div>
            </div>
          </>
        ) : null}

        {view === "my" || view === "shared" ? (
          <>
            <PageHeader title={view === "my" ? "My Connections" : "Shared Connections"} description={view === "my" ? "Connections created by you and the administrators of your organization are listed here. You can let other users utilize your connections." : "Connections shared with you by users in your organization."} right={<div className="flex items-center gap-3"><button type="button" className="grid h-11 w-11 place-items-center rounded-md bg-[#F7F9FC]"><Icons.search size={20} /></button><button type="button" className="grid h-11 w-11 place-items-center rounded-md bg-[#F7F9FC]"><Icons.funnel size={19} /></button><button type="button" onClick={() => setView("default")} className="h-11 rounded-md bg-[#0B63E5] px-6 text-[14px] font-semibold text-white">Create Connection</button></div>} />
            <div className="px-8 py-7"><div className="mb-5 flex max-w-[420px] items-center gap-2 rounded-md border border-[#DCE3EC] px-3 py-2"><Icons.search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" placeholder="Search connections" /></div>
              {shownConnections.length === 0 ? <div className="grid min-h-[470px] place-items-center rounded-md border border-dashed border-[#DCE4EC] bg-[#FCFDFE] text-center"><div><div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#F1F5F9] text-[#9AA6B2]"><Icons.link size={35} /></div><div className="mt-5 text-[19px] font-medium text-[#2A3441]">You Don't Have any {view === "my" ? "Connections" : "Shared Connections"} yet</div><div className="mx-auto mt-2 max-w-[600px] text-[13px] leading-6 text-[#7B8794]">{view === "my" ? "Create a connection to securely store credentials and use them from your automation tasks." : "Connections shared with you by other members will appear on this page."}</div></div></div> : <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">{shownConnections.map((c) => { const service = SERVICE_CATALOG.find((s) => s.provider === c.provider) ?? { key: c.provider, name: c.provider, provider: c.provider, logo: c.provider.slice(0, 1).toUpperCase(), bg: "#F6F8FA", logoBg: "#fff" }; return <article key={c.id} onMouseEnter={() => setHovered(c.id)} onMouseLeave={() => setHovered(null)} className="group relative overflow-hidden rounded-[7px] border border-[#DCE3EA] bg-white transition hover:-translate-y-[1px] hover:shadow-[0_8px_24px_rgba(31,41,55,.10)]"><div className="relative flex h-[145px] items-center justify-center" style={{ background: service.bg }}><ServiceLogo service={service as ServiceCard} size={68} />{hovered === c.id ? <div className="absolute inset-x-0 top-0 flex justify-end gap-1 p-3"><button type="button" onClick={() => inspectConnection(c)} className="grid h-8 w-8 place-items-center rounded-md bg-white/95 text-[#475467] shadow-sm hover:bg-white"><Icons.pencil size={14} /></button><button type="button" onClick={() => void remove(c.id)} className="grid h-8 w-8 place-items-center rounded-md bg-white/95 text-[#B42318] shadow-sm hover:bg-white"><Icons.trash size={14} /></button></div> : null}{hovered === c.id ? <button type="button" onClick={() => void connectExisting(c)} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[4px] bg-[#27AE60] px-6 py-2.5 text-[14px] font-semibold text-white shadow-sm">Connect</button> : null}</div><div className="min-h-[88px] border-t border-[#EEF1F4] px-5 py-4"><div className="flex items-center justify-between gap-2"><div className="text-[14px] font-semibold text-[#253140]">{c.name}</div><span className={`h-2.5 w-2.5 rounded-full ${c.status === "ACTIVE" ? "bg-[#22C55E]" : c.status === "REAUTH_REQUIRED" ? "bg-[#F59E0B]" : "bg-[#94A3B8]"}`} /></div><div className="mt-1 text-[12px] text-[#7A8491]">{c.provider === "google" ? "Deprecated" : c.authType}</div></div></article>; })}</div>}
            </div>
          </>
        ) : null}

        {view === "system" ? <><PageHeader title="System Connections" description="Connections created automatically by built-in services are available here." /><div className="grid min-h-[620px] place-items-center px-8"><div className="text-center"><div className="mx-auto grid h-32 w-32 place-items-center rounded-full bg-[#F6F8FB] text-[#8FA0B2]"><Icons.link size={58} /></div><h2 className="mt-7 text-[22px] font-medium text-[#1F2937]">You Don't Have any System Connections yet</h2><p className="mx-auto mt-3 max-w-[640px] text-[13px] leading-6 text-[#7B8794]">When you execute a built-in service task without a connection, the system can automatically create one in the backend. Such system connections will be available on this page.</p></div></div></> : null}

        {view === "custom" ? <><PageHeader title="Custom Services" description="Create custom service definitions and then create connections from them." right={<button type="button" onClick={() => setView("custom-create")} className="h-11 rounded-md bg-[#0B63E5] px-6 text-[14px] font-semibold text-white">Create New Service</button>} /><div className="px-8 py-8"><div className="grid grid-cols-1 gap-4 xl:grid-cols-3"><button type="button" onClick={() => setView("custom-create")} className="flex h-[170px] items-center justify-center rounded-[7px] border border-[#0B63E5] bg-white text-[#0B63E5] hover:bg-[#F7FAFF]"><span className="mr-3 grid h-12 w-12 place-items-center rounded-full border border-dashed border-[#0B63E5] text-[28px]">+</span><span className="text-[16px] font-medium">Create New Service</span></button>{customServices.map((s) => <button key={s.key} type="button" onClick={() => { const svc: ServiceCard = { key: s.key, name: s.name, provider: "rest", logo: s.name.slice(0, 1).toUpperCase(), bg: "#F7FAFE", logoBg: "#fff", authType: s.authType }; setSelectedService(svc); setDraft({ name: "", linkName: s.key, authType: s.authType, parameterKey: s.parameterKey, parameterLabel: s.parameterLabel, secret: "", baseUrl: "" }); setView("create"); setAccordion("details"); }} className="rounded-[7px] border border-[#DCE3EA] bg-white p-5 text-start hover:shadow-sm"><div className="flex items-center gap-3"><ServiceLogo service={{ key: s.key, name: s.name, provider: "rest", logo: s.name.slice(0, 1).toUpperCase(), bg: "#F7FAFE", logoBg: "#fff" }} size={55} /><div><div className="text-[15px] font-semibold">{s.name}</div><div className="mt-1 text-[12px] text-[#7A8491]">{s.key}</div></div></div></button>)}</div></div></> : null}

        {view === "custom-create" ? <><PageHeader title="Create Service" description="Provide the following service details and click Create Service. Once configured, you can create multiple connections based on this service." onBack={() => setView("custom")} /><div className="px-8 py-7 pb-12"><div className="max-w-[980px]"><div className="text-[13px] font-semibold text-[#263342]">SERVICE DETAILS</div><div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2"><label><span className="mb-2 block text-[14px] font-semibold">Service Name <b className="text-[#E11D48]">*</b></span><input value={customDraft.name} onChange={(e) => setCustomDraft({ ...customDraft, name: e.target.value })} placeholder="Enter Service Name" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px]" /></label><label><span className="mb-2 block text-[14px] font-semibold">Service Link Name <b className="text-[#E11D48]">*</b></span><input value={customDraft.key} onChange={(e) => setCustomDraft({ ...customDraft, key: e.target.value })} placeholder="Enter Service Link Name" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px]" /></label></div><div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2"><label><span className="mb-2 block text-[14px] font-semibold">Authentication Type</span><select value={customDraft.authType} onChange={(e) => setCustomDraft({ ...customDraft, authType: e.target.value as CustomService["authType"] })} className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] bg-white px-4 text-[14px]"><option value="API_KEY">API Key</option><option value="BEARER">Bearer Token</option><option value="BASIC">Basic</option><option value="CUSTOM_HEADER">Custom Header</option></select></label><label><span className="mb-2 block text-[14px] font-semibold">Parameter Type</span><select value={customDraft.parameterType} onChange={(e) => setCustomDraft({ ...customDraft, parameterType: e.target.value as CustomService["parameterType"] })} className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] bg-white px-4 text-[14px]"><option value="QUERY">Query String</option><option value="HEADER">Header</option></select></label></div><div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2"><label><span className="mb-2 block text-[14px] font-semibold">Parameter Key <b className="text-[#E11D48]">*</b></span><input value={customDraft.parameterKey} onChange={(e) => setCustomDraft({ ...customDraft, parameterKey: e.target.value })} placeholder="Enter Key" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px]" /></label><label><span className="mb-2 block text-[14px] font-semibold">Parameter Display Name <b className="text-[#E11D48]">*</b></span><input value={customDraft.parameterLabel} onChange={(e) => setCustomDraft({ ...customDraft, parameterLabel: e.target.value })} placeholder="Enter Display Name" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px]" /></label></div><div className="mt-7 rounded-[7px] border border-[#DCE4EC] bg-[#FAFCFE] p-5"><div className="flex items-center justify-between"><div className="text-[15px] font-semibold">Advanced Configuration</div><Icons.chevD size={18} /></div><div className="mt-6 flex items-center gap-4"><span className="text-[13px] text-[#6B7280]">Dynamic Parameters</span><span className="h-3 w-3 rounded-full bg-[#9CA3AF]" /></div><div className="mt-4 flex items-center gap-3"><span className="relative inline-flex h-6 w-11 rounded-full bg-[#E5E7EB]"><span className="absolute start-1 top-1 h-4 w-4 rounded-full bg-white shadow" /></span><span className="text-[13px]">Yes</span></div></div><div className="mt-8 flex gap-3"><button type="button" onClick={saveCustomService} disabled={!customDraft.name.trim() || !customDraft.key.trim() || !customDraft.parameterKey.trim() || !customDraft.parameterLabel.trim()} className="h-12 rounded-[5px] bg-[#0B63E5] px-7 text-[14px] font-semibold text-white disabled:opacity-50">Create Service</button><button type="button" onClick={() => setView("custom")} className="h-12 rounded-[5px] bg-[#EEF1F4] px-7 text-[14px] text-[#475467]">Cancel</button></div></div></div></> : null}

        {message && view !== "create" ? <div className="fixed bottom-5 end-5 z-[200] max-w-[420px] rounded-md bg-[#ECFDF3] px-5 py-3 text-[12px] text-[#067647] shadow-lg">{message}</div> : null}
        {error && view !== "create" ? <div className="fixed bottom-5 end-5 z-[200] max-w-[420px] rounded-md bg-[#FFF3F2] px-5 py-3 text-[12px] text-[#B42318] shadow-lg">{error}</div> : null}
      </main>

      {inspect ? <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0F172A]/45 p-5"><div className="max-h-[90vh] w-[min(860px,96vw)] overflow-y-auto rounded-lg bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><div className="text-[20px] font-semibold text-[#1F2937]">{inspect.name}</div><div className="mt-1 text-[12px] text-[#7B8794]">{inspect.provider} · {inspect.authType} · {inspect.status}</div></div><button type="button" onClick={() => setInspect(null)} className="grid h-9 w-9 place-items-center rounded-md hover:bg-[#F2F4F7]">×</button></div>{diag ? <div className="mt-6 grid gap-4 md:grid-cols-2"><div className="rounded-md bg-[#F8FAFC] p-4"><div className="text-[13px] font-semibold">Diagnostics</div><div className="mt-3 space-y-2 text-[12px]">{Object.entries(diag.checks || {}).map(([k, v]) => <div key={k}>{v ? "✓" : "✕"} {k}</div>)}</div></div><div className="rounded-md bg-[#F8FAFC] p-4"><div className="text-[13px] font-semibold">Usage</div><div className="mt-3 text-[12px]">{diag.usageCount} operations · {diag.averageDurationMs ? Math.round(diag.averageDurationMs) : 0} ms avg.</div><div className="mt-2 text-[11px] text-[#7B8794]">{diag.errorCode || ""} {diag.errorMessage || ""}</div></div></div> : null}<div className="mt-5 rounded-md border border-[#E4E7EC] p-4"><div className="text-[13px] font-semibold">Sharing</div>{inspect.canManage ? <><div className="mt-3 grid gap-3 md:grid-cols-[1fr_130px_auto]"><select value={shareUser} onFocus={() => void loadMembers()} onChange={(e) => setShareUser(e.target.value)} className="h-10 rounded-md border border-[#D8E0E8] px-3 text-[12px]"><option value="">Select member</option>{members.filter((m) => m.id !== inspect.ownerId && !shares.some((x) => x.userId === m.id)).map((m) => <option key={m.id} value={m.id}>{m.name || m.email} · {m.email}</option>)}</select><select value={shareRole} onChange={(e) => setShareRole(e.target.value as "USE" | "MANAGE")} className="h-10 rounded-md border border-[#D8E0E8] px-3 text-[12px]"><option value="USE">USE</option><option value="MANAGE">MANAGE</option></select><button type="button" onClick={() => void addShare()} className="rounded-md bg-[#0B63E5] px-4 text-[12px] font-semibold text-white">Share</button></div></> : null}<div className="mt-4 space-y-2">{shares.map((s) => <div key={s.id} className="flex items-center justify-between rounded-md bg-[#F8FAFC] px-3 py-2 text-[11px]"><span>{s.user?.name || s.user?.email} · {s.role}</span>{inspect.canManage ? <button type="button" onClick={() => void removeShare(s.userId)} className="text-[#B42318]">Remove</button> : null}</div>)}</div></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => void toggle(inspect)} className="rounded-md border border-[#D8E0E8] px-4 py-2 text-[12px]">{inspect.status === "DISABLED" ? "Enable" : "Disable"}</button>{inspect.authType === "OAUTH2" ? <button type="button" onClick={() => void connectExisting(inspect)} className="rounded-md border border-[#D8E0E8] px-4 py-2 text-[12px]">Reconnect</button> : null}<button type="button" onClick={() => setInspect(null)} className="rounded-md bg-[#0B63E5] px-5 py-2 text-[12px] font-semibold text-white">Close</button></div></div></div> : null}
    </div>
  );
}
