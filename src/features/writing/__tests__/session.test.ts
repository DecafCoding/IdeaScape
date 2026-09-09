import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';

const invokeSafe = vi.fn();
vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (...args: unknown[]) => invokeSafe(...args),
  IpcError: class extends Error {},
  toFileUrl: (p: string) => p,
}));

const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const { setBlueprints } = await import('../../../lib/blueprints.svelte');
const { undoStack } = await import('../../undo/undoStack.svelte');
const { randomizeCommand, setFieldCommand } = await import('../../undo/commands');
const { closeSheet, openSheetFor, sheetOpen } = await import('../writing.svelte');
const { isTextEntry, matchAction } = await import('../../../lib/shortcuts');
const { rollSpread } = await import('../../../lib/randomize');

import type { Blueprint } from '../../../lib/blueprints.svelte';
import type { Item, Placement } from '../../../lib/types';

const CHARACTER: Blueprint = {
  id: 'character',
  label: 'Character',
  glyph: 'user-circle',
  sheet: true,
  default_size: { width: 220, height: 210 },
  fields: [
    { key: 'name', label: 'Name', kind: 'short-text', meaning: 'x', show_on_face: true },
    ...['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'].map(
      (key) => ({
        key,
        label: key,
        kind: 'scale' as const,
        meaning: 'x',
        show_on_face: false,
        low: 'Low',
        high: 'High',
        randomizable: true,
      }),
    ),
  ],
};

/** The payload as the store currently holds it — the mock writes through it. */
let payload: Record<string, unknown> = {};

function currentItem(): Item {
  return {
    id: 1,
    project_id: 1,
    kind: 'blueprint',
    payload: JSON.stringify(payload),
    created_at: 't',
    updated_at: 't',
  };
}

beforeEach(() => {
  invokeSafe.mockReset();
  undoStack.clear();
  setBlueprints([CHARACTER]);
  closeSheet();
  payload = { blueprint: 'character', name: 'Vela', detail_canvas_id: null, fields: {} };

  canvasStore.closeProject();
  canvasStore.project = { id: 1, name: 'P', created_at: 't', updated_at: 't' };
  canvasStore.activeCanvasId = 1;
  const placement: Placement = {
    id: 3,
    canvas_id: 1,
    item_id: 1,
    x: 0,
    y: 0,
    width: 220,
    height: 210,
    z_order: 0,
  };
  canvasStore.upsertCard({ placement, item: currentItem() });

  // `set_item_field` is the ONE write path: the mock applies it exactly as Rust does.
  invokeSafe.mockImplementation((command: string, args?: Record<string, unknown>) => {
    if (command !== 'set_item_field') return Promise.resolve(null);
    const { key, value } = args as { key: string; value: unknown };
    if (key === 'name' || key === 'detail_canvas_id') {
      payload[key] = value;
    } else {
      const fields = payload.fields as Record<string, unknown>;
      if (value === null) delete fields[key];
      else fields[key] = value;
    }
    return Promise.resolve(currentItem());
  });
});

