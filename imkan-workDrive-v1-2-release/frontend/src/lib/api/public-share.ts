import { getApiBaseUrl } from "./client";

export type PublicShareResult = {
  resource_type: string;
  resource_id: string;
  can_download: boolean;
  expires_at: string | null;
  download_url?: string | null;
};

export async function verifyPublicShare(
  token: string,
  password?: string,
): Promise<PublicShareResult> {
  const response = await fetch(`${getApiBaseUrl()}/share/public`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  if (!response.ok) {
    throw new Error(String(response.status));
  }
  return (await response.json()) as PublicShareResult;
}
