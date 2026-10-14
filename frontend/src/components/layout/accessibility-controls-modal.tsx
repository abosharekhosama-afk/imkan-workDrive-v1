"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../locale-provider";
import { Icons } from "./icons";
import { applyA11ySettings } from "../a11y-bootstrap";

type Props = { open: boolean; onClose: () => void };

type A11y = {
  increasedContrast: boolean;
  contrastLevel: 1 | 2 | 3;
  underlineActions: boolean;
  readingMask: boolean;
  zoomLevel: number;
  displayFontSize: number;
  textSpacing: "compact" | "default" | "moderate" | "widen";
  toggleLabelStatus: boolean;
  emphasizeFocus: boolean;
  customCursor: boolean;
  highlightCritical: boolean;
  toastStyle: "stack" | "list";
  successToast: "auto" | "manual";
  timeoutDuration: number;
  warningToast: "auto" | "manual";
};

const STORAGE_KEY = "imkan_a11y_controls_v1";
const defaults: A11y = {
  increasedContrast: true, contrastLevel: 1, underlineActions: false, readingMask: false,
  zoomLevel: 100, displayFontSize: 80, textSpacing: "default", toggleLabelStatus: false,
  emphasizeFocus: false, customCursor: false, highlightCritical: false, toastStyle: "stack",
  successToast: "auto", timeoutDuration: 5, warningToast: "manual",
};

function applyA11y(a: A11y) {
  applyA11ySettings({
    increasedContrast: a.increasedContrast,
    contrastLevel: a.contrastLevel,
    underlineActions: a.underlineActions,
    readingMask: a.readingMask,
    zoomLevel: a.zoomLevel,
    displayFontSize: a.displayFontSize,
    textSpacing: a.textSpacing,
    emphasizeFocus: a.emphasizeFocus,
    customCursor: a.customCursor,
    highlightCritical: a.highlightCritical,
  });
  const root = document.documentElement;
  root.classList.toggle("a11y-toggle-labels", a.toggleLabelStatus);
  root.dataset.a11yToastStyle = a.toastStyle;
  root.dataset.a11ySuccessToast = a.successToast;
  root.dataset.a11yWarningToast = a.warningToast;
  root.dataset.a11yTimeout = String(a.timeoutDuration);
}

