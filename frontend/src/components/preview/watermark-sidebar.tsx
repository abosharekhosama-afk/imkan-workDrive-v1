"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../locale-provider";
import { ImkanOptionPicker } from "../imkan-option-picker";
import { getFileDlp, type FileDlpDecision } from "../../lib/api/files";

export type WatermarkConfig = {
  enabled: boolean;
  kind: "text" | "image";
  text: string;
  imageUrl: string;
  position: "repeat" | "center" | "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
  color: string;
  font: string;
  rotation: number;
  opacity: number;
  size: number;
};

export const DEFAULT_WATERMARK_CONFIG: WatermarkConfig = {
  enabled: false,
  kind: "text",
  text: "IMKAN",
  imageUrl: "",
  position: "repeat",
  color: "#000000",
  font: "Arial",
  rotation: -30,
  opacity: 15,
  size: 30,
};

export function PreviewWatermark({ enabled, config }: { enabled: boolean; config: WatermarkConfig }) {
  const text = config.text.trim();
  const image = config.kind === "image" && config.imageUrl ? config.imageUrl : "";
  if (!enabled || (!image && !text)) return null;
  const repeat = config.position === "repeat";
  const positionClass = repeat ? "zoho-watermark-repeat" : `zoho-watermark-${config.position}`;
  const style = {
    color: config.color,
    opacity: Math.min(1, Math.max(0, config.opacity / 100)),
    fontFamily: config.font,
    fontSize: `${config.size}px`,
    transform: `rotate(${config.rotation}deg)`,
  };
  return (
    <div className="zoho-preview-watermark" aria-hidden="true">
      <div className={positionClass} style={style}>
        {image
          ? (repeat ? Array.from({ length: 36 }, (_, index) => <img key={index} src={image} alt="" style={{ width: Math.max(48, config.size * 3), height: "auto" }} />) : <img src={image} alt="" style={{ width: Math.max(72, config.size * 4), height: "auto" }} />)
          : (repeat ? Array.from({ length: 36 }, (_, index) => <span key={index}>{text}</span>) : text)}
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
  const update = <K extends keyof WatermarkConfig>(key: K, value: WatermarkConfig[K]) => onChange({ ...config, enabled: true, [key]: value });
  const enforced = Boolean(dlp?.watermark.enabled);
  const positions = [
    ["repeat", ar ? "تكرار" : "Repeat"],
    ["center", ar ? "الوسط" : "Center"],
    ["top-left", ar ? "أعلى اليسار" : "Upper left"],
    ["top-center", ar ? "أعلى الوسط" : "Upper center"],
    ["top-right", ar ? "أعلى اليمين" : "Upper right"],
    ["bottom-left", ar ? "أسفل اليسار" : "Lower left"],
    ["bottom-center", ar ? "أسفل الوسط" : "Lower center"],
    ["bottom-right", ar ? "أسفل اليمين" : "Lower right"],
  ] as const;

  return (
    <aside className="zoho-preview-panel zoho-watermark-panel" dir={ar ? "rtl" : "ltr"} aria-label={ar ? "العلامة المائية" : "Watermark"}>
      <header className="zoho-preview-panel-head">
        <div><h2>{ar ? "إعدادات العلامة المائية" : "Watermark Settings"}</h2><p>{ar ? "التغيير يظهر مباشرة على المعاينة." : "Changes appear on the preview immediately."}</p></div>
        {onClose ? <button type="button" className="zoho-panel-close" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"}>×</button> : null}
      </header>
      <div className="zoho-watermark-tabs">
        <button className={config.kind === "text" ? "active" : ""} type="button" onClick={() => update("kind", "text")}>{ar ? "نص" : "Text"}</button>
        <button className={config.kind === "image" ? "active" : ""} type="button" onClick={() => update("kind", "image")}>{ar ? "صورة" : "Image"}</button>
      </div>
      <div className="zoho-preview-panel-body zoho-watermark-form">
        <label className="zoho-watermark-toggle"><span>{ar ? "إظهار العلامة على المعاينة" : "Show watermark on the preview"}</span><input type="checkbox" checked={config.enabled || enforced} disabled={enforced} onChange={(e) => onChange({ ...config, enabled: e.target.checked })} /></label>
        {config.kind === "image" ? (
          <label><span>{ar ? "صورة العلامة" : "Watermark image"}</span><input type="file" accept="image/*" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => update("imageUrl", typeof reader.result === "string" ? reader.result : "");
            reader.readAsDataURL(file);
          }} />{config.imageUrl ? <img src={config.imageUrl} alt="" className="mt-2 h-12 w-auto" /> : null}</label>
        ) : (
          <label><span>{ar ? "نص العلامة المائية" : "Watermark text"}</span><input value={config.text} onChange={(e) => update("text", e.target.value)} /></label>
        )}
        <label><span>{ar ? "الموضع" : "Position"}</span><ImkanOptionPicker value={config.position} onChange={(next) => { const match = positions.find(([value]) => value === next); if (match) update("position", match[0]); }} options={positions.map(([value, label]) => ({ value, label }))} ariaLabel={ar ? "الموضع" : "Position"} fullWidth /></label>
        {config.kind === "text" ? <label><span>{ar ? "اللون" : "Fill"}</span><div className="zoho-watermark-color"><input type="color" value={config.color} onChange={(e) => update("color", e.target.value)} /><input value={config.color.toUpperCase()} onChange={(e) => update("color", e.target.value)} /></div></label> : null}
        {config.kind === "text" ? <label><span>{ar ? "الخط" : "Font"}</span><ImkanOptionPicker value={config.font} onChange={(next) => { if (next) update("font", next); }} options={["Arial", "Georgia", "Verdana", "Tahoma", "sans-serif"].map((font) => ({ value: font, label: font }))} ariaLabel={ar ? "الخط" : "Font"} fullWidth /></label> : null}
        <label><span>{ar ? "الدوران" : "Rotation"}</span><div className="zoho-watermark-inline"><input type="number" value={config.rotation} onChange={(e) => update("rotation", Number(e.target.value))} /><span>°</span></div></label>
        <label><span>{ar ? `الشفافية - ${config.opacity}%` : `Opacity - ${config.opacity}%`}</span><input type="range" min="0" max="100" value={config.opacity} onChange={(e) => update("opacity", Number(e.target.value))} /></label>
        <label><span>{ar ? `الحجم - ${config.size}px` : `Size - ${config.size}px`}</span><input type="range" min="10" max="96" value={config.size} onChange={(e) => update("size", Number(e.target.value))} /></label>
        <div className={`zoho-watermark-policy ${enforced || config.enabled ? "enabled" : ""}`}>
          <span className="zoho-watermark-policy-dot" />
          <div><strong>{enforced ? (ar ? "العلامة المائية مفروضة من السياسة" : "Watermark is enforced by policy") : config.enabled ? (ar ? "العلامة ظاهرة على هذه المعاينة" : "Watermark is visible on this preview") : (ar ? "العلامة مخفية" : "Watermark is hidden")}</strong><small>{dlp?.watermark.text ? (ar ? `النص الإداري: ${dlp.watermark.text}` : `Admin text: ${dlp.watermark.text}`) : (ar ? "أي تعديل يظهر مباشرة فوق الملف." : "Every change is painted on the file preview.")}</small></div>
        </div>
        <button type="button" className="zoho-watermark-save" onClick={() => onClose?.()}>{ar ? "حفظ" : "Save"}</button>
      </div>
    </aside>
  );
}
