'use client';

import type { ReactNode } from 'react';
import type { ShowElement, ShowLayout, ShowThemePreset, ShowTransition } from './model';
import { SHOW_RIBBON_TABS, type ShowRibbonTabId } from './show-ribbon-logic';
import { ShowIcons } from './show-icons';

export type ShowRibbonTab = ShowRibbonTabId;

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
  slideIndex: number;
  slideCount: number;
  notesOpen: boolean;
  onToggleNotes: () => void;
  presence?: ReactNode;
  extra?: ReactNode;
};

const TAB_LABELS: Record<ShowRibbonTab, string> = {
  home: 'Home',
  insert: 'Insert',
  design: 'Design',
  transitions: 'Transitions',
  animations: 'Animations',
  slideshow: 'Slide Show',
  review: 'Review',
  view: 'View',
};

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="show-group">
      <div className="show-group-cmds">{children}</div>
      <div className="show-group-label">{label}</div>
    </div>
  );
}

function Divider() {
  return <span className="show-divider" aria-hidden="true" />;
}

function IconBtn({
  icon,
  label,
  onClick,
  disabled,
  pressed,
  large,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
  large?: boolean;
}) {
  return (
    <button
      type="button"
      className={`show-icon-btn${large ? ' show-icon-btn--large' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={pressed || undefined}
      disabled={disabled || !onClick}
      onClick={onClick}
    >
      <span className="show-icon-btn-glyph">{icon}</span>
      {large ? <span className="show-icon-btn-label">{label}</span> : null}
    </button>
  );
}

function TextBtn({ label, onClick, disabled, pressed }: { label: string; onClick?: () => void; disabled?: boolean; pressed?: boolean }) {
  return (
    <button type="button" className="show-text-btn" title={label} aria-label={label} aria-pressed={pressed || undefined} disabled={disabled || !onClick} onClick={onClick}>
      {label}
    </button>
  );
}

export function ShowChrome(p: ShowChromeProps) {
  const status = p.offline ? 'Offline' : p.saving ? 'Saving…' : p.saved ? 'Saved' : 'Unsaved changes';

  return (
    <header className="show-chrome shrink-0">
      <div className="show-qat" aria-label="Quick Access Toolbar">
        <IconBtn icon={<ShowIcons.save size={14} />} label="Save" onClick={p.onSave} />
        <IconBtn icon={<ShowIcons.undo size={14} />} label="Undo" onClick={p.onUndo} disabled={!p.canUndo} />
        <IconBtn icon={<ShowIcons.redo size={14} />} label="Redo" onClick={p.onRedo} disabled={!p.canRedo} />
      </div>

      <div className="show-titlebar">
        <div className="show-titlebar-start">
          <span className="show-logo" aria-hidden="true"><ShowIcons.logo /></span>
          <div className="show-title-stack">
            <span className="show-app-name">PowerPoint</span>
            <span className="show-doc-title">{p.title || 'Untitled presentation'}</span>
          </div>
        </div>
        <div className="show-search" aria-hidden="true">
          <span className="show-search-placeholder">Search</span>
        </div>
        <div className="show-titlebar-end">
          {p.presence}
          {p.extra}
          <span className="show-save-state">{status}</span>
          <button type="button" className="show-slideshow-btn" onClick={p.onPresent}>
            <ShowIcons.present size={14} />
            <span>Slide Show</span>
          </button>
        </div>
      </div>

      <div className="show-tabs" role="tablist" aria-label="Ribbon tabs">
        {SHOW_RIBBON_TABS.map((id) => (
          <button key={id} type="button" role="tab" className="show-tab" aria-selected={p.tab === id} onClick={() => p.onTab(id)}>
            {TAB_LABELS[id]}
          </button>
        ))}
      </div>

      <div className="show-ribbon-body">
        {p.tab === 'home' ? (
          <>
            <Group label="Clipboard">
              <IconBtn icon={<ShowIcons.undo size={16} />} label="Undo" onClick={p.onUndo} disabled={!p.canUndo} />
              <IconBtn icon={<ShowIcons.redo size={16} />} label="Redo" onClick={p.onRedo} disabled={!p.canRedo} />
            </Group>
            <Divider />
            <Group label="Slides">
              <IconBtn icon={<ShowIcons.newSlide size={22} />} label="New Slide" onClick={p.onNewSlide} large />
              <select className="show-select" aria-label="Layout" value={p.layout} onChange={(e) => p.onLayout(e.target.value as ShowLayout)}>
                <option value="blank">Blank</option>
                <option value="title">Title Slide</option>
                <option value="title-content">Title and Content</option>
                <option value="two-column">Two Content</option>
                <option value="image-text">Picture with Caption</option>
              </select>
              <IconBtn icon={<ShowIcons.duplicate size={16} />} label="Duplicate Slide" onClick={p.onDuplicate} />
              <IconBtn icon={<ShowIcons.delete size={16} />} label="Delete Slide" onClick={p.onDeleteSlide} />
            </Group>
            <Divider />
            <Group label="Font">
              <IconBtn icon={<ShowIcons.bold size={16} />} label="Bold" onClick={p.onBold} disabled={!p.canObject} pressed={p.bold} />
              <IconBtn icon={<ShowIcons.italic size={16} />} label="Italic" onClick={p.onItalic} disabled={!p.canObject} pressed={p.italic} />
            </Group>
            <Divider />
            <Group label="Paragraph">
              <IconBtn icon={<ShowIcons.alignLeft size={16} />} label="Align Left" onClick={() => p.onAlign('start')} disabled={!p.canObject} />
              <IconBtn icon={<ShowIcons.alignCenter size={16} />} label="Align Center" onClick={() => p.onAlign('center')} disabled={!p.canObject} />
              <IconBtn icon={<ShowIcons.alignRight size={16} />} label="Align Right" onClick={() => p.onAlign('end')} disabled={!p.canObject} />
            </Group>
            <Divider />
            <Group label="Drawing">
              <IconBtn icon={<ShowIcons.group size={16} />} label="Group" onClick={p.onGroup} disabled={!p.canGroup} />
              <IconBtn icon={<ShowIcons.ungroup size={16} />} label="Ungroup" onClick={p.onUngroup} disabled={!p.canObject} />
              <IconBtn icon={<ShowIcons.bringFront size={16} />} label="Bring to Front" onClick={p.onFront} disabled={!p.canObject} />
              <IconBtn icon={<ShowIcons.sendBack size={16} />} label="Send to Back" onClick={p.onBack} disabled={!p.canObject} />
              <IconBtn icon={<ShowIcons.delete size={16} />} label="Delete" onClick={p.onDeleteObjects} disabled={!p.canObject} />
            </Group>
          </>
        ) : null}

        {p.tab === 'insert' ? (
          <Group label="Insert">
            <IconBtn icon={<ShowIcons.newSlide size={22} />} label="New Slide" onClick={p.onNewSlide} large />
            <IconBtn icon={<ShowIcons.textBox size={18} />} label="Text Box" onClick={() => p.onAdd('text')} large />
            <IconBtn icon={<ShowIcons.image size={18} />} label="Pictures" onClick={() => p.onAdd('image')} />
            <IconBtn icon={<ShowIcons.shape size={18} />} label="Shapes" onClick={() => p.onAdd('shape')} />
            <IconBtn icon={<ShowIcons.table size={18} />} label="Table" onClick={() => p.onAdd('table')} />
            <IconBtn icon={<ShowIcons.line size={18} />} label="Line" onClick={() => p.onAdd('line')} />
            <IconBtn icon={<ShowIcons.video size={18} />} label="Video" onClick={() => p.onAdd('video')} />
            <IconBtn icon={<ShowIcons.audio size={18} />} label="Audio" onClick={() => p.onAdd('audio')} />
          </Group>
        ) : null}

        {p.tab === 'design' ? (
          <Group label="Themes">
            <IconBtn icon={<ShowIcons.theme size={18} />} label="Office Theme" onClick={() => p.onTheme('office')} />
            <IconBtn icon={<ShowIcons.theme size={18} />} label="Midnight" onClick={() => p.onTheme('midnight')} />
            <IconBtn icon={<ShowIcons.theme size={18} />} label="Ocean" onClick={() => p.onTheme('ocean')} />
            <IconBtn icon={<ShowIcons.theme size={18} />} label="Forest" onClick={() => p.onTheme('forest')} />
            <IconBtn icon={<ShowIcons.theme size={18} />} label="Sunset" onClick={() => p.onTheme('sunset')} />
            <label className="show-color-field">Background<input type="color" aria-label="Slide background" value={p.background} onChange={(e) => p.onBackground(e.target.value)} /></label>
            <select className="show-select" aria-label="Slide size" value={p.aspect} onChange={(e) => p.onAspect(e.target.value as '16:9' | '4:3')}>
              <option value="16:9">Widescreen (16:9)</option>
              <option value="4:3">Standard (4:3)</option>
            </select>
          </Group>
        ) : null}

        {p.tab === 'transitions' ? (
          <Group label="Transition to This Slide">
            <TextBtn label="None" pressed={p.transition === 'none'} onClick={() => p.onTransition('none')} />
            <TextBtn label="Fade" pressed={p.transition === 'fade'} onClick={() => p.onTransition('fade')} />
            <TextBtn label="Push" pressed={p.transition === 'slide'} onClick={() => p.onTransition('slide')} />
            <IconBtn icon={<ShowIcons.transition size={18} />} label="Preview" onClick={p.onPresent} />
          </Group>
        ) : null}

        {p.tab === 'animations' ? (
          <Group label="Animation">
            <TextBtn label="None" disabled={!p.canObject} onClick={() => p.onAnimation('none')} />
            <TextBtn label="Fade" disabled={!p.canObject} onClick={() => p.onAnimation('fade')} />
            <TextBtn label="Zoom" disabled={!p.canObject} onClick={() => p.onAnimation('zoom')} />
            <TextBtn label="Float In" disabled={!p.canObject} onClick={() => p.onAnimation('slide-in')} />
          </Group>
        ) : null}

        {p.tab === 'slideshow' ? (
          <Group label="Start Slide Show">
            <IconBtn icon={<ShowIcons.present size={22} />} label="From Beginning" onClick={p.onPresent} large />
            <IconBtn icon={<ShowIcons.present size={18} />} label="From Current Slide" onClick={p.onPresent} />
            <IconBtn icon={<ShowIcons.present size={18} />} label="Presenter View" onClick={p.onPresenter} />
          </Group>
        ) : null}

        {p.tab === 'review' ? (
          <Group label="Comments">
            <TextBtn label="Show Comments Pane" onClick={p.onToggleNotes} pressed={p.notesOpen} />
          </Group>
        ) : null}

        {p.tab === 'view' ? (
          <>
            <Group label="Presentation Views">
              <TextBtn label="Normal" pressed />
              <TextBtn label="Slide Sorter" onClick={() => p.onZoom(0.65)} />
            </Group>
            <Divider />
            <Group label="Zoom">
              <IconBtn icon={<ShowIcons.zoomOut size={16} />} label="Zoom Out" onClick={() => p.onZoom(Math.max(0.5, +(p.zoom - 0.1).toFixed(2)))} />
              <span className="show-zoom-readout">{Math.round(p.zoom * 100)}%</span>
              <IconBtn icon={<ShowIcons.zoomIn size={16} />} label="Zoom In" onClick={() => p.onZoom(Math.min(2, +(p.zoom + 0.1).toFixed(2)))} />
              <TextBtn label="Fit" onClick={() => p.onZoom(1)} />
            </Group>
            <Divider />
            <Group label="Show">
              <TextBtn label="Notes" pressed={p.notesOpen} onClick={p.onToggleNotes} />
              <TextBtn label="Move Up" onClick={p.onMoveUp} />
              <TextBtn label="Move Down" onClick={p.onMoveDown} />
            </Group>
          </>
        ) : null}
      </div>
    </header>
  );
}

export function ShowStatusBar({
  slideIndex,
  slideCount,
  zoom,
  notesOpen,
  onToggleNotes,
  onZoom,
}: {
  slideIndex: number;
  slideCount: number;
  zoom: number;
  notesOpen: boolean;
  onToggleNotes: () => void;
  onZoom: (value: number) => void;
}) {
  return (
    <footer className="show-status">
      <span>Slide {slideIndex} of {slideCount}</span>
      <span className="show-status-sep" />
      <button type="button" className="show-status-btn" aria-pressed={notesOpen} onClick={onToggleNotes}>Notes</button>
      <span className="show-status-spacer" />
      <button type="button" className="show-status-icon" aria-label="Zoom out" onClick={() => onZoom(Math.max(0.5, +(zoom - 0.1).toFixed(2)))}><ShowIcons.zoomOut size={14} /></button>
      <input
        type="range"
        className="show-zoom-slider"
        min={50}
        max={200}
        step={5}
        value={Math.round(zoom * 100)}
        aria-label="Zoom"
        onChange={(e) => onZoom(Number(e.target.value) / 100)}
      />
      <span className="show-zoom-readout">{Math.round(zoom * 100)}%</span>
      <button type="button" className="show-status-icon" aria-label="Zoom in" onClick={() => onZoom(Math.min(2, +(zoom + 0.1).toFixed(2)))}><ShowIcons.zoomIn size={14} /></button>
      <button type="button" className="show-status-icon" aria-label="Fit slide to window" onClick={() => onZoom(1)}>⤢</button>
    </footer>
  );
}
