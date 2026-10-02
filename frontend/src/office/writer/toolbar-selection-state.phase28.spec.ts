import { describe, it } from 'node:test';
import fs from 'node:fs';
import { expect } from './node-test-expect.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chrome = fs.readFileSync(path.join(root, 'components/writer-zoho-chrome.tsx'), 'utf8');
const page = fs.readFileSync(path.join(root, 'app/office/writer/[fileId]/page.tsx'), 'utf8');

describe('Writer toolbar selection state', () => {
  it('exposes selection-derived font, size and color state', () => {
    expect(chrome).toContain('selectionState?:');
    expect(chrome).toContain('effectiveFontFamily');
    expect(chrome).toContain('effectiveFontSize');
    expect(chrome).toContain('effectiveColor');
    expect(chrome).toContain('effectiveHighlight');
  });

  it('reflects active formatting state on toolbar buttons', () => {
    expect(chrome).toContain('active={props.selectionState?.bold}');
    expect(chrome).toContain('active={props.selectionState?.italic}');
    expect(chrome).toContain('active={props.selectionState?.underline}');
    expect(chrome).toContain('aria-pressed={active ?? false}');
  });

  it('subscribes to browser selection changes and resolves the writer block', () => {
    expect(page).toContain("document.addEventListener('selectionchange'");
    expect(page).toContain("[data-writer-block]");
    expect(page).toContain("document.queryCommandState('bold')");
    expect(page).toContain('setActiveBlockId(blockId)');
  });
});
