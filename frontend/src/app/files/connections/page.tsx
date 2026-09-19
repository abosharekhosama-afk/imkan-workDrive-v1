"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useLocale } from "@/components/locale-provider";
import { Icons } from "@/components/layout/icons";
import {
  createConnection,
  createCustomConnectionService,
  deleteConnection,
  deleteCustomConnectionService,
  disableConnection,
  enableConnection,
  getConnectionDiagnostics,
  getConnectionShares,
  listCustomConnectionServices,
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
  type CustomConnectionService,
} from "@/lib/api/workflows";

type View = "default" | "my" | "shared" | "system" | "custom" | "service" | "create" | "custom-create";
type Accordion = "service" | "details" | null;
type CustomServiceDraft = { name: string; key: string; authType: "OAUTH2" | "API_KEY" | "BEARER" | "BASIC" | "CUSTOM_HEADER" | "NONE"; parameterKey: string; parameterLabel: string; parameterType: "QUERY" | "HEADER"; baseUrl: string; oauthAuthUrl: string; oauthTokenUrl: string; oauthRevokeUrl: string; oauthClientId: string; oauthClientSecret: string; scopes: ScopeDef[]; defaultScopes: string[] };

type ScopeDef = { value: string; label: string; description: string; group?: string; risk?: 'STANDARD'|'SENSITIVE'|'RESTRICTED' };
type ServiceCard = {
  key: string;
  name: string;
  provider: string;
  mark: string;
  bg: string;
  fg: string;
  authType?: string;
  oauth?: boolean;
  baseUrl?: string;
  scopes?: ScopeDef[];
  defaultScopes?: string[];
  scopeGroups?: string[];
  customId?: string;
};

const BRAND: Record<string, { mark: string; bg: string; fg: string }> = {
  google: { mark: 'G', bg: '#F2F8FF', fg: '#4285F4' }, microsoft: { mark: 'M', bg: '#F4F8FF', fg: '#2563EB' }, dropbox: { mark: '◇', bg: '#F1F7FF', fg: '#0061FF' },
  github: { mark: 'GH', bg: '#F6F7F9', fg: '#111827' }, slack: { mark: 'S', bg: '#F3FBF7', fg: '#36C5F0' }, asana: { mark: 'A', bg: '#FFF5F1', fg: '#F06A6A' },
  notion: { mark: 'N', bg: '#F7F7F7', fg: '#111827' }, hubspot: { mark: 'H', bg: '#FFF5ED', fg: '#F97316' }, salesforce: { mark: 'SF', bg: '#F1FAFF', fg: '#0EA5E9' },
  zoom: { mark: 'Z', bg: '#F0F7FF', fg: '#2D8CFF' }, discord: { mark: 'DC', bg: '#F4F2FF', fg: '#5865F2' }, mailchimp: { mark: 'M', bg: '#FFF8E8', fg: '#F5A623' },
  stripe: { mark: 'S', bg: '#F5F3FF', fg: '#635BFF' }, sendgrid: { mark: 'SG', bg: '#F0FBFF', fg: '#1A82E2' }, twilio: { mark: 'T', bg: '#FFF1F2', fg: '#E11D48' },
  trello: { mark: 'T', bg: '#F0F7FF', fg: '#0C66E4' }, jira: { mark: 'J', bg: '#F2F6FF', fg: '#1868DB' }, linear: { mark: 'L', bg: '#F5F3FF', fg: '#5E6AD2' },
  pipedrive: { mark: 'P', bg: '#F1FBF5', fg: '#1A9A59' }, freshbooks: { mark: 'FB', bg: '#F0FAF4', fg: '#0B8F55' },
  'zoho-crm': { mark: 'Z', bg: '#FFF5F5', fg: '#E42527' }, 'zoho-books': { mark: 'ZB', bg: '#F2FBF7', fg: '#2BA56B' }, 'zoho-desk': { mark: 'ZD', bg: '#FFF7F0', fg: '#F97316' }, 'zoho-projects': { mark: 'ZP', bg: '#F4F7FF', fg: '#4F46E5' },
  rest: { mark: 'API', bg: '#F7F9FC', fg: '#475467' },
};

const FALLBACK_SCOPES: Record<string, ScopeDef[]> = {
  github: [
    { value: 'read:user', label: 'Profile', description: 'Read the connected GitHub profile.' },
    { value: 'user:email', label: 'Email', description: 'Read the connected email addresses.' },
    { value: 'repo', label: 'Repositories', description: 'Access private repositories.' },
    { value: 'read:org', label: 'Organizations', description: 'Read organization membership.' },
    { value: 'workflow', label: 'Actions workflows', description: 'Update GitHub Actions workflow files.' },
  ],
};

const SERVICE_CATALOG: ServiceCard[] = [
  { key: 'google', name: 'Google', provider: 'google', ...BRAND.google, authType: 'OAUTH2', oauth: true },
  { key: 'microsoft', name: 'Microsoft 365', provider: 'microsoft', ...BRAND.microsoft, authType: 'OAUTH2', oauth: true },
  { key: 'dropbox', name: 'Dropbox', provider: 'dropbox', ...BRAND.dropbox, authType: 'OAUTH2', oauth: true },
  { key: 'github', name: 'GitHub', provider: 'github', ...BRAND.github, authType: 'OAUTH2', oauth: true, scopes: FALLBACK_SCOPES.github, defaultScopes: ['read:user', 'user:email'] },
  { key: 'slack', name: 'Slack', provider: 'slack', ...BRAND.slack, authType: 'OAUTH2', oauth: true },
  { key: 'asana', name: 'Asana', provider: 'asana', ...BRAND.asana, authType: 'OAUTH2', oauth: true },
  { key: 'notion', name: 'Notion', provider: 'notion', ...BRAND.notion, authType: 'OAUTH2', oauth: true },
  { key: 'hubspot', name: 'HubSpot', provider: 'hubspot', ...BRAND.hubspot, authType: 'OAUTH2', oauth: true },
  { key: 'salesforce', name: 'Salesforce', provider: 'salesforce', ...BRAND.salesforce, authType: 'OAUTH2', oauth: true },
  { key: 'zoom', name: 'Zoom', provider: 'zoom', ...BRAND.zoom, authType: 'OAUTH2', oauth: true },
  { key: 'discord', name: 'Discord', provider: 'discord', ...BRAND.discord, authType: 'OAUTH2', oauth: true },
  { key: 'mailchimp', name: 'Mailchimp', provider: 'mailchimp', ...BRAND.mailchimp, authType: 'OAUTH2', oauth: true },
  { key: 'stripe', name: 'Stripe', provider: 'stripe', ...BRAND.stripe, authType: 'BEARER' },
  { key: 'sendgrid', name: 'SendGrid', provider: 'sendgrid', ...BRAND.sendgrid, authType: 'BEARER' },
  { key: 'twilio', name: 'Twilio', provider: 'twilio', ...BRAND.twilio, authType: 'BASIC' },
  { key: 'trello', name: 'Trello', provider: 'trello', ...BRAND.trello, authType: 'API_KEY' },
  { key: 'jira', name: 'Jira Cloud', provider: 'jira', ...BRAND.jira, authType: 'BEARER' },
  { key: 'linear', name: 'Linear', provider: 'linear', ...BRAND.linear, authType: 'BEARER' },
  { key: 'pipedrive', name: 'Pipedrive', provider: 'pipedrive', ...BRAND.pipedrive, authType: 'BEARER' },
  { key: 'freshbooks', name: 'FreshBooks', provider: 'freshbooks', ...BRAND.freshbooks, authType: 'BEARER' },
  { key: 'zoho-crm', name: 'Zoho CRM', provider: 'zoho-crm', ...BRAND['zoho-crm'], authType: 'BEARER' },
  { key: 'zoho-books', name: 'Zoho Books', provider: 'zoho-books', ...BRAND['zoho-books'], authType: 'BEARER' },
  { key: 'zoho-desk', name: 'Zoho Desk', provider: 'zoho-desk', ...BRAND['zoho-desk'], authType: 'BEARER' },
  { key: 'zoho-projects', name: 'Zoho Projects', provider: 'zoho-projects', ...BRAND['zoho-projects'], authType: 'BEARER' },
];

