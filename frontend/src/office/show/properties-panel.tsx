'use client';

import type { ShowElement } from './model';
import { TEXT_QUICK_STYLES, SHAPE_QUICK_STYLES } from './quick-styles';

type Props = {
  element: ShowElement | null;
  selectionCount: number;
  onChange: (patch: Partial<ShowElement>) => void;
  onApplyStyle: (patch: Partial<ShowElement>) => void;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="show-prop-field">
      <span className="show-prop-label">{label}</span>
      {children}
    </label>
  );
}

export function ShowPropertiesPanel({ element, selectionCount, onChange, onApplyStyle }: Props) {
  if (!element) {
    return (
      <aside className="show-props-panel" aria-label="Properties">
        <div className="show-props-title">Properties</div>
        <p className="show-props-empty">Select an object to edit its properties.</p>
        <p className="show-props-hint">Shift-click for multi-select · Ctrl+C / Ctrl+V copy-paste</p>
      </aside>
    );
  }

  const multi = selectionCount > 1;
  const styles = element.type === 'text' ? TEXT_QUICK_STYLES : SHAPE_QUICK_STYLES;

  return (
    <aside className="show-props-panel" aria-label="Properties">
      <div className="show-props-title">
        Properties {multi ? `(${selectionCount})` : ''}
      </div>
      <div className="show-props-section">Position & Size</div>
      <div className="show-props-grid">
        <Field label="X %">
          <input type="number" min={0} max={100} step={0.5} value={Number(element.x?.toFixed?.(1) ?? element.x)}
            onChange={(e) => onChange({ x: Number(e.target.value) })} />
        </Field>
        <Field label="Y %">
          <input type="number" min={0} max={100} step={0.5} value={Number(element.y?.toFixed?.(1) ?? element.y)}
            onChange={(e) => onChange({ y: Number(e.target.value) })} />
        </Field>
        <Field label="W %">
          <input type="number" min={1} max={100} step={0.5} value={Number(element.width?.toFixed?.(1) ?? element.width)}
            onChange={(e) => onChange({ width: Number(e.target.value) })} />
        </Field>
        <Field label="H %">
          <input type="number" min={1} max={100} step={0.5} value={Number(element.height?.toFixed?.(1) ?? element.height)}
            onChange={(e) => onChange({ height: Number(e.target.value) })} />
        </Field>
        <Field label="Rotate">
          <input type="number" min={-360} max={360} step={1} value={element.rotation || 0}
            onChange={(e) => onChange({ rotation: Number(e.target.value) })} />
        </Field>
      </div>

      {(element.type === 'text' || element.type === 'shape') && (
        <>
          <div className="show-props-section">Appearance</div>
          <div className="show-props-grid">
            {element.type === 'text' && (
              <>
                <Field label="Text color">
                  <input type="color" value={element.color || '#111827'} onChange={(e) => onChange({ color: e.target.value })} />
                </Field>
                <Field label="Size">
                  <input type="number" min={8} max={96} value={element.fontSize || 18}
                    onChange={(e) => onChange({ fontSize: Number(e.target.value) })} />
                </Field>
                <Field label="Font">
                  <select value={element.fontFamily || 'Arial'} onChange={(e) => onChange({ fontFamily: e.target.value })}>
                    {['Arial', 'Calibri', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Courier New'].map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            {(element.type === 'shape' || element.fill) && (
              <Field label="Fill">
                <input type="color" value={element.fill && element.fill !== 'transparent' ? element.fill : '#dbeafe'}
                  onChange={(e) => onChange({ fill: e.target.value })} />
              </Field>
            )}
            {element.type === 'shape' && (
              <Field label="Shape">
                <select value={element.shape || 'rect'} onChange={(e) => onChange({ shape: e.target.value as any })}>
                  <option value="rect">Rectangle</option>
                  <option value="roundRect">Rounded</option>
                  <option value="circle">Circle</option>
                </select>
              </Field>
            )}
          </div>
          <div className="show-props-toggles">
            <button type="button" className={element.bold ? 'on' : ''} onClick={() => onChange({ bold: !element.bold })}>B</button>
            <button type="button" className={element.italic ? 'on' : ''} onClick={() => onChange({ italic: !element.italic })}>I</button>
            <button type="button" className={element.underline ? 'on' : ''} onClick={() => onChange({ underline: !element.underline })}>U</button>
          </div>
        </>
      )}

      <div className="show-props-section">Quick Styles</div>
      <div className="show-props-styles">
        {styles.map((s) => (
          <button key={s.id} type="button" className="show-style-chip" onClick={() => onApplyStyle(s.apply)}>
            {s.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
