"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../locale-provider";
import { getFileDlp, type FileDlpDecision } from "../../lib/api/files";

export type WatermarkConfig = {
  text: string;
  position: "repeat" | "center" | "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
  color: string;
  font: string;
  rotation: number;
  opacity: number;
  size: number;
};

export const DEFAULT_WATERMARK_CONFIG: WatermarkConfig = {
  text: "IMKAN",
  position: "repeat",
  color: "#000000",
  font: "Arial",
  rotation: -30,
  opacity: 15,
  size: 30,
};

export function PreviewWatermark({ enabled, config }: { enabled: boolean; config: WatermarkConfig }) {
  if (!enabled || !config.text.trim()) return null;
  const repeat = config.position === "repeat";
  const positionClass = repeat ? "zoho-watermark-repeat" : `zoho-watermark-${config.position}`;
  return (
    <div className="zoho-preview-watermark" aria-hidden="true">
      <div
        className={positionClass}
        style={{
          color: config.color,
          opacity: config.opacity / 100,
          fontFamily: config.font,
          fontSize: `${config.size}px`,
          transform: `rotate(${config.rotation}deg)`,
        }}
      >
        {repeat ? Array.from({ length: 36 }, (_, index) => <span key={index}>{config.text}</span>) : config.text}
      </div>
    </div>
  );
}

export function WatermarkSidebar({
  open,
  fileId,
  config,
  onChange,
  onClose,
}: {
  open: boolean;
  fileId: string;
  config: WatermarkConfig;
  onChange: (next: WatermarkConfig) => void;
  onClose?: () => void;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [dlp, setDlp] = useState<FileDlpDecision | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    getFileDlp(fileId).then((value) => { if (live) setDlp(value); }).catch(() => { if (live) setDlp(null); });
    return () => { live = false; };
  }, [open, fileId]);

  if (!open) return null;
  const update = <K extends keyof WatermarkConfig>(key: K, value: WatermarkConfig[K]) => onChange({ ...config, [key]: value });

  return (
    <aside className="zoho-preview-panel zoho-watermark-panel" dir={ar ? "rtl" : "ltr"} aria-label={ar ? "العلامة المائية" : "Watermark"}>
      <header className="zoho-preview-panel-head">
        <div><h2>{ar ? "إعدادات العلامة المائية" : "Watermark Settings"}</h2><p>{ar ? "يتم تطبيق سياسة العلامة المائية على المعاينة." : "The effective watermark policy is applied to this preview."}</p></div>
        {onClose ? <button type="button" className="zoho-panel-close" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"}>×</button> : null}
      </header>
      <div className="zoho-watermark-tabs"><button className="active" type="button">{ar ? "نص" : "Text"}</button><button type="button" disabled>{ar ? "صورة" : "Image"}</button></div>
      <div className="zoho-preview-panel-body zoho-watermark-form">
        <label><span>{ar ? "نص العلامة المائية" : "Watermark text"}</span><input value={config.text} onChange={(e) => update("text", e.target.value)} /></label>
        <label><span>{ar ? "الموضع" : "Position"}</span><select value={config.position} onChange={(e) => update("position", e.target.value as WatermarkConfig["position"]) }><option value="repeat">{ar ? "تكرار" : "Repeat"}</option><option value="center">{ar ? "الوسط" : "Center"}</option><option value="top-left">{ar ? "أعلى اليسار" : "Upper left"}</option><option value="top-center">{ar ? "أعلى الوسط" : "Upper center"}</option><option value="top-right">{ar ? "أعلى اليمين" : "Upper right"}</option><option value="bottom-left">{ar ? "أسفل اليسار" : "Lower left"}</option><option value="bottom-center">{ar ? "أسفل الوسط" : "Lower center"}</option><option value="bottom-right">{ar ? "أسفل اليمين" : "Lower right"}</option></select></label>
        <label><span>{ar ? "اللون" : "Fill"}</span><div className="zoho-watermark-color"><input type="color" value={config.color} onChange={(e) => update("color", e.target.value)} /><input value={config.color.toUpperCase()} onChange={(e) => update("color", e.target.value)} /></div></label>
        <label><span>{ar ? "الخط" : "Font"}</span><select value={config.font} onChange={(e) => update("font", e.target.value)}><option>Arial</option><option>Georgia</option><option>Verdana</option><option>Tahoma</option><option>sans-serif</option></select></label>
        <label><span>{ar ? "الدوران" : "Rotation"}</span><div className="zoho-watermark-inline"><input type="number" value={config.rotation} onChange={(e) => update("rotation", Number(e.target.value))} /><span>°</span></div></label>
        <label><span>{ar ? `الشفافية - ${config.opacity}%` : `Opacity - ${config.opacity}%`}</span><input type="range" min="0" max="100" value={config.opacity} onChange={(e) => update("opacity", Number(e.target.value))} /></label>
        <label><span>{ar ? `الحجم - ${config.size}px` : `Size - ${config.size}px`}</span><input type="range" min="10" max="96" value={config.size} onChange={(e) => update("size", Number(e.target.value))} /></label>
        <div className={`zoho-watermark-policy ${dlp?.watermark.enabled ? "enabled" : ""}`}>
          <span className="zoho-watermark-policy-dot" />
          <div><strong>{dlp?.watermark.enabled ? (ar ? "العلامة المائية مفروضة" : "Watermark is enforced") : (ar ? "العلامة المائية غير مفعلة" : "Watermark is not enforced")}</strong><small>{dlp?.watermark.text ? (ar ? `النص الإداري: ${dlp.watermark.text}` : `Admin text: ${dlp.watermark.text}`) : (ar ? "القيمة أعلاه تخص المعاينة الحالية." : "The controls above affect the current preview.")}</small></div>
        </div>
        <button type="button" className="zoho-watermark-save" onClick={onClose}>{ar ? "حفظ" : "Save"}</button>
      </div>
    </aside>
  );
}
