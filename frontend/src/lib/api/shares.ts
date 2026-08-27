import { apiRequest } from "./client";
import { buildCreateShareBody, type CreateShareBody } from "./share-payload";

export { buildCreateShareBody, type CreateShareBody };

export function createShare(body: CreateShareBody): Promise<{ link_url: string }> {
  return apiRequest("/shares", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
