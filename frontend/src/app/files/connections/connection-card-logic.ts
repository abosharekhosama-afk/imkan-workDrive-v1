import type { ConnectionGovernance } from "@/lib/api/workflows";

export function getConnectionActionLabel(status: string, hovered: boolean): string {
  if (status === "ACTIVE") return hovered ? "Disconnect" : "ACTIVE";
  if (status === "PENDING_AUTH" || status === "REAUTH_REQUIRED") return "Connect";
  return status;
}

export function resolveConnectedAccount(
  connection: { authorizedAccount?: { email?: string; name?: string; username?: string; id?: string } | null },
): string {
  const account = connection.authorizedAccount;
  if (!account) return "Not available";
  return account.email || account.name || account.username || account.id || "Not available";
}

export function formatGrantedScopes(scope: string | null | undefined): string[] {
  return (scope ?? "").split(/\s+/).filter(Boolean);
}

export function formatCapabilityState(state: string | undefined): string {
  if (state === "granted") return "Granted";
  if (state === "required") return "Reconnect required";
  return "Not applicable";
}

export function formatConnectionAuthLabel(authType: string): string {
  if (authType === "OAUTH2") return "OAuth 2.0";
  return authType.replaceAll("_", " ");
}

export function buildDisconnectConfirmationCopy(input: {
  providerName: string;
  governance: Pick<ConnectionGovernance, "activeWorkflowIds" | "workflowReferences" | "functionReferences"> | null;
}): { title: string; body: string } {
  const activeWorkflows = input.governance?.activeWorkflowIds.length ?? 0;
  const workflowReferences = input.governance?.workflowReferences ?? 0;
  const functionReferences = input.governance?.functionReferences ?? 0;
  const title = `Disconnect ${input.providerName}?`;
  const body = [
    "This will revoke/remove this connection from IMKAN WorkDrive.",
    "Workflows and custom functions using this connection may stop working.",
    "",
    `Active workflows: ${activeWorkflows}`,
    `Workflow references: ${workflowReferences}`,
    `Function references: ${functionReferences}`,
  ].join("\n");
  return { title, body };
}

export function formatDiagnosticLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}
