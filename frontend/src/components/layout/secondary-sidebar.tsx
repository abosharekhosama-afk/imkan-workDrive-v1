"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale } from "../locale-provider";
import { Icons } from "./icons";
import { buildWorkflowSecondaryItems } from "../workflow-nav-logic";

type TemplateItem = { href: string; labelKey: "templates.all" | "templates.myTemplates" | "templates.documents" | "templates.spreadsheets" | "templates.presentations"; icon: keyof typeof Icons };

function templateItemActive(labelKey: TemplateItem["labelKey"], params: URLSearchParams): boolean {
  const library = params.get("library");
  const type = params.get("type");
  if (labelKey === "templates.all") return !library && !type;
  if (labelKey === "templates.myTemplates") return library === "PERSONAL" && !type;
  if (labelKey === "templates.documents") return type === "DOCUMENT";
  if (labelKey === "templates.spreadsheets") return type === "SPREADSHEET";
  if (labelKey === "templates.presentations") return type === "PRESENTATION";
  return false;
}

function workflowItemActive(labelKey: ReturnType<typeof buildWorkflowSecondaryItems>[number]["labelKey"], pathname: string, params: URLSearchParams): boolean {
  const scope = params.get("scope");
  if (labelKey === "workflows.all") return pathname === "/files/workflows" && !scope;
  if (labelKey === "workflows.drafts") return scope === "drafts";
  if (labelKey === "workflows.runs") return pathname.startsWith("/files/workflows/runs");
  return false;
}

export function SecondarySidebar({ section }: { section: "templates" | "workflows" }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { label } = useLocale();
  const templateItems: TemplateItem[] = [
    { href: "/files/templates", labelKey: "templates.all", icon: "layout" },
    { href: "/files/templates?library=PERSONAL", labelKey: "templates.myTemplates", icon: "users" },
    { href: "/files/templates?type=DOCUMENT", labelKey: "templates.documents", icon: "doc" },
    { href: "/files/templates?type=SPREADSHEET", labelKey: "templates.spreadsheets", icon: "sheet" },
    { href: "/files/templates?type=PRESENTATION", labelKey: "templates.presentations", icon: "slide" },
  ];
  const workflowItems = buildWorkflowSecondaryItems();
  const items = section === "templates" ? templateItems : workflowItems;

  return (
    <aside data-overlay-bound="sidebar" className="secondary-sidebar hidden w-56 shrink-0 border-e border-[color:var(--imkan-color-border)] bg-[#FAFBFD] lg:flex lg:flex-col" aria-label={section === "templates" ? label("nav.templates") : label("nav.workflows")}>
      <div className="border-b border-[color:var(--imkan-color-border)] px-4 py-4">
        <h2 className="text-[13px] font-semibold text-slate-900">{section === "templates" ? label("templates.title") : label("workflows.title")}</h2>
        <p className="mt-1 text-[11.5px] leading-5 text-slate-500">{section === "templates" ? label("templates.description") : label("workflows.description")}</p>
      </div>
      <nav className="flex flex-col gap-1 p-2" aria-label="secondary">
        {items.map((item) => {
          const active = section === "templates"
            ? templateItemActive(item as TemplateItem, searchParams)
            : workflowItemActive((item as ReturnType<typeof buildWorkflowSecondaryItems>[number]).labelKey, pathname, searchParams);
          const Icon = Icons[item.icon];
          return <Link key={item.href} href={item.href} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] ${active ? "bg-[var(--wd-active)] font-medium text-[var(--wd-primary-ink)]" : "text-slate-600 hover:bg-slate-100"}`}><Icon size={15}/><span>{label(item.labelKey)}</span></Link>;
        })}
      </nav>
    </aside>
  );
}
