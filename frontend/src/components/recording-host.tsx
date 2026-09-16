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
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={() => !recording && !busy && setDetail(null)} />
      <div className="relative w-[min(440px,94vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-[16px] font-semibold text-slate-900">{title}</h2><p className="mt-1 text-[11px] text-slate-500">{locale === "ar" ? "سيتم حفظ التسجيل تلقائياً في المجلد الحالي." : "The recording will be saved automatically in the current folder."}</p></div>
        <div className="p-5">
          <div className={`flex min-h-36 flex-col items-center justify-center rounded-xl border ${recording ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
            <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full ${recording ? "bg-red-100 text-red-600" : "bg-white text-slate-500"}`}><span className="text-[18px]">●</span></div>
            <div className="text-[20px] font-semibold tabular-nums text-slate-800">{formatted}</div>
            <p className="mt-1 text-[11px] text-slate-500">{recording ? (locale === "ar" ? "جارٍ التسجيل…" : "Recording…") : busy ? (locale === "ar" ? "جارٍ حفظ التسجيل…" : "Saving recording…") : (locale === "ar" ? "جاهز" : "Ready")}</p>
          </div>
          {error ? <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div> : null}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="imkan-button-secondary" disabled={recording || busy} onClick={() => setDetail(null)}>{locale === "ar" ? "إلغاء" : "Cancel"}</button>
            {!recording ? <button type="button" className="imkan-button" disabled={busy} onClick={() => void start()}>{locale === "ar" ? "بدء التسجيل" : "Start recording"}</button> : <button type="button" className="imkan-button" onClick={stopAndSave}>{locale === "ar" ? "إيقاف وحفظ" : "Stop & save"}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
