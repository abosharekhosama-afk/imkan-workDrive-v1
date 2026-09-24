'use client';

import type { ReactNode } from 'react';
import type { ShowElement, ShowLayout, ShowThemePreset, ShowTransition } from './model';

export type ShowRibbonTab = 'home' | 'insert' | 'design' | 'transitions' | 'animations' | 'slideshow' | 'review' | 'view';

type ShowChromeProps = {
  title: string;
  saving: boolean;
  saved: boolean;
  offline: boolean;
  canUndo: boolean;
  canRedo: boolean;
  tab: ShowRibbonTab;
  onTab: (tab: ShowRibbonTab) => void;
  onUndo: () => void;
  onRedo: () => void;
  onPresent: () => void;
  onPresenter: () => void;
  onSave: () => void;
  layout: ShowLayout;
  onLayout: (layout: ShowLayout) => void;
  onNewSlide: () => void;
  onDuplicate: () => void;
  onDeleteSlide: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAdd: (type: ShowElement['type']) => void;
  onGroup: () => void;
  onUngroup: () => void;
  onDeleteObjects: () => void;
  canGroup: boolean;
  canObject: boolean;
  onFront: () => void;
  onBack: () => void;
  onBold: () => void;
  onItalic: () => void;
  onAlign: (align: 'start' | 'center' | 'end') => void;
  bold?: boolean;
  italic?: boolean;
  background: string;
  onBackground: (color: string) => void;
  aspect: '16:9' | '4:3';
  onAspect: (value: '16:9' | '4:3') => void;
  onTheme: (preset: ShowThemePreset) => void;
  transition: ShowTransition;
  onTransition: (value: ShowTransition) => void;
  onAnimation: (type: 'fade' | 'zoom' | 'slide-in' | 'none') => void;
  zoom: number;
  onZoom: (value: number) => void;
  presence?: ReactNode;
  extra?: ReactNode;
};

const TABS: [ShowRibbonTab, string][] = [
  ['home', 'Home'],
  ['insert', 'Insert'],
  ['design', 'Design'],
  ['transitions', 'Transitions'],
  ['animations', 'Animations'],
  ['slideshow', 'Slide Show'],
  ['review', 'Review'],
  ['view', 'View'],
];

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="show-group">
      <div className="show-group-cmds">{children}</div>
      <div className="show-group-label">{label}</div>
    </div>
  );
}

function Cmd({ label, onClick, disabled, pressed, title }: { label: string; onClick?: () => void; disabled?: boolean; pressed?: boolean; title?: string }) {
  return (
    <button type="button" className="show-cmd" title={title ?? label} aria-label={title ?? label} aria-pressed={pressed || undefined} disabled={disabled || !onClick} onClick={onClick}>
      {label}
    </button>
  );
}

