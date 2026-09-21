import { apiRequest } from "./client";
export type OfficeEmailSettings = { configured: boolean; enabled: boolean; provider: "SENDGRID" | "GMAIL" | null; connectionId: string; fromEmail: string; fromName: string };
export const getOfficeEmailSettings = () => apiRequest<OfficeEmailSettings>("/office/email/settings");
export const updateOfficeEmailSettings = (input: Partial<OfficeEmailSettings>) => apiRequest<OfficeEmailSettings>("/office/email/settings", { method: "PATCH", body: JSON.stringify(input) });
export const testOfficeEmail = (to?: string) => apiRequest<{ ok: boolean; recipient: string }>("/office/email/test", { method: "POST", body: JSON.stringify({ to }) });
