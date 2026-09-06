import { describe, expect, it, vi } from 'vitest';
import { matchAction, registerShortcuts, SHORTCUT_LABELS, type Action } from '../shortcuts';

function key(init: Partial<KeyboardEventInit> & { key: string }, target?: EventTarget) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  if (target) Object.defineProperty(event, 'target', { value: target });
  return event;
}

function textBox(tag: 'input' | 'textarea' = 'textarea') {
  return document.createElement(tag);
}

describe('matchAction', () => {
  const cases: Array<[Partial<KeyboardEventInit> & { key: string }, Action]> = [
    [{ key: 'n' }, 'new-note'],
    [{ key: 'N' }, 'new-note'],
    [{ key: 'Enter' }, 'edit'],
    [{ key: 'Escape' }, 'cancel'],
    [{ key: 'Delete' }, 'delete'],
    [{ key: 'i' }, 'new-image'],
    [{ key: 'c' }, 'connect'],
    [{ key: 'ArrowUp' }, 'result-up'],
    [{ key: 'ArrowDown' }, 'result-down'],
    [{ key: 'd', ctrlKey: true }, 'duplicate'],
    [{ key: 'c', ctrlKey: true }, 'copy'],
    [{ key: 'v', ctrlKey: true }, 'paste'],
    [{ key: 'a', ctrlKey: true }, 'select-all'],
    [{ key: '0', ctrlKey: true }, 'zoom-to-fit'],
    [{ key: 'z', ctrlKey: true }, 'undo'],
    [{ key: 'y', ctrlKey: true }, 'redo'],
    [{ key: ']', ctrlKey: true, code: 'BracketRight' }, 'bring-forward'],
    [{ key: '[', ctrlKey: true, code: 'BracketLeft' }, 'send-back'],
  ];

  for (const [init, action] of cases) {
    it(`matchAction_${action}_mapsFrom_${init.ctrlKey ? 'Ctrl+' : ''}${init.key}`, () => {
      expect(matchAction(key(init))).toBe(action);
    });
  }

  it('matchAction_bracketOnANonUsLayout_stillMatchesOnEventCode', () => {
    expect(matchAction(key({ key: 'Dead', ctrlKey: true, code: 'BracketRight' }))).toBe(
      'bring-forward',
    );
  });

  it('matchAction_unmappedKey_returnsNull', () => {
    expect(matchAction(key({ key: 'q' }))).toBeNull();
    expect(matchAction(key({ key: 'F5' }))).toBeNull();
  });

  it('matchAction_plainLetterInsideATextBox_isSuppressed', () => {
    expect(matchAction(key({ key: 'n' }, textBox()))).toBeNull();
    expect(matchAction(key({ key: 'Enter' }, textBox()))).toBeNull();
    expect(matchAction(key({ key: 'Delete' }, textBox('input')))).toBeNull();
  });

  it('matchAction_textEditingCtrlCombinationsInsideATextBox_areSuppressed', () => {
    expect(matchAction(key({ key: 'c', ctrlKey: true }, textBox()))).toBeNull();
    expect(matchAction(key({ key: 'v', ctrlKey: true }, textBox()))).toBeNull();
    expect(matchAction(key({ key: 'a', ctrlKey: true }, textBox()))).toBeNull();
  });

  it('matchAction_escapeInsideATextBox_isStillDispatched', () => {
    expect(matchAction(key({ key: 'Escape' }, textBox()))).toBe('cancel');
  });

  it('matchAction_ctrlZInsideATextBox_isStillDispatched', () => {
    expect(matchAction(key({ key: 'z', ctrlKey: true }, textBox()))).toBe('undo');
  });

  it('matchAction_metaKeyOnMacStyleHardware_behavesLikeCtrl', () => {
    expect(matchAction(key({ key: 'd', metaKey: true }))).toBe('duplicate');
  });
});

describe('registerShortcuts', () => {
  it('registerShortcuts_matchingKey_callsTheHandlerAndPreventsTheDefault', () => {
    const target = new EventTarget();
    const onNewNote = vi.fn();
    const teardown = registerShortcuts({ 'new-note': onNewNote }, target);

    const event = key({ key: 'n' });
    target.dispatchEvent(event);

    expect(onNewNote).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    teardown();
  });

  it('registerShortcuts_unhandledAction_leavesTheDefaultAlone', () => {
    const target = new EventTarget();
    const teardown = registerShortcuts({ 'new-note': vi.fn() }, target);

    const event = key({ key: 'i' });
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    teardown();
  });

  it('registerShortcuts_teardown_removesTheListener', () => {
    const target = new EventTarget();
    const onNewNote = vi.fn();
    registerShortcuts({ 'new-note': onNewNote }, target)();

    target.dispatchEvent(key({ key: 'n' }));
    expect(onNewNote).not.toHaveBeenCalled();
  });
});

describe('SHORTCUT_LABELS', () => {
  it('shortcutLabels_everyAction_printsALabelTheMenusCanReuse', () => {
    expect(SHORTCUT_LABELS['bring-forward']).toBe('Ctrl+]');
    expect(SHORTCUT_LABELS['send-back']).toBe('Ctrl+[');
    expect(SHORTCUT_LABELS.delete).toBe('Del');
    expect(Object.values(SHORTCUT_LABELS).every((l) => l.length > 0)).toBe(true);
  });
});
