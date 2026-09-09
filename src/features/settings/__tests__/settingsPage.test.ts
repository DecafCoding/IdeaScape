/**
 * The Settings page, and Milestone 3's checkpoint: a change made on the page reaching the
 * store, the seam and — for Theme — the root element, all in one assertion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';

const invokeSafe = vi.fn();
vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (...args: unknown[]) => invokeSafe(...args),
  IpcError: class extends Error {},
}));
vi.mock('../../../lib/logger', () => ({ logError: vi.fn(), logInfo: vi.fn(), logWarn: vi.fn() }));

const SettingsPage = (await import('../SettingsPage.svelte')).default;
const { getSettings, resetSettings } = await import('../../../lib/settings.svelte');

function show(folderPath: string | null = String.raw`C:\Projects\Hull`, onBack = () => {}) {
  return render(SettingsPage, { props: { folderPath, onBack } });
}

beforeEach(() => {
  invokeSafe.mockReset();
  invokeSafe.mockImplementation((command: string) =>
    command === 'settings_location'
      ? Promise.resolve(String.raw`C:\Users\Someone\AppData\Roaming\IdeaScape`)
      : Promise.resolve(undefined),
  );
  resetSettings();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-font');
});

afterEach(cleanup);

describe('the Settings page', () => {
  it('settingsPage_render_showsTheFiveRowsInThreeGroups', () => {
    const { getByText, getByRole } = show();
    for (const group of ['Files', 'Canvas', 'Appearance']) expect(getByText(group)).toBeTruthy();
    for (const label of ['Project folder', 'Auto-save', 'Snap to grid', 'Zoom with', 'Theme']) {
      expect(getByText(label)).toBeTruthy();
    }
    // Three segmented groups and one switch.
    expect(getByRole('radiogroup', { name: 'Auto-save' })).toBeTruthy();
    expect(getByRole('radiogroup', { name: 'Zoom with' })).toBeTruthy();
    expect(getByRole('radiogroup', { name: 'Theme' })).toBeTruthy();
    expect(getByRole('switch', { name: 'Snap to grid' })).toBeTruthy();
  });

  it('settingsPage_render_showsEachRowsDrawnHelperText', () => {
    const { getByText } = show();
    expect(getByText('Written atomically; the canvas never blocks on a save.')).toBeTruthy();
    expect(getByText('Off keeps free placement to the pixel.')).toBeTruthy();
    expect(getByText('Ctrl+scroll leaves the plain wheel free to pan.')).toBeTruthy();
  });

  it('settingsPage_render_marksTheDrawnDefaultsActive', () => {
    const { getByRole, getAllByRole } = show();
    expect(getByRole('radio', { name: '3s' }).getAttribute('aria-checked')).toBe('true');
    expect(getByRole('radio', { name: 'Scroll' }).getAttribute('aria-checked')).toBe('true');
    expect(getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true');
    const [snap, showWriting] = getAllByRole('switch');
    expect(snap.getAttribute('aria-checked')).toBe('false');
    // settingsPage_showWritingCards_defaultsToOn
    expect(showWriting.getAttribute('aria-checked')).toBe('true');
  });

  it('settingsPage_hasASeventhRowInAFullWidthPacksGroup', () => {
    const { getByTestId } = show();
    const packs = getByTestId('settings-packs');
    expect(packs.className).toContain('full-width');
    expect(packs.textContent).toContain('Packs');
    expect(packs.textContent).toContain('Show Writing Cards');
    expect(packs.textContent).toContain('Cards already on a canvas stay.');
  });

  it('settingsPage_noProjectOpen_saysSoInThePathRow', () => {
    const { getByTestId } = show(null);
    expect(getByTestId('settings-folder').textContent).toBe('No project is open');
  });

  it('settingsPage_projectOpen_printsThePathMarkedReadOnly', () => {
    const { getByTestId, getByText } = show();
    expect(getByTestId('settings-folder').textContent).toBe(String.raw`C:\Projects\Hull`);
    expect(getByText('read-only')).toBeTruthy();
  });

  it('settingsPage_render_printsTheSettingsFileLocationInTheFooter', async () => {
    const { getByTestId } = show();
    // The drawn literal is there before the command resolves, so the line is never empty.
    expect(getByTestId('settings-footer').textContent).toContain('settings.json');
    await waitFor(() =>
      expect(getByTestId('settings-footer').textContent).toContain(
        String.raw`C:\Users\Someone\AppData\Roaming\IdeaScape`,
      ),
    );
    expect(getByTestId('settings-footer').textContent).toContain('nothing leaves this machine');
  });

  it('settingsPage_render_hasNoSaveOrCancelButton', () => {
    const { queryByText } = show();
    for (const forbidden of ['Save', 'Cancel', 'Apply', 'OK']) {
      expect(queryByText(forbidden)).toBeNull();
    }
  });

  it('settingsPage_backToCanvas_callsOnBack', async () => {
    let backs = 0;
    const { getByTestId } = show(String.raw`C:\P`, () => (backs += 1));
    await fireEvent.click(getByTestId('settings-back'));
    expect(backs).toBe(1);
  });

  /**
   * Milestone 3's checkpoint. Each control in turn: the store moves, exactly one
   * `write_settings` carries all five values, the drawn active option moves, and Theme and
   * Font also move `data-theme` / `data-font` on the root — Theme taking its attribute off
   * again on System, Font never, because Font has no "follow Windows" choice.
   */
  it('milestone3_everyControl_movesTheStoreTheFileAndForThemeTheRootElement', async () => {
    const { getByRole, getAllByRole } = show();

    const writes = () => invokeSafe.mock.calls.filter((c) => c[0] === 'write_settings');

    await fireEvent.click(getByRole('radio', { name: '10s' }));
    await waitFor(() => expect(getSettings().autoSaveMs).toBe(10000));
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1]).toEqual({
      settings: {
        autoSaveMs: 10000,
        snapToGrid: false,
        zoomWith: 'scroll',
        theme: 'light',
        font: 'serif',
        showWritingCards: true,
      },
    });
    expect(getByRole('radio', { name: '10s' }).getAttribute('aria-checked')).toBe('true');
    expect(getByRole('radio', { name: '3s' }).getAttribute('aria-checked')).toBe('false');

    // Two switches now: Snap to grid, then the Packs group's Show Writing Cards.
    const [snap, showWriting] = getAllByRole('switch');
    await fireEvent.click(snap);
    await waitFor(() => expect(getSettings().snapToGrid).toBe(true));
    expect(writes()).toHaveLength(2);
    expect(snap.getAttribute('aria-checked')).toBe('true');

    await fireEvent.click(getByRole('radio', { name: 'Ctrl+scroll' }));
    await waitFor(() => expect(getSettings().zoomWith).toBe('ctrl-scroll'));
    expect(writes()).toHaveLength(3);
    expect(getByRole('radio', { name: 'Ctrl+scroll' }).getAttribute('aria-checked')).toBe('true');

    await fireEvent.click(getByRole('radio', { name: 'Dark' }));
    await waitFor(() => expect(getSettings().theme).toBe('dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(writes()).toHaveLength(4);
    expect(writes()[3][1]).toEqual({
      settings: {
        autoSaveMs: 10000,
        snapToGrid: true,
        zoomWith: 'ctrl-scroll',
        theme: 'dark',
        font: 'serif',
        showWritingCards: true,
      },
    });

    await fireEvent.click(getByRole('radio', { name: 'System' }));
    await waitFor(() => expect(getSettings().theme).toBe('system'));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(writes()).toHaveLength(5);

    await fireEvent.click(getByRole('radio', { name: 'Marker' }));
    await waitFor(() => expect(getSettings().font).toBe('marker'));
    expect(document.documentElement.getAttribute('data-font')).toBe('marker');
    expect(writes()).toHaveLength(6);

    // Serif is the default, and it writes the attribute rather than removing it.
    await fireEvent.click(getByRole('radio', { name: 'Serif' }));
    await waitFor(() => expect(getSettings().font).toBe('serif'));
    expect(document.documentElement.getAttribute('data-font')).toBe('serif');
    expect(writes()).toHaveLength(7);

    // The seventh row, in the full-width Packs group. Default on.
    expect(showWriting.getAttribute('aria-checked')).toBe('true');
    await fireEvent.click(showWriting);
    await waitFor(() => expect(getSettings().showWritingCards).toBe(false));
    expect(writes()).toHaveLength(8);
  });

  it('milestone3_keyboard_reachesEveryControlAndArrowsStayInsideTheirGroup', async () => {
    const { getByRole, getAllByRole } = show();

    // Every control is reachable: exactly one tabbable option per group, plus the switch and
    // the Back button, and nothing is tabindex -1 that should not be.
    const tabbable = [
      ...getAllByRole('radio'),
      ...getAllByRole('switch'),
      ...getAllByRole('button'),
    ]
      .filter((el) => el.getAttribute('tabindex') !== '-1')
      .filter((el, index, all) => all.indexOf(el) === index);
    // 4 checked radios + 2 switches + Back = 7.
    expect(tabbable).toHaveLength(7);

    // An arrow key inside the Theme group moves within it and never into Zoom with.
    await fireEvent.keyDown(getByRole('radio', { name: 'Light' }), { key: 'ArrowLeft' });
    await waitFor(() => expect(getSettings().theme).toBe('system'));
    expect(getSettings().zoomWith).toBe('scroll');
  });
});
