export const AVATAR_MAX_EDGE = 256;
export const AVATAR_MAX_CHARS = 60_000;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function fitAvatarSize(width: number, height: number, max = AVATAR_MAX_EDGE) {
  const edge = Math.max(width, height, 1);
  const scale = Math.min(1, max / edge);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function avatarFileAllowed(type: string, size: number) {
  return (AVATAR_TYPES as readonly string[]).includes(type) && size > 0 && size <= 5_000_000;
}

export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!avatarFileAllowed(file.type, file.size)) throw new Error("Profile photo must be a JPEG, PNG, or WebP image under 5 MB.");
  const bitmap = await createImageBitmap(file);
  const size = fitAvatarSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Profile photo could not be prepared.");
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  let quality = 0.86;
  let url = canvas.toDataURL("image/jpeg", quality);
  while (url.length > AVATAR_MAX_CHARS && quality > 0.45) {
    quality -= 0.1;
    url = canvas.toDataURL("image/jpeg", quality);
  }
  if (url.length > AVATAR_MAX_CHARS) throw new Error("Profile photo is too large.");
  return url;
}
