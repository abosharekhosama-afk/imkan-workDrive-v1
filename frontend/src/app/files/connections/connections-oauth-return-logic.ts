export type OAuthReturnParams = {
  oauth: string | null;
  provider: string | null;
  connectionId: string | null;
  message: string | null;
};

export function parseOAuthReturnParams(search: string): OAuthReturnParams {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  return {
    oauth: params.get("oauth"),
    provider: params.get("provider"),
    connectionId: params.get("connectionId"),
    message: params.get("message"),
  };
}

export function stripOAuthQueryParams(search: string): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  params.delete("oauth");
  params.delete("provider");
  params.delete("connectionId");
  params.delete("message");
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function buildOAuthStartReturnPath(pathname: string, search: string): string {
  return `${pathname}${stripOAuthQueryParams(search)}`;
}

export function buildCleanPathAfterOAuth(pathname: string, search: string): string {
  return `${pathname}${stripOAuthQueryParams(search)}`;
}

export function isOAuthReturnSuccess(params: OAuthReturnParams): boolean {
  return params.oauth === "success";
}

export function buildOAuthSuccessMessage(provider: string | null): string {
  const label = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "Connection";
  return `${label} connection activated successfully.`;
}

export function buildOAuthFailureMessage(params: OAuthReturnParams): string {
  if (params.message) return params.message;
  const label = params.provider ?? "Provider";
  return `${label} authorization was not completed.`;
}
