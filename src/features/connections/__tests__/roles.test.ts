import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const invokeSafe = vi.fn();
vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (...args: unknown[]) => invokeSafe(...args),
  IpcError: class extends Error {},
  toFileUrl: (p: string) => p,
}));

const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const ConnectionLabels = (await import('../ConnectionLabels.svelte')).default;
const PropertiesPanel = (await import('../../shell/PropertiesPanel.svelte')).default;

import type { Connection, Item, Placement } from '../../../lib/types';

function placement(id: number, x: number): Placement {
  return { id, canvas_id: 1, item_id: id, x, y: 0, width: 200, height: 100, z_order: 0 };
}

function item(id: number): Item {
  return {
    id,
    project_id: 1,
    kind: 'note',
    payload: JSON.stringify({ title: `Card ${id}`, text: '' }),
    created_at: 't',
    updated_at: 't',
  };
}

function connection(role: string | null, label: string | null = null): Connection {
  return {
    id: 1,
    canvas_id: 1,
    from_placement_id: 1,
    to_placement_id: 2,
    label,
    directed: 1,
    color: 'default',
    width: 1,
    label_visible: label !== null,
    route: 'straight',
    from_anchor: 'auto',
    to_anchor: 'auto',
    bend: '',
    role,
  };
}

/** Two cards `gap` world units apart, joined by one line. */
function wire(role: string | null, label: string | null = null, gap = 900) {
  canvasStore.closeProject();
  canvasStore.project = { id: 1, name: 'P', created_at: 't', updated_at: 't' };
  canvasStore.activeCanvasId = 1;
  canvasStore.viewportSize = { width: 1400, height: 900 };
  canvasStore.view = { x: 0, y: 0, zoom: 1 };
  canvasStore.upsertCard({ placement: placement(1, 0), item: item(1) });
  canvasStore.upsertCard({ placement: placement(2, gap), item: item(2) });
  canvasStore.upsertConnection(connection(role, label));
}

function renderLabels() {
  const host = document.createElement('div');
  document.body.append(host);
  const component = mount(ConnectionLabels, { target: host, props: {} });
  flushSync();
  return {
    host,
    roles: () => [...host.querySelectorAll('[data-testid="role-mark"]')] as HTMLElement[],
    chips: () => [...host.querySelectorAll('.chip')] as HTMLElement[],
    layer: () => host.querySelector('[data-testid="connection-labels"]') as HTMLElement,
    refresh() {
      flushSync();
    },
    destroy() {
      void unmount(component);
      host.remove();
    },
  };
}

function at(el: HTMLElement): { x: number; y: number } {
  const style = el.getAttribute('style') ?? '';
  return {
    x: Number(/left: ([-\d.]+)px/.exec(style)?.[1] ?? NaN),
    y: Number(/top: ([-\d.]+)px/.exec(style)?.[1] ?? NaN),
  };
}

beforeEach(() => {
  invokeSafe.mockReset();
  invokeSafe.mockResolvedValue(null);
});

