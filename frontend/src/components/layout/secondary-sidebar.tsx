"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "../locale-provider";
import { Icons } from "./icons";

type Item = { href: string; labelKey: "templates.all" | "templates.myTemplates" | "templates.documents" | "templates.spreadsheets" | "templates.presentations" | "workflows.all" | "workflows.mine" | "workflows.drafts" | "workflows.runs" | "workflows.waiting"; icon: keyof typeof Icons };

export function SecondarySidebar({ section }: { section: "templates" | "workflows" }) {
  const pathname = usePathname();
  const { label } = useLocale();
  const items: Item[] = section === "templates" ? [
    { href: "/files/templates", labelKey: "templates.all", icon: "layout" },
    { href: "/files/templates?category=my", labelKey: "templates.myTemplates", icon: "users" },
    { href: "/files/templates?category=documents", labelKey: "templates.documents", icon: "doc" },
    { href: "/files/templates?category=spreadsheets", labelKey: "templates.spreadsheets", icon: "sheet" },
    { href: "/files/templates?category=presentations", labelKey: "templates.presentations", icon: "slide" },
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
          const hrefBase = item.href.split("?")[0];
          const active = pathname === hrefBase && (item.labelKey === (section === "templates" ? "templates.all" : "workflows.all"));
          const Icon = Icons[item.icon];
          return <Link key={item.href} href={item.href} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] ${active ? "bg-[var(--wd-active)] font-medium text-[var(--wd-primary-ink)]" : "text-slate-600 hover:bg-slate-100"}`}><Icon size={15}/><span>{label(item.labelKey)}</span></Link>;
        })}
      </nav>
    </aside>
  );
}
