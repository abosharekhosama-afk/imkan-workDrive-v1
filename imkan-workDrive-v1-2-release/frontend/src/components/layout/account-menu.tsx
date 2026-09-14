"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "../locale-provider";
import { clearSession, logout as apiLogout } from "../../lib/api/auth";
import { Icons } from "./icons";
export function AccountMenu({ name }: { name: string }) {
  const { label } = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const initials = (name || "U").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open ]);
  async function out() {
    const token = localStorage.getItem("workdrive_access_token");
    try { if (token) await apiLogout(token); } catch { /* noop */ }
    finally { clearSession(); router.replace("/auth/login"); }
  }
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" aria-label={name || label("brand.workspace")}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-800">{initials}</button>
      {open ? (
        <div className="absolute end-0 top-full z-50 mt-1 w-52 rounded-lg border border-slate-200 bg-white p-1 shadow-xl" role="menu">
          <div className="truncate px-3 py-2 text-[13px] font-medium">{name || "User"}</div>
          <div className="border-t border-slate-100" />
          <a href="/settings" role="menuitem" onClick={() => setOpen(false)} className="block rounded px-3 py-2 text-[13px] hover:bg-slate-50">{label("nav.settings")}</a>
          <a href="/notifications" role="menuitem" onClick={() => setOpen(false)} className="block rounded px-3 py-2 text-[13px] hover:bg-slate-50">{label("nav.notifications")}</a>
          <button type="button" role="menuitem" onClick={() => void out()} className="block w-full rounded px-3 py-2 text-start text-[13px] hover:bg-slate-50">{label("nav.signOut")}</button>
        </div>
      ) : null}
    </div>
  );
}
