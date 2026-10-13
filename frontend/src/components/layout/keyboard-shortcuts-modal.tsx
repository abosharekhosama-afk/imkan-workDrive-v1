"use client";

import { useEffect } from "react";
import { useLocale } from "../locale-provider";
import { Icons } from "./icons";

type Props = { open: boolean; onClose: () => void };

const sections: { title: string; titleAr: string; items: { action: string; actionAr: string; keys: string }[] }[] = [
  {
    title: "Selection", titleAr: "التحديد",
    items: [
      { action: "Select all items", actionAr: "تحديد كل العناصر", keys: "Ctrl A" },
      { action: "Select down item", actionAr: "تحديد العنصر للأسفل", keys: "↓" },
      { action: "Select up item", actionAr: "تحديد العنصر للأعلى", keys: "↑" },
      { action: "Extend Selection down", actionAr: "توسيع التحديد للأسفل", keys: "Ctrl / Shift ↓" },
      { action: "Extend Selection up", actionAr: "توسيع التحديد للأعلى", keys: "Ctrl / Shift ↑" },
      { action: "Deselect all", actionAr: "إلغاء تحديد الكل", keys: "Esc" },
      { action: "Open File/Folder", actionAr: "فتح ملف/مجلد", keys: "Enter" },
    ],
  },
  {
    title: "Create and Upload", titleAr: "إنشاء ورفع",
    items: [
      { action: "Create Team Folder", actionAr: "إنشاء مجلد فريق", keys: "Ctrl K" },
      { action: "Create New Folder", actionAr: "إنشاء مجلد جديد", keys: "Shift F" },
      { action: "Upload file", actionAr: "رفع ملف", keys: "Ctrl Shift F" },
      { action: "Upload folder", actionAr: "رفع مجلد", keys: "Ctrl Shift U" },
      { action: "Create document", actionAr: "إنشاء مستند", keys: "Shift T" },
      { action: "Create sheet", actionAr: "إنشاء جدول", keys: "Shift S" },
      { action: "Create show", actionAr: "إنشاء عرض", keys: "Shift P" },
      { action: "Create markdown file", actionAr: "إنشاء ملف ماركداون", keys: "Shift M" },
      { action: "Paste files to upload", actionAr: "لصق ملفات للرفع", keys: "Ctrl + V" },
    ],
  },
  {
    title: "Preview", titleAr: "المعاينة",
    items: [
      { action: "Open preview", actionAr: "فتح المعاينة", keys: "Enter" },
      { action: "Close preview", actionAr: "إغلاق المعاينة", keys: "Esc" },
      { action: "Go to next file", actionAr: "الملف التالي", keys: "→" },
      { action: "Go to previous file", actionAr: "الملف السابق", keys: "←" },
      { action: "Search keyword in PDF", actionAr: "بحث في PDF", keys: "Ctrl F" },
    ],
  },
  {
    title: "Video/Audio", titleAr: "فيديو/صوت",
    items: [
      { action: "Seek forward 5 seconds", actionAr: "تقديم 5 ثوانٍ", keys: "Shift →" },
      { action: "Seek backward 5 seconds", actionAr: "ترجيع 5 ثوانٍ", keys: "Shift ←" },
      { action: "Pause/Play", actionAr: "إيقاف/تشغيل", keys: "Space" },
      { action: "Mute/Unmute", actionAr: "كتم/إلغاء الكتم", keys: "M" },
      { action: "Full screen", actionAr: "ملء الشاشة", keys: "F" },
    ],
  },
  {
    title: "Actions", titleAr: "الإجراءات",
    items: [
      { action: "Copy to", actionAr: "نسخ إلى", keys: "C" },
      { action: "Move to", actionAr: "نقل إلى", keys: "Z" },
      { action: "Search", actionAr: "بحث", keys: "/" },
      { action: "Toggle views", actionAr: "تبديل العروض", keys: "V" },
      { action: "Sort", actionAr: "ترتيب", keys: "O" },
      { action: "Filter", actionAr: "تصفية", keys: "G" },
      { action: "Rename", actionAr: "إعادة تسمية", keys: "N" },
      { action: "Mark as Ready", actionAr: "وضع علامة جاهز", keys: "M" },
      { action: "Share", actionAr: "مشاركة", keys: ". (Period)" },
      { action: "Download", actionAr: "تحميل", keys: "Ctrl S" },
      { action: "Show info", actionAr: "عرض المعلومات", keys: "D" },
      { action: "Page Navigator", actionAr: "ملاح الصفحة", keys: "Shift G" },
      { action: "Copy and paste", actionAr: "نسخ ولصق", keys: "Ctrl + C  Ctrl + V" },
      { action: "Cut and paste", actionAr: "قص ولصق", keys: "Ctrl + X  Ctrl + V" },
    ],
  },
];

export function KeyboardShortcutsModal({ open, onClose }: Props) {
  const { locale } = useLocale();
  const ar = locale === "ar";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="zoho-side-overlay" role="dialog" aria-modal="true" aria-label={ar ? "اختصارات لوحة المفاتيح" : "Keyboard shortcuts"}>
      <div className="zoho-side-backdrop" onClick={onClose} />
      <div className="zoho-side-panel zoho-side-panel--narrow" dir={ar ? "rtl" : "ltr"}>
        <div className="zoho-side-header">
          <div className="zoho-side-title">
            <button type="button" className="zoho-side-back" onClick={onClose} aria-label={ar ? "رجوع" : "Back"}>
              <Icons.chevR size={18} style={{ transform: ar ? "none" : "rotate(180deg)" }} />
            </button>
            <h2>{ar ? "اختصارات لوحة المفاتيح" : "Keyboard shortcuts"}</h2>
          </div>
          <button type="button" className="zoho-side-close" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"}>
            <Icons.x size={18} />
          </button>
        </div>
        <div className="zoho-side-scroll">
          {sections.map((sec) => (
            <section key={sec.title} className="kb-section">
              <h3 className="kb-section-title">{ar ? sec.titleAr : sec.title}</h3>
              <ul className="kb-list">
                {sec.items.map((item) => (
                  <li key={item.action}>
                    <span>{ar ? item.actionAr : item.action}</span>
                    <kbd className="kb-keys">{item.keys}</kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
