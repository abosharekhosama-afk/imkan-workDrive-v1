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

export function friendlyConnectionError(message: string): string {
  const value = message.toLowerCase();
  if (value.includes("expired") || value.includes("401") || value.includes("invalid_grant")) return "Your connection expired.";
  if (value.includes("folder") || value.includes("403")) return "We couldn't access this folder.";
  return "We couldn't complete this step.";
}
