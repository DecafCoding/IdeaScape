/**
 * The settings module: the per-field sanitizer, the load that never throws, and the write
 * that applies before it persists and never surfaces a failure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('../logger', () => ({ logError: vi.fn(), logInfo: vi.fn(), logWarn: vi.fn() }));

const {
  DEFAULT_SETTINGS,
  autoSaveFooterText,
  getSettings,
  loadSettings,
  resetSettings,
  sanitizeSettings,
  setSetting,
} = await import('../settings.svelte');

describe('the settings module', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
    resetSettings();
  });

  it('sanitizeSettings_emptyObject_isTheDrawnDefaults', () => {
    expect(sanitizeSettings({})).toEqual({ ...DEFAULT_SETTINGS });
    expect(sanitizeSettings(null)).toEqual({ ...DEFAULT_SETTINGS });
    expect(sanitizeSettings('not an object')).toEqual({ ...DEFAULT_SETTINGS });
  });

  it('sanitizeSettings_unknownTheme_fallsBackToLight', () => {
    expect(sanitizeSettings({ theme: 'sepia' }).theme).toBe('light');
  });

  it('sanitizeSettings_cadenceOffTheLadder_fallsBackTo3000', () => {
    expect(sanitizeSettings({ autoSaveMs: 250 }).autoSaveMs).toBe(3000);
    expect(sanitizeSettings({ autoSaveMs: '3000' }).autoSaveMs).toBe(3000);
  });

  it('sanitizeSettings_unknownFont_fallsBackToSerif', () => {
    expect(sanitizeSettings({ font: 'wingdings' }).font).toBe('serif');
    expect(sanitizeSettings({ font: 'marker' }).font).toBe('marker');
  });

  it('sanitizeSettings_oneBadField_keepsTheOtherFive', () => {
    const cleaned = sanitizeSettings({
      autoSaveMs: 10000,
      snapToGrid: true,
      zoomWith: 'pinch',
      theme: 'dark',
      font: 'marker',
    });
    expect(cleaned).toEqual({
      autoSaveMs: 10000,
      snapToGrid: true,
      zoomWith: 'scroll',
      theme: 'dark',
      font: 'marker',
      // Absent from the input entirely — anything that is not literally `false` is on.
      showWritingCards: true,
    });
  });

  it('loadSettings_readCommandFails_keepsTheDefaultsAndDoesNotThrow', async () => {
    invoke.mockRejectedValue('the file could not be read');
    await expect(loadSettings()).resolves.toEqual({ ...DEFAULT_SETTINGS });
    expect(getSettings()).toEqual({ ...DEFAULT_SETTINGS });
  });

  it('loadSettings_fileHoldsValues_appliesThemToTheStore', async () => {
    invoke.mockResolvedValue({
      autoSaveMs: 10000,
      snapToGrid: true,
      zoomWith: 'ctrl-scroll',
      theme: 'dark',
    });
    await loadSettings();
    expect(getSettings().theme).toBe('dark');
    expect(getSettings().snapToGrid).toBe(true);
  });

  it('setSetting_anyKey_appliesBeforeItWrites', async () => {
    let appliedWhenTheWriteRan: boolean | null = null;
    invoke.mockImplementation(() => {
      appliedWhenTheWriteRan = getSettings().snapToGrid;
      return Promise.resolve();
    });
    await setSetting('snapToGrid', true);
    expect(appliedWhenTheWriteRan).toBe(true);
    expect(getSettings().snapToGrid).toBe(true);
  });

  it('setSetting_writeFails_leavesTheValueApplied', async () => {
    invoke.mockRejectedValue('the disk is full');
    await expect(setSetting('theme', 'dark')).resolves.toBeUndefined();
    expect(getSettings().theme).toBe('dark');
  });

  it('setSetting_anyKey_sendsAPlainObjectNotAProxy', async () => {
    await setSetting('autoSaveMs', 10000);
    expect(invoke).toHaveBeenCalledWith('write_settings', {
      settings: {
        autoSaveMs: 10000,
        snapToGrid: false,
        zoomWith: 'scroll',
        theme: 'light',
        font: 'serif',
        showWritingCards: true,
      },
    });
    const sent = invoke.mock.calls[0][1].settings;
    // Structured clone throws on a Proxy: the object handed to invoke must be a plain one.
    expect(structuredClone(sent)).toEqual(sent);
    expect(Object.getPrototypeOf(sent)).toBe(Object.prototype);
  });

  it('autoSaveFooterText_tenSeconds_readsAutosaveIn10s', () => {
    expect(autoSaveFooterText({ ...DEFAULT_SETTINGS, autoSaveMs: 10000 })).toBe(
      'Changes save automatically · autosave in 10s',
    );
    expect(autoSaveFooterText({ ...DEFAULT_SETTINGS, autoSaveMs: 1000 })).toBe(
      'Changes save automatically · autosave in 1s',
    );
  });

  it('settingsLocation_commandFails_fallsBackToTheDrawnLiteral', async () => {
    const { settingsLocation } = await import('../settings.svelte');
    invoke.mockRejectedValue('nope');
    await expect(settingsLocation()).resolves.toBe('%APPDATA%\\IdeaScape');
  });
});
