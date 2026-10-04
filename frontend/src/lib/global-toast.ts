export type GlobalToastTone = "success" | "error" | "info";
export type GlobalToastDetail = {
  message: string;
  messageAr?: string;
  tone?: GlobalToastTone;
  duration?: number;
};

export function emitGlobalToast(detail: GlobalToastDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<GlobalToastDetail>("workdrive:toast", { detail }));
}
