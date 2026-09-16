import { getApiBaseUrl } from "./client";

export type PublicShareResult = {
  resource_type: string;
  resource_id: string;
  name?: string | null;
  can_download: boolean;
  expires_at: string | null;
  download_url?: string | null;
  name?: string | null;
  items?: Array<{ resource_type: "FILE" | "FOLDER"; resource_id: string; name: string; path?: string; mime_type?: string | null; size?: number; download_url?: string | null }>;
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
