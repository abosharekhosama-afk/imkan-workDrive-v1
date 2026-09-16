"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "./locale-provider";
import { uploadFileToFolder } from "../lib/api/upload-file";

export type RecordingKind = "screen" | "video" | "audio";

type Detail = { kind: RecordingKind; folderId: string | null };

const MIME_TYPES: Record<RecordingKind, string[]> = {
  screen: ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"],
  video: ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"],
  audio: ["audio/webm;codecs=opus", "audio/webm"],
};

export function RecordingHost() {
  const { locale } = useLocale();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);

  useEffect(() => {
    const handler = (event: Event) => {
      const value = (event as CustomEvent<Partial<Detail>>).detail;
      if (!value?.kind || !["screen", "video", "audio"].includes(value.kind)) return;
      setDetail({ kind: value.kind as RecordingKind, folderId: value.folderId ?? null });
      setError("");
      setSeconds(0);
    };
    window.addEventListener("workdrive:record", handler);
    return () => window.removeEventListener("workdrive:record", handler);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const stopAndSave = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
    setRecording(false);
  }, []);

  const start = async () => {
    if (!detail) return;
    setError("");
    try {
      if (!navigator.mediaDevices) throw new Error(locale === "ar" ? "المتصفح لا يدعم تسجيل الوسائط." : "This browser does not support media recording.");
      let stream: MediaStream;
      if (detail.kind === "screen") {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const ended = stream.getVideoTracks()[0];
        if (ended) ended.addEventListener("ended", stopAndSave, { once: true });
      } else if (detail.kind === "video") {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      const mimeType = MIME_TYPES[detail.kind].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onerror = () => { setError(locale === "ar" ? "حدث خطأ أثناء التسجيل." : "Recording failed."); setRecording(false); cleanup(); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || (detail.kind === "audio" ? "audio/webm" : "video/webm") });
        void save(detail, blob);
      };
      recorder.start(1000);
      startedAtRef.current = Date.now();
      setSeconds(0);
      setRecording(true);
    } catch (e) {
      cleanup();
      setError(e instanceof Error ? e.message : (locale === "ar" ? "تعذر بدء التسجيل. تحقق من أذونات الكاميرا/الميكروفون/الشاشة." : "Unable to start recording. Check camera, microphone, and screen permissions."));
    }
  };

  const save = async (target: Detail, blob: Blob) => {
    if (!blob.size) { cleanup(); setError(locale === "ar" ? "لم يتم التقاط أي بيانات." : "No recording data was captured."); return; }
    setBusy(true);
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const prefix = target.kind === "screen" ? "Screen recording" : target.kind === "video" ? "Video recording" : "Audio recording";
      const extension = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
      const mime = blob.type || (target.kind === "audio" ? "audio/webm" : "video/webm");
      await uploadFileToFolder(target.folderId, new File([blob], `${prefix} ${stamp}.${extension}`, { type: mime }));
      window.dispatchEvent(new Event("workdrive:content-changed"));
      setDetail(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : (locale === "ar" ? "تعذر حفظ التسجيل." : "Unable to save the recording."));
    } finally {
      cleanup();
      setBusy(false);
    }
  };

  if (!detail) return null;
  const title = detail.kind === "screen" ? (locale === "ar" ? "تسجيل الشاشة" : "Screen recording") : detail.kind === "video" ? (locale === "ar" ? "تسجيل الفيديو" : "Video recording") : (locale === "ar" ? "تسجيل الصوت" : "Audio recording");
  const formatted = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="fixed inset-x-0 bottom-4 z-[180] flex justify-center px-3 pointer-events-none" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="pointer-events-auto flex w-[min(760px,calc(100vw-24px))] items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-[0_10px_35px_rgba(15,23,42,.14)] backdrop-blur" role="status" aria-live="polite">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${recording ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-500"}`}><span className="text-[12px]">●</span></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><strong className="truncate text-[11px] font-semibold text-slate-900">{title}</strong><span className={`shrink-0 rounded-full px-2 py-0.5 text-[8.5px] font-semibold ${recording ? "bg-red-50 text-red-600" : busy ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{recording ? (locale === "ar" ? "جارٍ التسجيل" : "Recording") : busy ? (locale === "ar" ? "جارٍ الحفظ" : "Saving") : (locale === "ar" ? "جاهز" : "Ready")}</span></div>
          <div className="mt-0.5 text-[12px] font-semibold tabular-nums text-slate-700">{formatted}</div>
        </div>
        {error ? <div className="hidden max-w-[260px] truncate text-[9.5px] text-red-600 sm:block" title={error}>{error}</div> : null}
        {!recording && !busy ? <button type="button" className="imkan-button" onClick={() => void start()}>{locale === "ar" ? "بدء" : "Start"}</button> : null}
        {recording ? <button type="button" className="imkan-button" onClick={stopAndSave}>{locale === "ar" ? "إيقاف وحفظ" : "Stop & save"}</button> : null}
        {!recording && !busy ? <button type="button" className="imkan-button-secondary" onClick={() => setDetail(null)}>{locale === "ar" ? "إلغاء" : "Cancel"}</button> : null}
      </div>
    </div>
  );
}
