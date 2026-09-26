export const BROWSABLE_PROVIDERS = ["google", "dropbox", "microsoft"] as const;

export function connectionActions(provider: string | null | undefined): string[] {
  if (provider === "google" || provider === "dropbox" || provider === "microsoft") return ["get_file", "upload"];
  return [];
}

export function providerSupports(provider: string | null | undefined, action: "list" | "read" | "upload"): boolean {
  return connectionActions(provider).includes(action === "list" || action === "read" ? "get_file" : action);
}

export function googleDriveScopeGranted(scope: string | null | undefined): boolean {
  return (scope ?? "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .some((item) =>
      item === "https://www.googleapis.com/auth/drive.readonly"
      || item === "https://www.googleapis.com/auth/drive"
      || item === "https://www.googleapis.com/auth/drive.file",
    );
}

export function googleDriveReconnectRequired(connection: {
  provider?: string | null;
  authType?: string | null;
  status?: string | null;
  scope?: string | null;
  errorCode?: string | null;
}): boolean {
  if (connection.provider !== "google" || connection.authType !== "OAUTH2") return false;
  if (connection.status === "REAUTH_REQUIRED" || connection.status === "PENDING_AUTH") return true;
  if (connection.status !== "ACTIVE") return false;
  return connection.errorCode === "DRIVE_SCOPE_REQUIRED" || !googleDriveScopeGranted(connection.scope);
}

export function connectionBrowseReady(connection: {
  provider?: string | null;
  authType?: string | null;
  status?: string | null;
  scope?: string | null;
  errorCode?: string | null;
}): boolean {
  if (connection.status !== "ACTIVE") return false;
  if (providerSupports(connection.provider, "list") && googleDriveReconnectRequired(connection)) return false;
  return true;
}

export function reconnectProviderLabel(provider: string | null | undefined): string {
  if (provider === "google") return "Reconnect Google Drive";
  if (provider === "dropbox") return "Reconnect Dropbox";
  if (provider === "microsoft") return "Reconnect OneDrive";
  return "Reconnect";
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
  if (parsed.code === "INSUFFICIENT_SCOPE" || parsed.code === "DRIVE_SCOPE_REQUIRED") {
    return "Google Drive file access is not authorized for this connection.";
  }
  if (parsed.code === "GOOGLE_DRIVE_API_NOT_ENABLED") {
    return "Google Drive API is not enabled for the Google Cloud project used by this OAuth connection.";
  }
  if (parsed.code === "TOKEN_EXPIRED" || parsed.code === "AUTH_REQUIRED") return "Your connection expired. Reconnect to continue.";
  if (parsed.code === "ACCESS_DENIED") return parsed.message;
  if (parsed.code === "RATE_LIMITED") return "Provider rate limit reached. Try again shortly.";
  if (parsed.code === "NOT_FOUND") return "The requested folder or file was not found.";
  const value = message.toLowerCase();
  if (value.includes("expired") || value.includes("401") || value.includes("invalid_grant")) return "Your connection expired. Reconnect to continue.";
  if (value.includes("google drive file access is not authorized")) return "Google Drive file access is not authorized for this connection.";
  if (value.includes("403") || value.includes("access denied")) return "Provider denied access to this folder.";
  return parsed.message || "We couldn't complete this step.";
}

export function formatCapabilityState(state: string): string {
  if (state === "granted") return "Granted";
  if (state === "required") return "Reconnect required";
  return "Not applicable";
}