describe('a writing card, end to end', () => {
  it('session_editingAFieldOnTheSheetAndInThePanel_produceTheSamePayload', async () => {
    // Both surfaces call the same command with the same key, which is what makes editing a
    // card on its sheet and editing it in the panel produce ONE payload shape.
    const fromPanel = setFieldCommand(1, 'name', 'Vela', 'Vela Aster');
    await fromPanel.redo();
    const afterPanel = JSON.stringify(payload);

    payload = { blueprint: 'character', name: 'Vela', detail_canvas_id: null, fields: {} };
    const fromSheet = setFieldCommand(1, 'name', 'Vela', 'Vela Aster');
    await fromSheet.redo();

    expect(JSON.stringify(payload)).toBe(afterPanel);
    expect(fromPanel.label).toBe(fromSheet.label);
  });

  it('session_setFieldCommand_undoPutsThePreviousValueBackOnDisk', async () => {
    const command = setFieldCommand(1, 'openness', null, 2);
    await command.redo();
    expect((payload.fields as Record<string, unknown>).openness).toBe(2);

    await command.undo();
    // A null removes the key, so an undone edit is genuinely back to unanswered.
    expect((payload.fields as Record<string, unknown>).openness).toBeUndefined();
  });

  it('session_randomize_writesFiveFieldsAndIsOneUndoEntry', async () => {
    const keys = CHARACTER.fields.filter((f) => f.randomizable).map((f) => f.key);
    const before = keys.map(() => 0);
    const after = rollSpread(keys.length);

    const command = randomizeCommand(1, keys, before, after);
    undoStack.push(command);
    await command.redo();

    // Five values written…
    for (let i = 0; i < keys.length; i += 1) {
      expect((payload.fields as Record<string, unknown>)[keys[i]]).toBe(after[i]);
    }
    // …as ONE undo entry. Five separate commands would need five Ctrl+Z presses.
    expect(undoStack.undoDepth).toBe(1);
    expect(command.label).toBe('Randomize');
  });

  it('session_undoAfterRandomize_restoresAllFiveInOneStepAndChangesNoOtherField', async () => {
    (payload.fields as Record<string, unknown>).notes = 'kept';
    const keys = CHARACTER.fields.filter((f) => f.randomizable).map((f) => f.key);
    const command = randomizeCommand(1, keys, [1, -1, 0, 2, -2], [3, 3, 3, 3, 3]);

    await command.redo();
    await command.undo();

    expect(keys.map((k) => (payload.fields as Record<string, unknown>)[k])).toEqual([
      1, -1, 0, 2, -2,
    ]);
    // Randomize touches the sliders and nothing else.
    expect((payload.fields as Record<string, unknown>).notes).toBe('kept');
    expect(payload.name).toBe('Vela');
  });

  it('session_openingASheetAndLeavingIt_commitsNothingExtra', () => {
    canvasStore.setSelection([3]);
    openSheetFor(3);
    expect(sheetOpen()).toBe(true);
    const writes = invokeSafe.mock.calls.length;

    closeSheet();
    expect(sheetOpen()).toBe(false);
    // A sheet is a VIEW of one card, not a mode: leaving it writes nothing.
    expect(invokeSafe.mock.calls.length).toBe(writes);
    expect([...canvasStore.selection]).toEqual([3]);
  });
});

describe('Esc on a sheet', () => {
  /** The sheet's own handler, exactly as `app.svelte` builds it. */
  function cancel(focused: EventTarget | null) {
    if (isTextEntry(focused) && focused instanceof HTMLElement) {
      focused.blur();
      return 'blurred';
    }
    closeSheet();
    return 'left';
  }

  beforeEach(() => {
    canvasStore.setSelection([3]);
    openSheetFor(3);
    flushSync();
  });

  it('sheetShortcuts_escWithNoTextFocus_leavesTheSheet', () => {
    expect(cancel(document.body)).toBe('left');
    expect(sheetOpen()).toBe(false);
  });

  it('sheetShortcuts_escInsideATextBox_blursItAndKeepsTheSheetOpen', () => {
    const box = document.createElement('textarea');
    document.body.append(box);
    box.focus();

    expect(cancel(box)).toBe('blurred');
    expect(sheetOpen()).toBe(true);
    box.remove();
  });

  it('sheetShortcuts_escTwiceFromATextBox_leavesTheSheet', () => {
    const box = document.createElement('textarea');
    document.body.append(box);
    box.focus();

    // The first press gets you out of the prose…
    cancel(box);
    expect(sheetOpen()).toBe(true);
    // …and the second gets you out of the sheet.
    cancel(document.activeElement);
    expect(sheetOpen()).toBe(false);
    box.remove();
  });

  it('matchAction_escapeInsideATextBox_isStillCancel', () => {
    // Deliberately: `matchAction` returns cancel for Escape BEFORE its own text bail so a
    // note editor can cancel. That is why the two-press behaviour lives in the handler.
    const box = document.createElement('textarea');
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    Object.defineProperty(event, 'target', { value: box });
    expect(matchAction(event)).toBe('cancel');
  });
});
