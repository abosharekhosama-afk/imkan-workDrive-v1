export const BROWSABLE_PROVIDERS = ["google", "dropbox", "microsoft"] as const;

export function connectionActions(provider: string | null | undefined): string[] {
  if (provider === "google" || provider === "dropbox" || provider === "microsoft") return ["get_file", "upload"];
  return [];
}

export function providerSupports(provider: string | null | undefined, action: "list" | "read" | "upload"): boolean {
  return connectionActions(provider).includes(action === "list" || action === "read" ? "get_file" : action);
}

export function connectionStatusLabel(status: string | null | undefined): "connected" | "expired" | "missing" {
  if (!status) return "missing";
  if (status === "ACTIVE") return "connected";
  if (status === "REAUTH_REQUIRED" || status === "ERROR" || status === "PENDING_AUTH") return "expired";
  return "missing";
}

export function parseConnectionError(message: string): { code: string; message: string } {
  const match = message.match(/^([A-Z_]+):\s*(.+)$/);
  if (match) return { code: match[1], message: match[2] };
  return { code: "PROVIDER_ERROR", message: message || "We couldn't complete this step." };
}

export function friendlyConnectionError(message: string): string {
  const parsed = parseConnectionError(message);
  if (parsed.code === "INSUFFICIENT_SCOPE") return "Reconnect to grant Google Drive file access.";
  if (parsed.code === "TOKEN_EXPIRED" || parsed.code === "AUTH_REQUIRED") return "Your connection expired. Reconnect to continue.";
  if (parsed.code === "ACCESS_DENIED") return parsed.message;
  if (parsed.code === "RATE_LIMITED") return "Provider rate limit reached. Try again shortly.";
  if (parsed.code === "NOT_FOUND") return "The requested folder or file was not found.";
  const value = message.toLowerCase();
  if (value.includes("expired") || value.includes("401") || value.includes("invalid_grant")) return "Your connection expired. Reconnect to continue.";
  if (value.includes("reconnect to grant google drive")) return "Reconnect to grant Google Drive file access.";
  if (value.includes("403") || value.includes("access denied")) return "Provider denied access to this folder.";
  return parsed.message || "We couldn't complete this step.";
}
