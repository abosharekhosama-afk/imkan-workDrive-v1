import type { WriterBlock } from './model';

export type ImageInspectorPatch = NonNullable<WriterBlock['image']>;
export type ImageWrap = NonNullable<WriterBlock['image']>['wrap'];
export type ImageAnchor = NonNullable<WriterBlock['image']>['anchor'];

export function normalizeImageInspectorPatch(current: ImageInspectorPatch, patch: Partial<ImageInspectorPatch>): ImageInspectorPatch {
  const next = { ...current, ...patch };
  next.width = next.width ? Math.max(40, Math.round(next.width)) : undefined;
  next.height = next.height ? Math.max(40, Math.round(next.height)) : undefined;
  next.rotation = Math.round((((next.rotation ?? 0) % 360) + 360) % 360);
  if (next.crop) {
    next.crop = {
      top: Math.min(90, Math.max(0, next.crop.top)),
      right: Math.min(90, Math.max(0, next.crop.right)),
      bottom: Math.min(90, Math.max(0, next.crop.bottom)),
      left: Math.min(90, Math.max(0, next.crop.left)),
    };
  }
  return next;
}

export function rotateImage(current: ImageInspectorPatch, degrees: number): ImageInspectorPatch {
  return normalizeImageInspectorPatch(current, { rotation: (current.rotation ?? 0) + degrees });
}

export function resetImageCrop(current: ImageInspectorPatch): ImageInspectorPatch {
  return normalizeImageInspectorPatch(current, { crop: undefined });
}

export function imageInspectorSummary(image: ImageInspectorPatch): string {
  return `${image.width ?? 'auto'}×${image.height ?? 'auto'} · ${image.rotation ?? 0}° · ${image.wrap ?? 'inline'} · ${image.anchor ?? 'paragraph'}`;
}