function ServiceLogo({ service, size = 58 }: { service: ServiceCard; size?: number }) {
  const mark = BRAND[service.provider]?.mark ?? service.mark ?? service.name.slice(0, 2).toUpperCase();
  const fg = BRAND[service.provider]?.fg ?? service.fg ?? '#475467';
  return <div aria-label={`${service.name} logo`} title={service.name} className="grid shrink-0 place-items-center rounded-[10px] border border-white/80 bg-white shadow-[0_1px_3px_rgba(20,30,40,.08)]" style={{ width: size, height: size }}><span className={`${mark.length > 2 ? 'text-[13px]' : 'text-[27px]'} font-black leading-none tracking-[-.06em]`} style={{ color: fg }}>{mark}</span></div>;
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
      <nav className="mt-3">{item("default", ar ? "الخدمات الافتراضية" : "Default Services", SERVICE_CATALOG.length)}{item("custom", ar ? "الخدمات المخصصة" : "Custom Services", customCount || undefined)}</nav>
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'updated' | 'name'>('updated');
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
  const [draft, setDraft] = useState({ name: "", linkName: "", authType: "API_KEY", parameterKey: "", parameterLabel: "", secret: "", username: "", password: "", baseUrl: "", scopes: [] as string[] });
  const [customServices, setCustomServices] = useState<CustomConnectionService[]>([]);
  const [customDraft, setCustomDraft] = useState<CustomServiceDraft>({ name: "", key: "", authType: "API_KEY", parameterKey: "", parameterLabel: "", parameterType: "QUERY", baseUrl: "", oauthAuthUrl: "", oauthTokenUrl: "", oauthRevokeUrl: "", oauthClientId: "", oauthClientSecret: "", scopes: [], defaultScopes: [] });

  const reload = async () => {
    try { setConnections(await listConnections()); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load connections"); }
  };
  useEffect(() => { void listConnectionProviders().then(setProviders).catch(() => undefined); void listCustomConnectionServices().then(setCustomServices).catch(() => undefined); void reload(); }, []);

  const customCatalog = useMemo<ServiceCard[]>(() => customServices.map((s) => ({ key: s.provider, customId: s.id, name: s.name, provider: s.provider, mark: s.name.slice(0, 2).toUpperCase(), bg: '#F7F9FC', fg: '#475467', authType: s.authType, oauth: s.oauth, baseUrl: s.baseUrl ?? undefined, scopes: s.scopes, defaultScopes: s.defaultScopes, scopeGroups: s.scopeGroups })), [customServices]);
  const allServices = useMemo(() => [...SERVICE_CATALOG, ...customCatalog], [customCatalog]);
  const actualProviders = useMemo(() => new Set(providers.map((p) => p.key)), [providers]);
  const providerMap = useMemo(() => new Map(providers.map((p) => [p.key, p])), [providers]);
  const visibleServices = useMemo(() => {
    const q = serviceSearch.trim().toLowerCase();
    return allServices.filter((s) => !q || `${s.name} ${s.provider}`.toLowerCase().includes(q));
  }, [serviceSearch, allServices]);
  const serviceProvider = selectedService ? providers.find((p) => p.key === selectedService.provider) : undefined;
  const customProvider = selectedService?.customId ? customServices.find((s) => s.id === selectedService.customId) : undefined;
  const authTypes = serviceProvider?.authTypes ?? (customProvider ? [customProvider.authType] : (selectedService?.authType ? [selectedService.authType] : ['API_KEY']));
  const scopeOptions = serviceProvider?.scopes?.length ? serviceProvider.scopes : (customProvider?.scopes?.length ? customProvider.scopes : (selectedService?.scopes ?? []));
  const groupedScopeOptions = useMemo(() => scopeOptions.reduce<Record<string, ScopeDef[]>>((acc, item) => { const group = item.group ?? item.label.split(' — ')[0] ?? 'General'; (acc[group] ??= []).push(item); return acc; }, {}), [scopeOptions]);
  const configured = customProvider ? customProvider.configured : serviceProvider?.configured !== false;
  const secretField = draft.authType === "API_KEY" ? "apiKey" : draft.authType === "BEARER" ? "bearerToken" : draft.authType === "BASIC" ? "username" : draft.authType === "CUSTOM_HEADER" ? "customHeaders" : "";
  const myConnections = connections;
  const currentUserId = (() => { try { const raw = localStorage.getItem("workdrive_user"); return raw ? (JSON.parse(raw) as { id?: string; userId?: string }).id ?? (JSON.parse(raw) as { userId?: string }).userId : undefined; } catch { return undefined; } })();
  const sharedConnections = connections.filter((c) => currentUserId ? c.ownerId !== currentUserId : !c.canManage);
  const shownConnections = useMemo(() => {
    const source = view === "shared" ? sharedConnections : myConnections;
    const filtered = source.filter((c) => (!search || `${c.name} ${c.provider}`.toLowerCase().includes(search.toLowerCase())) && (!statusFilter || c.status === statusFilter) && (!providerFilter || c.provider === providerFilter));
    return [...filtered].sort((a, b) => sortOrder === "name" ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt));
  }, [view, sharedConnections, myConnections, search, statusFilter, providerFilter, sortOrder]);

  const beginCreate = (service: ServiceCard) => {
    setSelectedService(service);
    const meta = providerMap.get(service.provider);
    setDraft({ name: "", linkName: service.customId ? (customProvider?.linkName ?? service.provider) : service.provider, authType: meta?.authTypes?.[0] ?? customProvider?.authType ?? service.authType ?? "API_KEY", parameterKey: "", parameterLabel: "", secret: "", username: "", password: "", baseUrl: meta?.baseUrl ?? customProvider?.baseUrl ?? service.baseUrl ?? "", scopes: [...(meta?.defaultScopes ?? customProvider?.defaultScopes ?? service.defaultScopes ?? [])] });
    setAccordion("details");
    setError(""); setMessage(""); setView("create");
  };
  const openService = (service: ServiceCard) => { setSelectedService(service); setView("service"); setError(""); setMessage(""); };

  const create = async () => {
    if (!selectedService || !draft.name.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const secrets: Record<string, string> = {};
      if (draft.authType === "BASIC") { if (draft.username) secrets.username = draft.username; if (draft.password) secrets.password = draft.password; }
      else if (secretField && draft.secret) secrets[secretField] = draft.secret;
      const provider = selectedService.provider;
      const authType = draft.authType;
      if (selectedService.oauth && !configured) throw new Error(`${selectedService.name} OAuth is not configured. Configure the OAuth client for this service before connecting.`);
      const created = await createConnection({ name: draft.name.trim(), provider, authType, visibility: "PRIVATE", baseUrl: draft.baseUrl || undefined, scope: draft.scopes, metadata: { serviceName: selectedService.name, serviceLinkName: draft.linkName, parameterKey: draft.parameterKey, parameterLabel: draft.parameterLabel, serviceKey: selectedService.provider }, secrets: authType === "OAUTH2" ? {} : secrets });
      setMessage(ar ? "تم إنشاء الاتصال بنجاح." : "Connection created successfully.");
      await reload();
      if (selectedService.oauth) {
        const r = await startConnectionOAuth(selectedService.provider, undefined, created.id);
        window.location.href = r.url;
        return;
      }
      setView("my");
    } catch (e) { setError(e instanceof Error ? e.message : (ar ? "تعذر إنشاء الاتصال" : "Unable to create connection")); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => { if (!window.confirm(ar ? "حذف الاتصال؟" : "Delete this connection?")) return; setBusy(true); try { await deleteConnection(id); await reload(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to delete"); } finally { setBusy(false); } };
  const toggle = async (c: Connection) => { setBusy(true); try { if (c.status === "DISABLED") await enableConnection(c.id); else await disableConnection(c.id); await reload(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to update connection"); } finally { setBusy(false); } };
  const connectExisting = async (c: Connection) => { setBusy(true); try { if (c.status === 'DISABLED') { await enableConnection(c.id); c = { ...c, status: 'ACTIVE' }; } if (c.authType === "OAUTH2") { const r = await reconnectConnection(c.id); window.location.href = r.url; return; } const r = await testConnection(c.id); setMessage(r.ok ? (ar ? "بيانات الاتصال صالحة." : "Connection credentials are valid.") : "Connection test failed"); await reload(); } catch (e) { setError(e instanceof Error ? e.message : "Test failed"); } finally { setBusy(false); } };

  const inspectConnection = async (c: Connection) => { setInspect(c); setDiag(null); setShares([]); try { const [d, s] = await Promise.all([getConnectionDiagnostics(c.id), getConnectionShares(c.id)]); setDiag(d); setShares(s.shares || []); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load connection details"); } };
  const loadMembers = async () => { try { const m = await listWorkflowParticipants(); setMembers(m.map((x) => x.user)); } catch {} };
  const addShare = async () => { if (!inspect || !shareUser) return; setBusy(true); try { await shareConnection(inspect.id, shareUser, shareRole); setShares((await getConnectionShares(inspect.id)).shares || []); setShareUser(""); } catch (e) { setError(e instanceof Error ? e.message : "Unable to share connection"); } finally { setBusy(false); } };
  const removeShare = async (uid: string) => { if (!inspect) return; setBusy(true); try { await unshareConnection(inspect.id, uid); setShares((await getConnectionShares(inspect.id)).shares || []); } catch (e) { setError(e instanceof Error ? e.message : "Unable to remove share"); } finally { setBusy(false); } };

  const saveCustomService = async () => {
    if (!customDraft.name.trim() || !customDraft.key.trim()) return;
    setBusy(true); setError("");
    try {
      const created = await createCustomConnectionService({ name: customDraft.name.trim(), linkName: customDraft.key.trim(), authType: customDraft.authType, parameterKey: customDraft.parameterKey || undefined, parameterLabel: customDraft.parameterLabel || undefined, parameterType: customDraft.parameterType, baseUrl: customDraft.baseUrl || undefined, oauthAuthUrl: customDraft.oauthAuthUrl || undefined, oauthTokenUrl: customDraft.oauthTokenUrl || undefined, oauthRevokeUrl: customDraft.oauthRevokeUrl || undefined, oauthClientId: customDraft.oauthClientId || undefined, oauthClientSecret: customDraft.oauthClientSecret || undefined, scopes: customDraft.scopes, defaultScopes: customDraft.defaultScopes });
      setCustomServices((current) => [...current, created].sort((a,b) => a.name.localeCompare(b.name)));
      setMessage(ar ? 'تم إنشاء الخدمة المخصصة.' : 'Custom service created.');
      setView('custom');
    } catch (e) { setError(e instanceof Error ? e.message : (ar ? 'تعذر إنشاء الخدمة' : 'Unable to create service')); } finally { setBusy(false); }
  };

  const removeCustomService = async (service: CustomConnectionService) => {
    if (!window.confirm(ar ? `حذف الخدمة ${service.name}؟` : `Delete ${service.name}?`)) return;
    setBusy(true);
    try { await deleteCustomConnectionService(service.id); setCustomServices((current) => current.filter((x) => x.id !== service.id)); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete custom service'); } finally { setBusy(false); }
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
                  const supported = actualProviders.has(service.provider) || Boolean(service.customId);
                  const meta = providerMap.get(service.provider);
                  const customMeta = service.customId ? customServices.find((x) => x.id === service.customId) : undefined;
                  const isConfigured = !service.oauth || (customMeta ? customMeta.configured : meta?.configured !== false);
                  return <button type="button" key={service.key} onClick={() => openService(service)} className="group overflow-hidden rounded-[7px] border border-[#E3E8EF] text-start transition hover:-translate-y-[1px] hover:border-[#C7D3E1] hover:shadow-[0_7px_20px_rgba(31,41,55,.09)]" style={{ background: service.bg }}>
                    <div className="flex h-[166px] items-center justify-center"><ServiceLogo service={service} size={72} /></div>
                    <div className="min-h-[76px] border-t border-black/[.035] bg-white px-5 py-4"><div className="text-[14px] font-semibold text-[#202B38]">{service.name}</div><div className="mt-1 text-[12px] text-[#7A8491]">{!supported ? (ar ? "غير مفعّل" : "Not enabled") : service.oauth && !isConfigured ? (ar ? "يحتاج إعداد OAuth" : "OAuth setup required") : (ar ? "جاهز" : "Ready")}</div></div>
                  </button>;
                })}
              </div>
            </div>
          </>
        ) : null}

        {view === "service" && selectedService ? (
          <>
            <PageHeader title={selectedService.name} onBack={() => setView("default")} right={<button type="button" onClick={() => beginCreate(selectedService)} className="h-11 rounded-md bg-[#0B63E5] px-7 text-[14px] font-semibold text-white shadow-sm hover:bg-[#0958CB]">Create Connection</button>} />
            <div className="px-8 py-9"><div className="max-w-[980px] border-t border-[#E7EBF0] pt-8"><div className="grid grid-cols-2 gap-x-16 gap-y-12"><div><div className="text-[12px] uppercase text-[#7C8795]">SERVICE NAME</div><div className="mt-3 text-[20px] text-[#283444]">{selectedService.name}</div></div><div><div className="text-[12px] uppercase text-[#7C8795]">SERVICE LINK NAME</div><div className="mt-3 text-[20px] text-[#283444]">{selectedService.provider}</div></div><div><div className="text-[12px] uppercase text-[#7C8795]">SCOPES</div><div className="mt-3 text-[20px] text-[#283444]">{selectedService.oauth ? `${scopeOptions.length} OAuth scopes` : `${scopeOptions.length} configured scopes`}</div></div><div><div className="text-[12px] uppercase text-[#7C8795]">CONNECTIONS ASSOCIATED</div><div className="mt-3 text-[20px] text-[#283444]">{connections.filter((c) => c.provider === selectedService.provider).length ? "Yes" : "No"}</div></div>{customProvider?.oauthCallbackUrl ? <div className="col-span-2"><div className="text-[12px] uppercase text-[#7C8795]">OAUTH CALLBACK URL</div><div className="mt-3 break-all rounded-md bg-[#F8FAFC] p-3 font-mono text-[11px] text-[#475467]">{customProvider.oauthCallbackUrl}</div></div> : null}</div></div></div>
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
                {accordion === "service" ? <div className="border-t border-[#E7EDF2] bg-white p-6"><div className="mb-5 flex items-center gap-4"><ServiceLogo service={selectedService} size={44} /><span className="text-[17px] font-medium text-[#0B63E5]">{selectedService.name}</span></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{allServices.map((s) => <button key={s.key} type="button" onClick={() => { const meta = providerMap.get(s.provider); const custom = s.customId ? customServices.find((x) => x.id === s.customId) : undefined; setSelectedService(s); setDraft((d) => ({ ...d, authType: meta?.authTypes?.[0] ?? custom?.authType ?? s.authType ?? "API_KEY", linkName: custom?.linkName ?? s.provider, baseUrl: meta?.baseUrl ?? custom?.baseUrl ?? s.baseUrl ?? "", scopes: [...(meta?.defaultScopes ?? custom?.defaultScopes ?? s.defaultScopes ?? [])] })); setAccordion("details"); }} className={`flex items-center gap-3 rounded-[5px] border px-4 py-3 text-start transition ${selectedService.key === s.key ? "border-[#0B63E5] bg-[#F4F8FF]" : "border-[#E2E7EE] hover:border-[#B9C7D8]"}`}><ServiceLogo service={s} size={44} /><span><span className="block text-[12px] text-[#7B8794]">SERVICE NAME</span><span className="block text-[15px] text-[#1F2937]">{s.name}</span></span></button>)}</div></div> : null}
              </div>

              <div className="mt-3 overflow-hidden rounded-[5px] border border-[#DCE4EC]">
                <button type="button" onClick={() => setAccordion(accordion === "details" ? null : "details")} className={`flex w-full items-center justify-between px-6 py-5 text-start ${accordion === "details" ? "bg-white" : "bg-[#FBFCFD]"}`}><span className="text-[18px] font-medium text-[#1F2937]">2. Connection Details</span><span className={`text-[#697586] transition ${accordion === "details" ? "rotate-180" : ""}`}>⌄</span></button>
                {accordion === "details" ? <div className="border-t border-[#E7EDF2] p-7"><div className="grid grid-cols-1 gap-6 md:grid-cols-2"><label className="block"><span className="mb-2 block text-[14px] font-semibold text-[#1F2937]">Connection Name</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Enter Connection Name" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px] outline-none focus:border-[#0B63E5] focus:ring-2 focus:ring-[#0B63E5]/10" /></label><label className="block"><span className="mb-2 block text-[14px] font-semibold text-[#1F2937]">Connection Link Name</span><input value={draft.linkName} onChange={(e) => setDraft({ ...draft, linkName: e.target.value })} placeholder="Enter Connection Link Name" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px] outline-none focus:border-[#0B63E5] focus:ring-2 focus:ring-[#0B63E5]/10" /></label></div>
                  <div className="mt-6">
                    {!selectedService.oauth || !actualProviders.has(selectedService.provider) ? <div className="grid grid-cols-1 gap-6 md:grid-cols-2"><label className="block"><span className="mb-2 block text-[14px] font-semibold text-[#1F2937]">Authentication Type</span><select value={draft.authType} onChange={(e) => setDraft({ ...draft, authType: e.target.value })} className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] bg-white px-4 text-[14px] outline-none focus:border-[#0B63E5]">{authTypes.map((t) => <option key={t}>{t}</option>)}</select></label><label className="block"><span className="mb-2 block text-[14px] font-semibold text-[#1F2937]">Parameter Type</span><select className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] bg-white px-4 text-[14px]"><option>Query String</option><option>Header</option></select></label></div> : <div className="rounded-[5px] bg-[#F7FAFD] p-4 text-[13px] text-[#667085]">OAuth authentication will open in the provider authorization window after you create the connection.</div>}
                    {scopeOptions.length ? <div className="mt-6"><div className="mb-2 flex items-center justify-between"><div><div className="text-[14px] font-semibold text-[#1F2937]">Choose Scopes</div><div className="mt-1 text-[10px] text-[#7A8491]">Grouped provider permissions. Only selected permissions are sent to OAuth.</div></div><span className="rounded-full bg-[#F2F4F7] px-2 py-1 text-[10px] text-[#667085]">{draft.scopes.length} selected</span></div><div className="max-h-[430px] overflow-y-auto rounded-[5px] border border-[#D8E0E8]">{Object.entries(groupedScopeOptions).map(([group, items]) => <div key={group} className="border-b border-[#E5E7EB] last:border-0"><div className="sticky top-0 z-10 flex items-center justify-between bg-[#F8FAFC] px-4 py-2.5"><span className="text-[11px] font-bold uppercase tracking-[.05em] text-[#475467]">{group}</span><span className="text-[10px] text-[#98A2B3]">{items.filter((x) => draft.scopes.includes(x.value)).length}/{items.length}</span></div>{items.map((sc) => <label key={sc.value} className="flex cursor-pointer items-start gap-3 border-t border-[#F1F3F5] px-4 py-3 hover:bg-[#FAFCFE]"><input type="checkbox" className="mt-1 h-4 w-4 accent-[#0B63E5]" checked={draft.scopes.includes(sc.value)} onChange={(e) => setDraft((d) => ({ ...d, scopes: e.target.checked ? [...new Set([...d.scopes, sc.value])] : d.scopes.filter((x) => x !== sc.value) }))} /><span className="min-w-0"><span className="flex items-center gap-2"><span className="block text-[13px] font-medium text-[#1F2937]">{sc.label}</span>{sc.risk && sc.risk !== 'STANDARD' ? <span className="rounded-full bg-[#FFF4E5] px-2 py-0.5 text-[9px] font-semibold text-[#B54708]">{sc.risk}</span> : null}</span><span className="mt-0.5 block text-[11px] leading-5 text-[#7A8491]">{sc.description}</span><code className="mt-1 block break-all text-[9px] text-[#98A2B3]">{sc.value}</code></span></label>)}</div>)}</div></div> : null}
                  </div>
                  {!selectedService.oauth || !actualProviders.has(selectedService.provider) ? <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2"><label className="block"><span className="mb-2 block text-[14px] font-semibold text-[#1F2937]">Parameter Key</span><input value={draft.parameterKey} onChange={(e) => setDraft({ ...draft, parameterKey: e.target.value })} placeholder="Enter Key" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px] outline-none focus:border-[#0B63E5]" /></label><label className="block"><span className="mb-2 block text-[14px] font-semibold text-[#1F2937]">Parameter Display Name</span><input value={draft.parameterLabel} onChange={(e) => setDraft({ ...draft, parameterLabel: e.target.value })} placeholder="Enter Display Name" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px] outline-none focus:border-[#0B63E5]" /></label></div> : null}
                  {!selectedService.oauth || !actualProviders.has(selectedService.provider) ? <div className="mt-6">{draft.authType === "BASIC" ? <div className="grid grid-cols-1 gap-5 md:grid-cols-2"><label className="block"><span className="mb-2 block text-[14px] font-semibold text-[#1F2937]">Username</span><input value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} placeholder="Username / Account SID" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px] outline-none focus:border-[#0B63E5]" /></label><label className="block"><span className="mb-2 block text-[14px] font-semibold text-[#1F2937]">Password / Secret</span><input type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} placeholder="Password / Auth Token" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px] outline-none focus:border-[#0B63E5]" /></label></div> : <label className="block"><span className="mb-2 block text-[14px] font-semibold text-[#1F2937]">{draft.authType === "CUSTOM_HEADER" ? "Custom Headers (JSON)" : "Credential"}</span><input type="text" value={draft.secret} onChange={(e) => setDraft({ ...draft, secret: e.target.value })} placeholder={draft.authType === "CUSTOM_HEADER" ? '{"X-API-Key":"..."}' : "Enter value"} className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px] outline-none focus:border-[#0B63E5]" /></label>}{(selectedService.provider === "rest" || !actualProviders.has(selectedService.provider) || providerMap.get(selectedService.provider)?.capabilities?.includes("request")) ? <label className="mt-5 block"><span className="mb-2 block text-[14px] font-semibold text-[#1F2937]">Base URL</span><input value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} placeholder="https://api.example.com" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px] outline-none focus:border-[#0B63E5]" /></label> : null}</div> : null}
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
            <PageHeader title={view === "my" ? "My Connections" : "Shared Connections"} description={view === "my" ? "Connections created by you and the administrators of your organization are listed here. You can let other users utilize your connections." : "Connections shared with you by users in your organization."} right={<div className="flex items-center gap-3"><button type="button" onClick={() => document.getElementById("connection-search")?.focus()} className="grid h-11 w-11 place-items-center rounded-md bg-[#F7F9FC]" title="Search"><Icons.search size={20} /></button><button type="button" onClick={() => setFiltersOpen((v) => !v)} className={`grid h-11 w-11 place-items-center rounded-md ${filtersOpen ? "bg-[#EAF2FF] text-[#0B63E5]" : "bg-[#F7F9FC]"}`} title="Filter"><Icons.funnel size={19} /></button><button type="button" onClick={() => setView("default")} className="h-11 rounded-md bg-[#0B63E5] px-6 text-[14px] font-semibold text-white">Create Connection</button></div>} />
            <div className="px-8 py-7"><div className="mb-5 flex max-w-[420px] items-center gap-2 rounded-md border border-[#DCE3EC] px-3 py-2"><Icons.search size={16} /><input id="connection-search" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" placeholder="Search connections" /></div>{filtersOpen ? <div className="mb-5 grid grid-cols-1 gap-3 rounded-md border border-[#DCE3EC] bg-[#FBFCFE] p-4 md:grid-cols-4"><label className="text-[11px] font-semibold text-[#475467]">Provider<select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#D8E0E8] bg-white px-3 text-[12px]"><option value="">All providers</option>{providers.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select></label><label className="text-[11px] font-semibold text-[#475467]">Status<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#D8E0E8] bg-white px-3 text-[12px]"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="REAUTH_REQUIRED">Re-auth required</option><option value="DISABLED">Disabled</option><option value="ERROR">Error</option></select></label><label className="text-[11px] font-semibold text-[#475467]">Sort<select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'updated' | 'name')} className="mt-1 h-10 w-full rounded-md border border-[#D8E0E8] bg-white px-3 text-[12px]"><option value="updated">Recently updated</option><option value="name">Name A–Z</option></select></label><button type="button" onClick={() => { setSearch(''); setProviderFilter(''); setStatusFilter(''); setSortOrder('updated'); }} className="self-end h-10 rounded-md border border-[#D8E0E8] bg-white px-4 text-[12px] text-[#475467]">Clear filters</button></div> : null}
              {shownConnections.length === 0 ? <div className="grid min-h-[470px] place-items-center rounded-md border border-dashed border-[#DCE4EC] bg-[#FCFDFE] text-center"><div><div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#F1F5F9] text-[#9AA6B2]"><Icons.link size={35} /></div><div className="mt-5 text-[19px] font-medium text-[#2A3441]">You Don't Have any {view === "my" ? "Connections" : "Shared Connections"} yet</div><div className="mx-auto mt-2 max-w-[600px] text-[13px] leading-6 text-[#7B8794]">{view === "my" ? "Create a connection to securely store credentials and use them from your automation tasks." : "Connections shared with you by other members will appear on this page."}</div></div></div> : <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">{shownConnections.map((c) => { const service = allServices.find((s) => s.provider === c.provider) ?? { key: c.provider, name: c.provider, provider: c.provider, mark: c.provider.slice(0, 2).toUpperCase(), bg: "#F6F8FA", fg: "#475467" }; return <article key={c.id} onMouseEnter={() => setHovered(c.id)} onMouseLeave={() => setHovered(null)} className="group relative overflow-hidden rounded-[7px] border border-[#DCE3EA] bg-white transition hover:-translate-y-[1px] hover:shadow-[0_8px_24px_rgba(31,41,55,.10)]"><div className="relative flex h-[145px] items-center justify-center" style={{ background: service.bg }}><ServiceLogo service={service as ServiceCard} size={68} />{hovered === c.id ? <div className="absolute inset-x-0 top-0 flex justify-end gap-1 p-3"><button type="button" onClick={() => inspectConnection(c)} className="grid h-8 w-8 place-items-center rounded-md bg-white/95 text-[#475467] shadow-sm hover:bg-white"><Icons.pencil size={14} /></button><button type="button" onClick={() => void remove(c.id)} className="grid h-8 w-8 place-items-center rounded-md bg-white/95 text-[#B42318] shadow-sm hover:bg-white"><Icons.trash size={14} /></button></div> : null}{hovered === c.id ? <button type="button" onClick={() => void connectExisting(c)} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[4px] bg-[#27AE60] px-6 py-2.5 text-[14px] font-semibold text-white shadow-sm">Connect</button> : null}</div><div className="min-h-[88px] border-t border-[#EEF1F4] px-5 py-4"><div className="flex items-center justify-between gap-2"><div className="text-[14px] font-semibold text-[#253140]">{c.name}</div><span className={`h-2.5 w-2.5 rounded-full ${c.status === "ACTIVE" ? "bg-[#22C55E]" : c.status === "REAUTH_REQUIRED" ? "bg-[#F59E0B]" : "bg-[#94A3B8]"}`} /></div><div className="mt-1 text-[12px] text-[#7A8491]">{providerMap.get(c.provider)?.name ?? c.provider} · {c.authType}</div></div></article>; })}</div>}
            </div>
          </>
        ) : null}

        {view === "system" ? <><PageHeader title="System Connections" description="Connections created automatically by built-in services are available here." /><div className="grid min-h-[620px] place-items-center px-8"><div className="text-center"><div className="mx-auto grid h-32 w-32 place-items-center rounded-full bg-[#F6F8FB] text-[#8FA0B2]"><Icons.link size={58} /></div><h2 className="mt-7 text-[22px] font-medium text-[#1F2937]">You Don't Have any System Connections yet</h2><p className="mx-auto mt-3 max-w-[640px] text-[13px] leading-6 text-[#7B8794]">When you execute a built-in service task without a connection, the system can automatically create one in the backend. Such system connections will be available on this page.</p></div></div></> : null}

        {view === "custom" ? <><PageHeader title="Custom Services" description="Create custom service definitions and then create connections from them." right={<button type="button" onClick={() => { setCustomDraft({ name: "", key: "", authType: "API_KEY", parameterKey: "", parameterLabel: "", parameterType: "QUERY", baseUrl: "", oauthAuthUrl: "", oauthTokenUrl: "", oauthRevokeUrl: "", oauthClientId: "", oauthClientSecret: "", scopes: [], defaultScopes: [] }); setView("custom-create"); }} className="h-11 rounded-md bg-[#0B63E5] px-6 text-[14px] font-semibold text-white">Create New Service</button>} /><div className="px-8 py-8"><div className="grid grid-cols-1 gap-4 xl:grid-cols-3"><button type="button" onClick={() => { setCustomDraft({ name: "", key: "", authType: "API_KEY", parameterKey: "", parameterLabel: "", parameterType: "QUERY", baseUrl: "", oauthAuthUrl: "", oauthTokenUrl: "", oauthRevokeUrl: "", oauthClientId: "", oauthClientSecret: "", scopes: [], defaultScopes: [] }); setView("custom-create"); }} className="flex h-[170px] items-center justify-center rounded-[7px] border border-[#0B63E5] bg-white text-[#0B63E5] hover:bg-[#F7FAFF]"><span className="mr-3 grid h-12 w-12 place-items-center rounded-full border border-dashed border-[#0B63E5] text-[28px]">+</span><span className="text-[16px] font-medium">Create New Service</span></button>{customServices.map((s) => <div key={s.id} className="relative rounded-[7px] border border-[#DCE3EA] bg-white p-5 hover:shadow-sm"><button type="button" onClick={() => { const svc: ServiceCard = { key: s.provider, customId: s.id, name: s.name, provider: s.provider, mark: s.name.slice(0, 2).toUpperCase(), bg: "#F7FAFE", fg: "#475467", authType: s.authType, oauth: s.oauth, baseUrl: s.baseUrl ?? undefined, scopes: s.scopes, defaultScopes: s.defaultScopes, scopeGroups: s.scopeGroups }; setSelectedService(svc); setView("service"); }} className="w-full text-start"><div className="flex items-center gap-3"><ServiceLogo service={{ key: s.provider, name: s.name, provider: s.provider, mark: s.name.slice(0, 2).toUpperCase(), bg: "#F7FAFE", fg: "#475467" }} size={55} /><div><div className="text-[15px] font-semibold">{s.name}</div><div className="mt-1 text-[12px] text-[#7A8491]">{s.linkName} · {s.authType}</div></div></div></button><button type="button" onClick={() => void removeCustomService(s)} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-md text-[#B42318] hover:bg-[#FFF3F2]"><Icons.trash size={14} /></button></div>)}</div></div></> : null}

        {view === "custom-create" ? <><PageHeader title="Create Service" description="Provide the following service details and click Create Service. Once configured, you can create multiple connections based on this service." onBack={() => setView("custom")} /><div className="px-8 py-7 pb-12"><div className="max-w-[980px]"><div className="text-[13px] font-semibold text-[#263342]">SERVICE DETAILS</div><div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2"><label><span className="mb-2 block text-[14px] font-semibold">Service Name <b className="text-[#E11D48]">*</b></span><input value={customDraft.name} onChange={(e) => setCustomDraft({ ...customDraft, name: e.target.value })} placeholder="Enter Service Name" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px]" /></label><label><span className="mb-2 block text-[14px] font-semibold">Service Link Name <b className="text-[#E11D48]">*</b></span><input value={customDraft.key} onChange={(e) => setCustomDraft({ ...customDraft, key: e.target.value })} placeholder="Enter Service Link Name" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px]" /></label></div><div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2"><label><span className="mb-2 block text-[14px] font-semibold">Authentication Type</span><select value={customDraft.authType} onChange={(e) => setCustomDraft({ ...customDraft, authType: e.target.value as CustomServiceDraft["authType"] })} className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] bg-white px-4 text-[14px]"><option value="OAUTH2">OAuth 2.0</option><option value="API_KEY">API Key</option><option value="BEARER">Bearer Token</option><option value="BASIC">Basic Auth</option><option value="CUSTOM_HEADER">Custom Header</option><option value="NONE">No Authentication</option></select></label><label><span className="mb-2 block text-[14px] font-semibold">Parameter Type</span><select value={customDraft.parameterType} onChange={(e) => setCustomDraft({ ...customDraft, parameterType: e.target.value as CustomServiceDraft["parameterType"] })} className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] bg-white px-4 text-[14px]"><option value="QUERY">Query String</option><option value="HEADER">Header</option></select></label></div>{customDraft.authType === 'OAUTH2' ? <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2"><label><span className="mb-2 block text-[14px] font-semibold">Authorization URL *</span><input value={customDraft.oauthAuthUrl} onChange={(e) => setCustomDraft({ ...customDraft, oauthAuthUrl: e.target.value })} placeholder="https://provider.example.com/oauth/authorize" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px]" /></label><label><span className="mb-2 block text-[14px] font-semibold">Token URL *</span><input value={customDraft.oauthTokenUrl} onChange={(e) => setCustomDraft({ ...customDraft, oauthTokenUrl: e.target.value })} placeholder="https://provider.example.com/oauth/token" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px]" /></label><label><span className="mb-2 block text-[14px] font-semibold">Client ID *</span><input value={customDraft.oauthClientId} onChange={(e) => setCustomDraft({ ...customDraft, oauthClientId: e.target.value })} className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px]" /></label><label><span className="mb-2 block text-[14px] font-semibold">Client Secret *</span><input type="password" value={customDraft.oauthClientSecret} onChange={(e) => setCustomDraft({ ...customDraft, oauthClientSecret: e.target.value })} className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px]" /></label><label><span className="mb-2 block text-[14px] font-semibold">Revoke URL</span><input value={customDraft.oauthRevokeUrl} onChange={(e) => setCustomDraft({ ...customDraft, oauthRevokeUrl: e.target.value })} className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px]" /></label><label><span className="mb-2 block text-[14px] font-semibold">Base URL</span><input value={customDraft.baseUrl} onChange={(e) => setCustomDraft({ ...customDraft, baseUrl: e.target.value })} placeholder="https://api.provider.example.com" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px]" /></label></div> : null}<div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2"><label><span className="mb-2 block text-[14px] font-semibold">Parameter Key <b className="text-[#E11D48]">*</b></span><input value={customDraft.parameterKey} onChange={(e) => setCustomDraft({ ...customDraft, parameterKey: e.target.value })} placeholder="Enter Key" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px]" /></label><label><span className="mb-2 block text-[14px] font-semibold">Parameter Display Name <b className="text-[#E11D48]">*</b></span><input value={customDraft.parameterLabel} onChange={(e) => setCustomDraft({ ...customDraft, parameterLabel: e.target.value })} placeholder="Enter Display Name" className="h-[54px] w-full rounded-[5px] border border-[#D8E0E8] px-4 text-[14px]" /></label></div><div className="mt-7 rounded-[7px] border border-[#DCE4EC] bg-white p-5"><div className="flex items-center justify-between"><div><div className="text-[15px] font-semibold">Scopes</div><div className="mt-1 text-[11px] text-[#7A8491]">Add the provider's real OAuth scopes and group them like Zoho.</div></div><button type="button" onClick={() => setCustomDraft((d) => ({ ...d, scopes: [...d.scopes, { value: `scope_${d.scopes.length + 1}`, label: 'New scope', description: '', group: 'General', risk: 'STANDARD' }] }))} className="rounded-md bg-[#EEF4FF] px-3 py-2 text-[11px] font-semibold text-[#0B63E5]">+ Add Scope</button></div><div className="mt-4 space-y-3">{customDraft.scopes.map((sc, i) => <div key={`${i}-${sc.value}`} className="grid gap-2 rounded-md border border-[#E5E7EB] p-3 md:grid-cols-12"><input value={sc.group ?? 'General'} onChange={(e) => setCustomDraft((d) => ({ ...d, scopes: d.scopes.map((x,j) => j===i ? { ...x, group:e.target.value } : x) }))} placeholder="Group" className="h-9 rounded border px-2 text-[11px] md:col-span-2" /><input value={sc.label} onChange={(e) => setCustomDraft((d) => ({ ...d, scopes: d.scopes.map((x,j) => j===i ? { ...x, label:e.target.value } : x) }))} placeholder="Label" className="h-9 rounded border px-2 text-[11px] md:col-span-2" /><input value={sc.value} onChange={(e) => setCustomDraft((d) => ({ ...d, scopes: d.scopes.map((x,j) => j===i ? { ...x, value:e.target.value } : x) }))} placeholder="scope value" className="h-9 rounded border px-2 text-[11px] md:col-span-4" /><input value={sc.description} onChange={(e) => setCustomDraft((d) => ({ ...d, scopes: d.scopes.map((x,j) => j===i ? { ...x, description:e.target.value } : x) }))} placeholder="Description" className="h-9 rounded border px-2 text-[11px] md:col-span-3" /><label className="flex items-center gap-1 text-[10px] md:col-span-1"><input type="checkbox" checked={customDraft.defaultScopes.includes(sc.value)} onChange={(e) => setCustomDraft((d) => ({ ...d, defaultScopes: e.target.checked ? [...new Set([...d.defaultScopes, sc.value])] : d.defaultScopes.filter((x) => x !== sc.value) }))} />Default</label></div>)}</div></div><div className="mt-7 rounded-[7px] border border-[#DCE4EC] bg-[#FAFCFE] p-5"><div className="flex items-center justify-between"><div className="text-[15px] font-semibold">Advanced Configuration</div><Icons.chevD size={18} /></div><div className="mt-6 flex items-center gap-4"><span className="text-[13px] text-[#6B7280]">Dynamic Parameters</span><span className="h-3 w-3 rounded-full bg-[#9CA3AF]" /></div><div className="mt-4 flex items-center gap-3"><span className="relative inline-flex h-6 w-11 rounded-full bg-[#E5E7EB]"><span className="absolute start-1 top-1 h-4 w-4 rounded-full bg-white shadow" /></span><span className="text-[13px]">Yes</span></div></div><div className="mt-8 flex gap-3"><button type="button" onClick={saveCustomService} disabled={!customDraft.name.trim() || !customDraft.key.trim() || ((customDraft.authType === "API_KEY" || customDraft.authType === "CUSTOM_HEADER") && (!customDraft.parameterKey.trim() || !customDraft.parameterLabel.trim())) || (customDraft.authType === "OAUTH2" && (!customDraft.oauthAuthUrl.trim() || !customDraft.oauthTokenUrl.trim() || !customDraft.oauthClientId.trim() || !customDraft.oauthClientSecret.trim()))} className="h-12 rounded-[5px] bg-[#0B63E5] px-7 text-[14px] font-semibold text-white disabled:opacity-50">Create Service</button><button type="button" onClick={() => setView("custom")} className="h-12 rounded-[5px] bg-[#EEF1F4] px-7 text-[14px] text-[#475467]">Cancel</button></div></div></div></> : null}

        {message && view !== "create" ? <div className="fixed bottom-5 end-5 z-[200] max-w-[420px] rounded-md bg-[#ECFDF3] px-5 py-3 text-[12px] text-[#067647] shadow-lg">{message}</div> : null}
        {error && view !== "create" ? <div className="fixed bottom-5 end-5 z-[200] max-w-[420px] rounded-md bg-[#FFF3F2] px-5 py-3 text-[12px] text-[#B42318] shadow-lg">{error}</div> : null}
      </main>

      {inspect ? <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0F172A]/45 p-5"><div className="max-h-[90vh] w-[min(860px,96vw)] overflow-y-auto rounded-lg bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><div className="text-[20px] font-semibold text-[#1F2937]">{inspect.name}</div><div className="mt-1 text-[12px] text-[#7B8794]">{inspect.provider} · {inspect.authType} · {inspect.status}</div></div><button type="button" onClick={() => setInspect(null)} className="grid h-9 w-9 place-items-center rounded-md hover:bg-[#F2F4F7]">×</button></div>{diag ? <div className="mt-5 grid gap-3 md:grid-cols-3"><div className="rounded-md border border-[#E4E7EC] p-4"><div className="text-[10px] uppercase tracking-[.05em] text-[#98A2B3]">Service</div><div className="mt-2 text-[13px] font-semibold text-[#253140]">{providerMap.get(inspect.provider)?.name ?? customServices.find((x) => x.provider === inspect.provider)?.name ?? inspect.provider}</div></div><div className="rounded-md border border-[#E4E7EC] p-4"><div className="text-[10px] uppercase tracking-[.05em] text-[#98A2B3]">Authentication</div><div className="mt-2 text-[13px] font-semibold text-[#253140]">{inspect.authType}</div></div><div className="rounded-md border border-[#E4E7EC] p-4"><div className="text-[10px] uppercase tracking-[.05em] text-[#98A2B3]">Scopes</div><div className="mt-2 text-[13px] font-semibold text-[#253140]">{inspect.scope ? inspect.scope.split(/\s+/).filter(Boolean).length : 0} selected</div></div></div>{inspect.scope ? <div className="mt-3 rounded-md border border-[#E4E7EC] p-4"><div className="text-[11px] font-semibold text-[#475467]">Selected scopes</div><div className="mt-2 flex flex-wrap gap-2">{inspect.scope.split(/\s+/).filter(Boolean).map((scope) => <code key={scope} className="max-w-full break-all rounded bg-[#F8FAFC] px-2 py-1 text-[9px] text-[#667085]">{scope}</code>)}</div></div> : null}{inspect.baseUrl ? <div className="mt-3 rounded-md border border-[#E4E7EC] p-4"><div className="text-[11px] font-semibold text-[#475467]">Base URL</div><code className="mt-2 block break-all text-[10px] text-[#667085]">{inspect.baseUrl}</code></div> : null}<div className="mt-6 grid gap-4 md:grid-cols-2"><div className="rounded-md bg-[#F8FAFC] p-4"><div className="text-[13px] font-semibold">Diagnostics</div><div className="mt-3 space-y-2 text-[12px]">{Object.entries(diag.checks || {}).map(([k, v]) => <div key={k}>{v ? "✓" : "✕"} {k}</div>)}</div></div><div className="rounded-md bg-[#F8FAFC] p-4"><div className="text-[13px] font-semibold">Usage</div><div className="mt-3 text-[12px]">{diag.usageCount} operations · {diag.averageDurationMs ? Math.round(diag.averageDurationMs) : 0} ms avg.</div><div className="mt-2 text-[11px] text-[#7B8794]">{diag.errorCode || ""} {diag.errorMessage || ""}</div></div></div> : null}<div className="mt-5 rounded-md border border-[#E4E7EC] p-4"><div className="text-[13px] font-semibold">Sharing</div>{inspect.canManage ? <><div className="mt-3 grid gap-3 md:grid-cols-[1fr_130px_auto]"><select value={shareUser} onFocus={() => void loadMembers()} onChange={(e) => setShareUser(e.target.value)} className="h-10 rounded-md border border-[#D8E0E8] px-3 text-[12px]"><option value="">Select member</option>{members.filter((m) => m.id !== inspect.ownerId && !shares.some((x) => x.userId === m.id)).map((m) => <option key={m.id} value={m.id}>{m.name || m.email} · {m.email}</option>)}</select><select value={shareRole} onChange={(e) => setShareRole(e.target.value as "USE" | "MANAGE")} className="h-10 rounded-md border border-[#D8E0E8] px-3 text-[12px]"><option value="USE">USE</option><option value="MANAGE">MANAGE</option></select><button type="button" onClick={() => void addShare()} className="rounded-md bg-[#0B63E5] px-4 text-[12px] font-semibold text-white">Share</button></div></> : null}<div className="mt-4 space-y-2">{shares.map((s) => <div key={s.id} className="flex items-center justify-between rounded-md bg-[#F8FAFC] px-3 py-2 text-[11px]"><span>{s.user?.name || s.user?.email} · {s.role}</span>{inspect.canManage ? <button type="button" onClick={() => void removeShare(s.userId)} className="text-[#B42318]">Remove</button> : null}</div>)}</div></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => void toggle(inspect)} className="rounded-md border border-[#D8E0E8] px-4 py-2 text-[12px]">{inspect.status === "DISABLED" ? "Enable" : "Disable"}</button>{inspect.authType === "OAUTH2" ? <button type="button" onClick={() => void connectExisting(inspect)} className="rounded-md border border-[#D8E0E8] px-4 py-2 text-[12px]">Reconnect</button> : null}<button type="button" onClick={() => setInspect(null)} className="rounded-md bg-[#0B63E5] px-5 py-2 text-[12px] font-semibold text-white">Close</button></div></div></div> : null}
    </div>
  );
}
