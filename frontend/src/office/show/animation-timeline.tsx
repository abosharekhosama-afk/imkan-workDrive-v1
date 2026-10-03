'use client';

import type { ShowDocument, ShowElement, ShowAnimation } from './model';
import { activeSlide } from './model';

export type TimelineItem = {
  elementId: string;
  elementLabel: string;
  index: number;
  animation: ShowAnimation;
};

export function buildTimeline(doc: ShowDocument): TimelineItem[] {
  const s = activeSlide(doc);
  if (!s) return [];
  const items: TimelineItem[] = [];
  for (const el of s.elements) {
    const list = el.animations?.length ? el.animations : el.animation ? [el.animation] : [];
    list.forEach((a, index) => {
      items.push({
        elementId: el.id,
        elementLabel: el.type === 'text' ? (el.text || 'Text').slice(0, 24) : `${el.type}`,
        index,
        animation: {
          type: a.type || 'fade',
          duration: a.duration ?? 500,
          delay: a.delay ?? 0,
          phase: a.phase || 'entrance',
          order: a.order ?? index + 1,
          trigger: a.trigger || 'on-click',
        },
      });
    });
  }
  return items.sort((a, b) => (a.animation.order || 0) - (b.animation.order || 0));
}

type Props = {
  doc: ShowDocument;
  selectedIds: string[];
  onSelect: (id: string) => void;
  onUpdate: (elementId: string, animIndex: number, patch: Partial<ShowAnimation>) => void;
  onRemove: (elementId: string, animIndex: number) => void;
  onAdd: (elementId: string) => void;
  onReorder: (elementId: string, animIndex: number, direction: -1 | 1) => void;
};

export function AnimationTimelinePanel({ doc, selectedIds, onSelect, onUpdate, onRemove, onAdd, onReorder }: Props) {
  const items = buildTimeline(doc);
  const primary = selectedIds[0];

  return (
    <div className="show-anim-timeline" aria-label="Animation timeline">
      <div className="show-anim-title">Animation Timeline</div>
      <div className="show-anim-hint">Order · Effect · Duration · Trigger</div>
      {primary ? (
        <button type="button" className="show-anim-add" onClick={() => onAdd(primary)}>
          + Add effect to selection
        </button>
      ) : (
        <p className="show-anim-empty">Select an object to add an effect.</p>
      )}
      <ul className="show-anim-list">
        {items.length === 0 && <li className="show-anim-empty">No animations on this slide.</li>}
        {items.map((it) => (
          <li
            key={`${it.elementId}-${it.index}`}
            className={`show-anim-item ${selectedIds.includes(it.elementId) ? 'active' : ''}`}
            onClick={() => onSelect(it.elementId)}
          >
            <div className="show-anim-row">
              <span className="show-anim-order">#{it.animation.order}</span>
              <span className="show-anim-label" title={it.elementLabel}>{it.elementLabel}</span>
              <button type="button" className="show-anim-mini" onClick={(e) => { e.stopPropagation(); onReorder(it.elementId, it.index, -1); }}>↑</button>
              <button type="button" className="show-anim-mini" onClick={(e) => { e.stopPropagation(); onReorder(it.elementId, it.index, 1); }}>↓</button>
              <button type="button" className="show-anim-mini danger" onClick={(e) => { e.stopPropagation(); onRemove(it.elementId, it.index); }}>×</button>
            </div>
            <div className="show-anim-controls" onClick={(e) => e.stopPropagation()}>
              <select
                value={it.animation.type}
                onChange={(e) => onUpdate(it.elementId, it.index, { type: e.target.value as any })}
              >
                <option value="fade">Fade</option>
                <option value="zoom">Zoom</option>
                <option value="slide-in">Slide In</option>
                <option value="float">Float</option>
                <option value="pulse">Pulse</option>
                <option value="spin">Spin</option>
              </select>
              <select
                value={it.animation.phase || 'entrance'}
                onChange={(e) => onUpdate(it.elementId, it.index, { phase: e.target.value as any })}
              >
                <option value="entrance">Entrance</option>
                <option value="emphasis">Emphasis</option>
                <option value="exit">Exit</option>
              </select>
              <select
                value={it.animation.trigger || 'on-click'}
                onChange={(e) => onUpdate(it.elementId, it.index, { trigger: e.target.value as any })}
              >
                <option value="on-click">On click</option>
                <option value="with-previous">With previous</option>
                <option value="after-previous">After previous</option>
              </select>
              <label>
                ms
                <input
                  type="number"
                  min={50}
                  max={10000}
                  step={50}
                  value={it.animation.duration}
                  onChange={(e) => onUpdate(it.elementId, it.index, { duration: Number(e.target.value) })}
                />
              </label>
              <label>
                delay
                <input
                  type="number"
                  min={0}
                  max={10000}
                  step={50}
                  value={it.animation.delay}
                  onChange={(e) => onUpdate(it.elementId, it.index, { delay: Number(e.target.value) })}
                />
              </label>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
