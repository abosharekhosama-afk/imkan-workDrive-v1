const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export const AVATAR_DATA_URL_MAX = 60_000;

/** Accepts an https portrait URL or a compact image data URL. Empty clears the photo. */
export function normalizeAvatarUrl(value: string | null | undefined): string | null {
  if (value == null) return null;
  const raw = value.trim();
  if (!raw) return null;
  if (raw.startsWith("https://") && raw.length <= 2000 && !/\s/.test(raw)) return raw;
  if (DATA_URL.test(raw) && raw.length <= AVATAR_DATA_URL_MAX) return raw;
  throw new Error("Profile photo must be a JPEG, PNG, or WebP image.");
}
