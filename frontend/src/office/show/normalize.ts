import type { ShowDocument, ShowElement, ShowSlide } from './model';
import { defaultShow } from './model';

const clamp = (n: number, min: number, max: number) =>
  Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;

function normalizeElement(el: any): ShowElement {
  const type = ['text', 'shape', 'image', 'video', 'audio', 'line', 'table', 'chart'].includes(el?.type)
    ? el.type
    : 'text';
  return {
    ...el,
    id: typeof el?.id === 'string' && el.id ? el.id : `el-${Math.random().toString(36).slice(2, 9)}`,
    type,
    x: clamp(Number(el?.x), 0, 100),
    y: clamp(Number(el?.y), 0, 100),
    width: clamp(Number(el?.width) || 10, 0.4, 100),
    height: clamp(Number(el?.height) || 10, 0.4, 100),
    rotation: Number.isFinite(Number(el?.rotation)) ? Number(el.rotation) : 0,
    fontSize: Number.isFinite(Number(el?.fontSize))
      ? clamp(Number(el.fontSize), 8, 200)
      : type === 'text'
        ? 20
        : el?.fontSize,
    text: typeof el?.text === 'string' ? el.text : el?.text != null ? String(el.text) : type === 'text' ? '' : el?.text,
    color: typeof el?.color === 'string' ? el.color : type === 'text' ? '#111827' : el?.color,
    fill: typeof el?.fill === 'string' ? el.fill : el?.fill,
  } as ShowElement;
}

function normalizeSlide(slide: any, index: number): ShowSlide {
  return {
    id: typeof slide?.id === 'string' && slide.id ? slide.id : `slide-${index + 1}`,
    layout: slide?.layout || 'blank',
    background: typeof slide?.background === 'string' && slide.background ? slide.background : '#ffffff',
    elements: Array.isArray(slide?.elements) ? slide.elements.map(normalizeElement) : [],
    notes: typeof slide?.notes === 'string' ? slide.notes : '',
    master: slide?.master,
    section: slide?.section,
    transition: slide?.transition || 'none',
    transitionDuration: Number.isFinite(Number(slide?.transitionDuration))
      ? clamp(Number(slide.transitionDuration), 100, 5000)
      : 300,
    autoAdvanceMs: slide?.autoAdvanceMs,
  } as ShowSlide;
}

/** Sanitize imported / stored Show documents so the canvas never receives invalid geometry. */
export function normalizeShowDocument(value: any): ShowDocument {
  const base = defaultShow();
  if (!value || typeof value !== 'object') return base;
  const slides = Array.isArray(value.slides) && value.slides.length
    ? value.slides.map(normalizeSlide)
    : base.slides;
  const active =
    typeof value.activeSlide === 'string' && slides.some((s: ShowSlide) => s.id === value.activeSlide)
      ? value.activeSlide
      : slides[0]?.id || base.activeSlide;
  return {
    ...base,
    ...value,
    schema: 6,
    type: 'SHOW',
    title: typeof value.title === 'string' ? value.title : base.title,
    aspectRatio: value.aspectRatio === '4:3' ? '4:3' : '16:9',
    activeSlide: active,
    theme: {
      ...base.theme,
      ...(value.theme && typeof value.theme === 'object' ? value.theme : {}),
    },
    masters: Array.isArray(value.masters) && value.masters.length ? value.masters : base.masters,
    slides,
    sections: Array.isArray(value.sections) ? value.sections : [],
    comments: Array.isArray(value.comments) ? value.comments : [],
  } as ShowDocument;
}