export function AccessibilityControlsModal({ open, onClose }: Props) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [a11y, setA11y] = useState<A11y>(defaults);

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { const parsed = { ...defaults, ...JSON.parse(raw) }; setA11y(parsed); applyA11y(parsed); }
    } catch { /* ignore */ }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function save(next: A11y) {
    setA11y(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    applyA11y(next);
  }
  function patch(p: Partial<A11y>) { save({ ...a11y, ...p }); }

  if (!open) return null;

  return (
    <div className="zoho-side-overlay" role="dialog" aria-modal="true" aria-label={ar ? "إعدادات إمكانية الوصول" : "Accessibility Controls"}>
      <div className="zoho-side-backdrop" onClick={onClose} />
      <div className="zoho-side-panel zoho-side-panel--narrow" dir={ar ? "rtl" : "ltr"}>
        <div className="zoho-side-header">
          <div className="zoho-side-title">
            <button type="button" className="zoho-side-back" onClick={onClose} aria-label={ar ? "رجوع" : "Back"}>
              <Icons.chevR size={18} style={{ transform: ar ? "none" : "rotate(180deg)" }} />
            </button>
            <h2>{ar ? "إعدادات إمكانية الوصول" : "Accessibility Controls"}</h2>
          </div>
          <button type="button" className="zoho-side-close" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"}>
            <Icons.x size={18} />
          </button>
        </div>
        <div className="zoho-side-scroll">
          <section className="a11y-section">
            <h3>{ar ? "الرؤية" : "Vision"}</h3>
            <div className="a11y-row">
              <div className="a11y-row-main">
                <div className="a11y-row-title">{ar ? "زيادة التباين" : "Increased Contrast"}</div>
                <p>{ar ? "يحسّن قابلية القراءة بضبط تباين النص والعناصر." : "Enhances readability by adjusting the contrast of text, interactive elements, separators, and outlines."}</p>
                {a11y.increasedContrast ? (
                  <div className="a11y-level-btns">
                    {([1, 2, 3] as const).map((l) => (
                      <button key={l} type="button" className={a11y.contrastLevel === l ? "is-active" : ""} onClick={() => patch({ contrastLevel: l })}>
                        {ar ? `المستوى ${l}` : `Level ${l}`} {a11y.contrastLevel === l ? "✓" : ""}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="a11y-row-side">
                <Icons.eye size={20} />
                <button type="button" role="switch" aria-checked={a11y.increasedContrast} className={`prefs-switch ${a11y.increasedContrast ? "is-on" : ""}`} onClick={() => patch({ increasedContrast: !a11y.increasedContrast })} />
              </div>
            </div>
            <div className="a11y-row">
              <div className="a11y-row-main">
                <div className="a11y-row-title">{ar ? "تسطير الإجراءات" : "Underline Actions"}</div>
                <p>{ar ? "يزيد وضوح الإجراءات بتسطيرها." : "Increases the visibility of actions with an underline."}</p>
              </div>
              <div className="a11y-row-side">
                <span className="a11y-preview-text" style={{ textDecoration: "underline" }}>Abc</span>
                <button type="button" role="switch" aria-checked={a11y.underlineActions} className={`prefs-switch ${a11y.underlineActions ? "is-on" : ""}`} onClick={() => patch({ underlineActions: !a11y.underlineActions })} />
              </div>
            </div>
            <div className="a11y-row">
              <div className="a11y-row-main">
                <div className="a11y-row-title">{ar ? "قناع القراءة" : "Reading Mask"}</div>
                <p>{ar ? "يزيل التشتت بالتركيز على النص الذي تقرأه." : "Eliminates distraction by focusing the text you're reading and masking the rest."}</p>
              </div>
              <div className="a11y-row-side">
                <Icons.eye size={20} />
                <button type="button" role="switch" aria-checked={a11y.readingMask} className={`prefs-switch ${a11y.readingMask ? "is-on" : ""}`} onClick={() => patch({ readingMask: !a11y.readingMask })} />
              </div>
            </div>
            <div className="a11y-row">
              <div className="a11y-row-main">
                <div className="a11y-row-title">{ar ? "مستوى التكبير" : "Zoom Level"}</div>
                <p>{ar ? "يعمل مع تكبير المتصفح من 25% إلى 150%." : "Works with browser's zoom functionality to zoom pages from 25% to 150%."}</p>
                <input type="range" min={25} max={150} step={5} value={a11y.zoomLevel} onChange={(e) => patch({ zoomLevel: Number(e.target.value) })} className="a11y-slider" />
                <span className="a11y-value">{a11y.zoomLevel}%</span>
              </div>
              <div className="a11y-row-side"><Icons.search size={20} /></div>
            </div>
            <div className="a11y-row">
              <div className="a11y-row-main">
                <div className="a11y-row-title">
                  {ar ? "حجم خط العرض" : "Display Font Size"} : {a11y.displayFontSize}%
                  <button type="button" className="a11y-reset" onClick={() => patch({ displayFontSize: 100 })}>{ar ? "إعادة" : "Reset"}</button>
                </div>
                <p>{ar ? "اضبط حجم الخط حتى يسهل القراءة." : "Adjust the font size until the page is easy to read."}</p>
                <input type="range" min={60} max={140} step={5} value={a11y.displayFontSize} onChange={(e) => patch({ displayFontSize: Number(e.target.value) })} className="a11y-slider" />
              </div>
              <div className="a11y-row-side"><span className="a11y-preview-text">Abc</span></div>
            </div>
            <div className="a11y-row">
              <div className="a11y-row-main">
                <div className="a11y-row-title">{ar ? "تباعد النص" : "Text Spacing"}</div>
                <p>{ar ? "اضبط تباعد الأحرف لتحسين القراءة." : "Adjust the character spacing to enhance readability and visual comfort."}</p>
                <div className="a11y-level-btns">
                  {([
                    { id: "compact" as const, label: ar ? "مضغوط" : "Compact" },
                    { id: "default" as const, label: ar ? "افتراضي" : "Default" },
                    { id: "moderate" as const, label: ar ? "متوسط" : "Moderate" },
                    { id: "widen" as const, label: ar ? "واسع" : "Widen" },
                  ]).map((o) => (
                    <button key={o.id} type="button" className={a11y.textSpacing === o.id ? "is-active" : ""} onClick={() => patch({ textSpacing: o.id })}>
                      {o.label} {a11y.textSpacing === o.id ? "✓" : ""}
                    </button>
                  ))}
                </div>
              </div>
              <div className="a11y-row-side"><span className="a11y-preview-text" style={{ letterSpacing: "0.08em" }}>T</span></div>
            </div>
            <div className="a11y-row">
              <div className="a11y-row-main">
                <div className="a11y-row-title">{ar ? "حالة تسمية التبديل" : "Toggle Label Status"}</div>
                <p>{ar ? "يعرض تسمية ON/OFF على مفتاح التبديل." : "Displays an ON/OFF label on the toggle switch for easy identification."}</p>
              </div>
              <div className="a11y-row-side">
                <button type="button" role="switch" aria-checked={a11y.toggleLabelStatus} className={`prefs-switch ${a11y.toggleLabelStatus ? "is-on" : ""}`} onClick={() => patch({ toggleLabelStatus: !a11y.toggleLabelStatus })} />
              </div>
            </div>
          </section>

          <section className="a11y-section">
            <h3>{ar ? "التنقل" : "Mobility"}</h3>
            <div className="a11y-row">
              <div className="a11y-row-main">
                <div className="a11y-row-title">{ar ? "ملاح الصفحة" : "Page Navigator"}</div>
                <p>{ar ? "يسمح بالتنقل السريع باستخدام لوحة المفاتيح (Shift + G)." : "Lets users quickly navigate to a specific part of the page using the keyboard. This can be invoked using Shift + G."}</p>
                <button type="button" className="a11y-btn-outline">{ar ? "فتح ملاح الصفحة" : "Open Page Navigator"}</button>
              </div>
              <div className="a11y-row-side"><Icons.layout size={20} /></div>
            </div>
            <div className="a11y-row">
              <div className="a11y-row-main">
                <div className="a11y-row-title">{ar ? "إبراز منطقة التركيز" : "Emphasize Focus Area"}</div>
                <p>{ar ? "يعزز رؤية العنصر المركّز بإضافة حدود مميزة." : "Enhances the visibility of the focused element by adding a distinct border."}</p>
              </div>
              <div className="a11y-row-side">
                <span className="a11y-preview-text">Abc</span>
                <button type="button" role="switch" aria-checked={a11y.emphasizeFocus} className={`prefs-switch ${a11y.emphasizeFocus ? "is-on" : ""}`} onClick={() => patch({ emphasizeFocus: !a11y.emphasizeFocus })} />
              </div>
            </div>
            <div className="a11y-row">
              <div className="a11y-row-main">
                <div className="a11y-row-title">{ar ? "مؤشر مخصص" : "Custom Cursor"}</div>
                <p>{ar ? "غيّر حجم ونمط المؤشر ليسهل تتبعه." : "Change the size and style of your cursor to easily locate it."}</p>
              </div>
              <div className="a11y-row-side">
                <Icons.act size={20} />
                <button type="button" role="switch" aria-checked={a11y.customCursor} className={`prefs-switch ${a11y.customCursor ? "is-on" : ""}`} onClick={() => patch({ customCursor: !a11y.customCursor })} />
              </div>
            </div>
          </section>

          <section className="a11y-section">
            <h3>{ar ? "التعلم" : "Learning"}</h3>
            <div className="a11y-row">
              <div className="a11y-row-main">
                <div className="a11y-row-title">{ar ? "إبراز المعلومات الحرجة" : "Highlight Critical Information"}</div>
                <p>{ar ? "يؤكد بصرياً التفاصيل المهمة مثل أسماء الملفات والمجلدات." : "Visually emphasizes important details, such as file and folder names, using distinct colors."}</p>
              </div>
              <div className="a11y-row-side">
                <span className="a11y-preview-text">Abc</span>
                <button type="button" role="switch" aria-checked={a11y.highlightCritical} className={`prefs-switch ${a11y.highlightCritical ? "is-on" : ""}`} onClick={() => patch({ highlightCritical: !a11y.highlightCritical })} />
              </div>
            </div>
            <div className="a11y-row">
              <div className="a11y-row-main">
                <div className="a11y-row-title">{ar ? "إشعارات Toast" : "Toast Notifications"}</div>
                <p>{ar ? "تظهر إشعارات قصيرة لتأكيد أو إبلاغ المستخدم." : "Toast notifications briefly appear to confirm or inform users about actions they have taken."}</p>
                <div className="a11y-toast-preview">
                  <button type="button" className={`a11y-toast-opt ${a11y.toastStyle === "stack" ? "is-active" : ""}`} onClick={() => patch({ toastStyle: "stack" })}>
                    <div className="toast-demo stack" /><span>{ar ? "مكدس (افتراضي)" : "Stack (default)"}</span>
                  </button>
                  <button type="button" className={`a11y-toast-opt ${a11y.toastStyle === "list" ? "is-active" : ""}`} onClick={() => patch({ toastStyle: "list" })}>
                    <div className="toast-demo list" /><span>{ar ? "قائمة" : "List"}</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="a11y-row">
              <div className="a11y-row-main">
                <div className="a11y-row-title">{ar ? "تحكم التوقيت" : "Timing Controls"}</div>
                <p>{ar ? "تحكم بمدة ظهور الرسائل." : "Control how long messages remain visible so you have enough time to read them."}</p>
                <div className="a11y-timing">
                  <label>{ar ? "نجاح ومعلومات" : "Success & Info Toasts"}
                    <select value={a11y.successToast} onChange={(e) => patch({ successToast: e.target.value as A11y["successToast"] })}>
                      <option value="auto">{ar ? "إغلاق تلقائي (افتراضي)" : "Auto-Close (Default)"}</option>
                      <option value="manual">{ar ? "إغلاق يدوي" : "Manual Close"}</option>
                    </select>
                  </label>
                  <label>{ar ? "مدة المهلة" : "Timeout Duration"}
                    <select value={a11y.timeoutDuration} onChange={(e) => patch({ timeoutDuration: Number(e.target.value) })}>
                      {[3, 5, 8, 10, 15].map((s) => <option key={s} value={s}>{s} {ar ? "ثوانٍ" : "Seconds"}</option>)}
                    </select>
                  </label>
                  <label>{ar ? "تحذير وخطأ" : "Warning & Error Toasts"}
                    <select value={a11y.warningToast} onChange={(e) => patch({ warningToast: e.target.value as A11y["warningToast"] })}>
                      <option value="manual">{ar ? "إغلاق يدوي (افتراضي)" : "Manual Close (Default)"}</option>
                      <option value="auto">{ar ? "إغلاق تلقائي" : "Auto-Close"}</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
          </section>
          <div className="a11y-help">
            <a href="https://www.zoho.com/workdrive/help/" target="_blank" rel="noreferrer">
              <Icons.help size={14} /> {ar ? "الحصول على مساعدة حول إعدادات إمكانية الوصول" : "Get help with accessibility controls"}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
