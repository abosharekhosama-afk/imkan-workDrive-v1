"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale } from "../locale-provider";
import { Icons } from "./icons";

type Item = { href: string; labelKey: "templates.all" | "templates.myTemplates" | "templates.documents" | "templates.spreadsheets" | "templates.presentations" | "workflows.all" | "workflows.mine" | "workflows.drafts" | "workflows.runs" | "workflows.waiting"; icon: keyof typeof Icons };

function templateItemActive(labelKey: Item["labelKey"], params: URLSearchParams): boolean {
  const library = params.get("library");
  const type = params.get("type");
  if (labelKey === "templates.all") return !library && !type;
  if (labelKey === "templates.myTemplates") return library === "PERSONAL" && !type;
  if (labelKey === "templates.documents") return type === "DOCUMENT";
  if (labelKey === "templates.spreadsheets") return type === "SPREADSHEET";
  if (labelKey === "templates.presentations") return type === "PRESENTATION";
  return false;
}

function workflowItemActive(labelKey: Item["labelKey"], pathname: string, params: URLSearchParams): boolean {
  const scope = params.get("scope");
  if (labelKey === "workflows.all") return pathname === "/files/workflows" && !scope;
  if (labelKey === "workflows.mine") return scope === "mine";
  if (labelKey === "workflows.drafts") return scope === "drafts";
  if (labelKey === "workflows.runs") return pathname.startsWith("/files/workflows/runs");
  if (labelKey === "workflows.waiting") return pathname.startsWith("/files/workflows/tasks");
  return false;
}

export function SecondarySidebar({ section }: { section: "templates" | "workflows" }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { label } = useLocale();
  const items: Item[] = section === "templates" ? [
    { href: "/files/templates", labelKey: "templates.all", icon: "layout" },
    { href: "/files/templates?library=PERSONAL", labelKey: "templates.myTemplates", icon: "users" },
    { href: "/files/templates?type=DOCUMENT", labelKey: "templates.documents", icon: "doc" },
    { href: "/files/templates?type=SPREADSHEET", labelKey: "templates.spreadsheets", icon: "sheet" },
    { href: "/files/templates?type=PRESENTATION", labelKey: "templates.presentations", icon: "slide" },
  ] : [
    { href: "/files/workflows", labelKey: "workflows.all", icon: "flow" },
    { href: "/files/workflows?scope=mine", labelKey: "workflows.mine", icon: "users" },
    { href: "/files/workflows?scope=drafts", labelKey: "workflows.drafts", icon: "pencil" },
    { href: "/files/workflows/tasks", labelKey: "workflows.waiting", icon: "flow" },
    { href: "/files/workflows/runs", labelKey: "workflows.runs", icon: "history" },
  ];
  return (
    <aside className="hidden w-56 shrink-0 border-e border-[color:var(--imkan-color-border)] bg-[#FAFBFD] lg:flex lg:flex-col" aria-label={section === "templates" ? label("nav.templates") : label("nav.workflows")}>
      <div className="border-b border-[color:var(--imkan-color-border)] px-4 py-4">
        <h2 className="text-[13px] font-semibold text-slate-900">{section === "templates" ? label("templates.title") : label("workflows.title")}</h2>
        <p className="mt-1 text-[11.5px] leading-5 text-slate-500">{section === "templates" ? label("templates.description") : label("workflows.description")}</p>
      </div>
      <nav className="flex flex-col gap-1 p-2" aria-label="secondary">
        {items.map((item) => {
          const active = section === "templates"
            ? templateItemActive(item.labelKey, searchParams)
            : workflowItemActive(item.labelKey, pathname, searchParams);
          const Icon = Icons[item.icon];
          return <Link key={item.href} href={item.href} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] ${active ? "bg-[var(--wd-active)] font-medium text-[var(--wd-primary-ink)]" : "text-slate-600 hover:bg-slate-100"}`}><Icon size={15}/><span>{label(item.labelKey)}</span></Link>;
        })}
      </nav>
    </aside>
  );
}