describe('the role on the line', () => {
  it('connectionLayer_aFeedsRole_drawsA15pxRestGlyphAtTheMidpoint', () => {
    wire('feeds');
    const view = renderLabels();
    const marks = view.roles();
    expect(marks).toHaveLength(1);
    expect(marks[0].querySelector('.ph-arrow-right')).not.toBeNull();
    expect(marks[0].className).not.toContain('open');
    expect(marks[0].getAttribute('aria-label')).toBe('Feeds');
    // Centred on the line: the two cards span 0..1100, so the midpoint is 550.
    expect(at(marks[0]).x).toBeCloseTo(550, 0);
    view.destroy();
  });

  it('connectionLayer_aNullRole_drawsNoMarkAtAll', () => {
    wire(null);
    const view = renderLabels();
    expect(view.roles()).toHaveLength(0);
    expect(view.layer().getAttribute('data-roles-drawn')).toBe('0');
    view.destroy();
  });

  it('connectionLayer_aRelatesToRole_drawsNoMarkEither', () => {
    // NULL and 'relates-to' must be indistinguishable on screen.
    wire('relates-to');
    const view = renderLabels();
    expect(view.roles()).toHaveLength(0);
    view.destroy();
  });

  it('connectionLayer_hover_opensTheGlyphIntoANamedChip', async () => {
    wire('part-of');
    const view = renderLabels();
    const mark = view.roles()[0];
    expect(mark.textContent?.trim()).toBe('');

    mark.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    flushSync();
    const opened = view.roles()[0];
    expect(opened.className).toContain('open');
    expect(opened.textContent).toContain('Part Of');
    view.destroy();
  });

  it('connectionLayer_selectingAnEndCard_opensTheChip', () => {
    wire('appears-in');
    const view = renderLabels();
    expect(view.roles()[0].className).not.toContain('open');

    // Either endpoint's CARD, not the connection: selecting a card opens every role chip
    // around it, which is how the structure of a chapter becomes readable.
    canvasStore.setSelection([2]);
    view.refresh();
    expect(view.roles()[0].className).toContain('open');
    expect(view.roles()[0].textContent).toContain('Appears In');
    view.destroy();
  });

  it('connectionLabels_aRoleAndALabel_putTheRoleAtTheMidpointAndTheLabelInTheLongerHalf', () => {
    wire('feeds', 'because');
    const view = renderLabels();
    const role = at(view.roles()[0]);
    const chip = at(view.chips()[0]);
    expect(role.x).toBeCloseTo(550, 0);
    // Never stacked: the label steps aside to the midpoint of a half.
    expect(chip.x).not.toBeCloseTo(role.x, 0);
    expect(chip.x).toBeLessThan(role.x);
    view.destroy();
  });

  it('connectionLabels_noRole_leavesTheLabelExactlyWhereItAlwaysWas', () => {
    wire(null, 'because');
    const view = renderLabels();
    // The label keeps its existing appearance and position when nothing displaces it.
    expect(at(view.chips()[0]).x).toBeCloseTo(550, 0);
    view.destroy();
  });

  it('connectionLabels_tooShortForBoth_drawsTheRoleAndKeepsTheLabelUnDrawn', () => {
    // Long enough for a label alone, too short to carry both.
    wire('feeds', 'because', 260);
    const view = renderLabels();
    expect(view.roles()).toHaveLength(1);
    expect(view.chips()).toHaveLength(0);
    // KEPT, not lost: the row still carries it.
    expect(canvasStore.connections.get(1)?.label).toBe('because');
    view.destroy();
  });

  it('connectionLayer_aRoleOffScreen_isCulledWithItsLine', () => {
    wire('feeds');
    const view = renderLabels();
    expect(view.roles()).toHaveLength(1);

    // Pan far away: the line leaves the window and its mark goes with it.
    canvasStore.view = { x: -40_000, y: -40_000, zoom: 1 };
    view.refresh();
    expect(view.roles()).toHaveLength(0);
    view.destroy();
  });
});

describe('the Role combo in the panel', () => {
  function renderPanel() {
    const host = document.createElement('div');
    document.body.append(host);
    const component = mount(PropertiesPanel, {
      target: host,
      props: { expanded: true, onToggle: () => {}, onConnectionChange: onChange },
    });
    flushSync();
    return {
      host,
      destroy() {
        void unmount(component);
        host.remove();
      },
    };
  }

  const onChange = vi.fn();

  beforeEach(() => {
    onChange.mockReset();
    wire('feeds');
    canvasStore.selectConnection(1);
    flushSync();
  });

  it('panel_theRoleComboSitsAboveTheLabelGroup', () => {
    const view = renderPanel();
    const groups = [...view.host.querySelectorAll('.group .group-label')].map((g) => g.textContent);
    expect(groups[0]).toBe('Role');
    expect(groups[1]).toBe('Label');
    view.destroy();
  });

  it('panel_theRoleCombo_showsTheRolesOwnName', () => {
    const view = renderPanel();
    const input = view.host
      .querySelector('[data-testid="panel-role-group"]')
      ?.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('Feeds');
    view.destroy();
  });

  it('panel_typingARole_isAcceptedAndStored', async () => {
    const view = renderPanel();
    const input = view.host
      .querySelector('[data-testid="panel-role-group"]')
      ?.querySelector('input') as HTMLInputElement;

    input.dispatchEvent(new FocusEvent('focus'));
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    flushSync();
    input.value = 'haunts';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    flushSync();

    // A role is never a rule: a value outside the seven is accepted like any other.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].role).toBe('haunts');
    view.destroy();
  });
});
