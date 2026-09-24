import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { flattenSelectableMenuItems, isSubmenuNode, submenuDirectionKey } from './office-menu-logic.ts';

describe('office-menu-logic', () => {
  it('flattens selectable items', () => {
    const items = [{ type: 'divider', id: 'd' }, { type: 'item', id: 'a', label: 'A' }, { type: 'submenu', id: 's', label: 'S', items: [] }];
    assert.equal(flattenSelectableMenuItems(items as any).length, 2);
  });
  it('detects submenu nodes', () => {
    assert.equal(isSubmenuNode({ type: 'submenu', id: 's', label: 'S', items: [] } as any), true);
  });
  it('maps arrow keys for submenu open/close', () => {
    assert.equal(submenuDirectionKey('ArrowRight'), 'open');
    assert.equal(submenuDirectionKey('ArrowLeft'), 'close');
  });
});