export function ShowChrome(p: ShowChromeProps) {
  const status = p.offline ? 'Offline' : p.saving ? 'Saving' : p.saved ? 'Saved' : 'Unsaved';
  return (
    <div className="shrink-0">
      <div className="show-appbar">
        <span className="show-mark" aria-hidden="true">P</span>
        <span className="show-title">{p.title || 'Untitled presentation'}</span>
        <span className="show-status-text">{status}</span>
        <div className="show-app-actions">
          {p.presence}
          {p.extra}
          <button type="button" className="show-icon" title="Undo" aria-label="Undo" disabled={!p.canUndo} onClick={p.onUndo}>U</button>
          <button type="button" className="show-icon" title="Redo" aria-label="Redo" disabled={!p.canRedo} onClick={p.onRedo}>R</button>
          <Cmd label="Slide Show" onClick={p.onPresent} />
          <Cmd label="Save" onClick={p.onSave} />
        </div>
      </div>
      <div className="show-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" className="show-tab" aria-selected={p.tab === id} onClick={() => p.onTab(id)}>{label}</button>
        ))}
      </div>
      <div className="show-ribbon-body">
        {p.tab === 'home' ? (
          <>
            <Group label="Clipboard"><Cmd label="Undo" onClick={p.onUndo} disabled={!p.canUndo} /><Cmd label="Redo" onClick={p.onRedo} disabled={!p.canRedo} /></Group>
            <span className="show-divider" />
            <Group label="Slides">
              <Cmd label="New Slide" onClick={p.onNewSlide} />
              <select className="show-select" aria-label="Layout" value={p.layout} onChange={(e) => p.onLayout(e.target.value as ShowLayout)}>
                <option value="blank">Blank</option>
                <option value="title">Title</option>
                <option value="title-content">Title + Content</option>
                <option value="two-column">Two Columns</option>
                <option value="image-text">Image + Text</option>
              </select>
              <Cmd label="Duplicate" onClick={p.onDuplicate} />
              <Cmd label="Delete" onClick={p.onDeleteSlide} />
            </Group>
            <span className="show-divider" />
            <Group label="Font">
              <Cmd label="Bold" pressed={p.bold} disabled={!p.canObject} onClick={p.onBold} />
              <Cmd label="Italic" pressed={p.italic} disabled={!p.canObject} onClick={p.onItalic} />
            </Group>
            <span className="show-divider" />
            <Group label="Paragraph">
              <Cmd label="Left" disabled={!p.canObject} onClick={() => p.onAlign('start')} />
              <Cmd label="Center" disabled={!p.canObject} onClick={() => p.onAlign('center')} />
              <Cmd label="Right" disabled={!p.canObject} onClick={() => p.onAlign('end')} />
            </Group>
            <span className="show-divider" />
            <Group label="Drawing">
              <Cmd label="Group" disabled={!p.canGroup} onClick={p.onGroup} />
              <Cmd label="Ungroup" disabled={!p.canObject} onClick={p.onUngroup} />
              <Cmd label="Front" disabled={!p.canObject} onClick={p.onFront} />
              <Cmd label="Back" disabled={!p.canObject} onClick={p.onBack} />
              <Cmd label="Delete" disabled={!p.canObject} onClick={p.onDeleteObjects} />
            </Group>
          </>
        ) : null}
        {p.tab === 'insert' ? (
          <Group label="Insert">
            <Cmd label="Text" onClick={() => p.onAdd('text')} />
            <Cmd label="Shape" onClick={() => p.onAdd('shape')} />
            <Cmd label="Image" onClick={() => p.onAdd('image')} />
            <Cmd label="Table" onClick={() => p.onAdd('table')} />
            <Cmd label="Line" onClick={() => p.onAdd('line')} />
            <Cmd label="Video" onClick={() => p.onAdd('video')} />
            <Cmd label="Audio" onClick={() => p.onAdd('audio')} />
          </Group>
        ) : null}
        {p.tab === 'design' ? (
          <Group label="Themes">
            {(['office', 'midnight', 'ocean', 'forest', 'sunset'] as ShowThemePreset[]).map((theme) => (
              <Cmd key={theme} label={theme} onClick={() => p.onTheme(theme)} />
            ))}
            <label className="show-cmd">Background <input type="color" aria-label="Slide background" value={p.background} onChange={(e) => p.onBackground(e.target.value)} /></label>
            <select className="show-select" aria-label="Slide size" value={p.aspect} onChange={(e) => p.onAspect(e.target.value as '16:9' | '4:3')}>
              <option value="16:9">Widescreen</option>
              <option value="4:3">Standard</option>
            </select>
          </Group>
        ) : null}
        {p.tab === 'transitions' ? (
          <Group label="Transition">
            {(['none', 'fade', 'slide'] as ShowTransition[]).map((item) => (
              <Cmd key={item} label={item} pressed={p.transition === item} onClick={() => p.onTransition(item)} />
            ))}
          </Group>
        ) : null}
        {p.tab === 'animations' ? (
          <Group label="Animation">
            <Cmd label="None" disabled={!p.canObject} onClick={() => p.onAnimation('none')} />
            <Cmd label="Fade" disabled={!p.canObject} onClick={() => p.onAnimation('fade')} />
            <Cmd label="Zoom" disabled={!p.canObject} onClick={() => p.onAnimation('zoom')} />
            <Cmd label="Slide in" disabled={!p.canObject} onClick={() => p.onAnimation('slide-in')} />
          </Group>
        ) : null}
        {p.tab === 'slideshow' ? (
          <Group label="Start">
            <Cmd label="From Current" onClick={p.onPresent} />
            <Cmd label="Presenter View" onClick={p.onPresenter} />
          </Group>
        ) : null}
        {p.tab === 'review' ? <Group label="Comments"><span className="show-status-text">Use the comments pane</span></Group> : null}
        {p.tab === 'view' ? (
          <Group label="Zoom">
            <Cmd label="Fit" onClick={() => p.onZoom(1)} />
            <Cmd label="Zoom out" onClick={() => p.onZoom(Math.max(0.5, p.zoom - 0.1))} />
            <Cmd label="Zoom in" onClick={() => p.onZoom(Math.min(2, p.zoom + 0.1))} />
            <span className="show-status-text">{Math.round(p.zoom * 100)}%</span>
            <Cmd label="Up" onClick={p.onMoveUp} />
            <Cmd label="Down" onClick={p.onMoveDown} />
          </Group>
        ) : null}
      </div>
    </div>
  );
}
