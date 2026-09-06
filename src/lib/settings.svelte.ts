/**
 * The typed settings module — the one place the four values in
 * `%APPDATA%\IdeaScape\settings.json` are read and written. CLAUDE.md requires settings be
 * read once through one typed module, so nothing else in the front end may hold them.
 *
 * Phase 1 shipped this as a plain `settings.ts` holding frozen defaults; Phase 5 put the
 * file behind the same accessor and backed the store with `$state`, so a component that
 * reads `getSettings()` re-renders when a setting changes. That rune is the whole reason
 * this file carries the `.svelte.ts` extension.
 *
 * A settings read or write that fails is a `logWarn` and nothing else: the file holds no
 * user data (PRD §8.2), and §10 contract 6 forbids a confirm on the Settings screen. A
 * failed write leaves the value applied for the session.
 */
import { invokeSafe } from './ipc';
import { logWarn } from './logger';

export type ZoomModifier = 'scroll' | 'ctrl-scroll';
export type Theme = 'light' | 'dark' | 'system';

export interface Settings {
  /** The ceiling on how long queued geometry may sit unwritten. Options: 1000 / 3000 / 10000. */
  autoSaveMs: number;
  snapToGrid: boolean;
  zoomWith: ZoomModifier;
  theme: Theme;
}

/** The Settings screen's own drawn defaults (design-system §9.11). */
export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  autoSaveMs: 3000,
  snapToGrid: false,
  zoomWith: 'scroll',
  theme: 'light',
});

/** The three cadences the Auto-save segmented control offers. */
export const AUTO_SAVE_OPTIONS = [1000, 3000, 10000] as const;
export const ZOOM_OPTIONS: readonly ZoomModifier[] = ['scroll', 'ctrl-scroll'];
export const THEME_OPTIONS: readonly Theme[] = ['light', 'dark', 'system'];

const store = $state<Settings>({ ...DEFAULT_SETTINGS });

export function getSettings(): Readonly<Settings> {
  return store;
}

/** Called once with the values read from settings.json, and by `setSetting` per change. */
export function applySettings(patch: Partial<Settings>): Readonly<Settings> {
  Object.assign(store, patch);
  return store;
}

export function resetSettings(): void {
  Object.assign(store, DEFAULT_SETTINGS);
}

/**
 * The same allowed sets the Rust `sanitize` enforces, so a hand-edited file cannot put the
 * UI into a state no control can draw. An invalid value falls back per field: a user who
 * edits one line badly does not lose the other three.
 */
export function sanitizeSettings(raw: unknown): Settings {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const autoSaveMs = AUTO_SAVE_OPTIONS.some((ms) => ms === source.autoSaveMs)
    ? (source.autoSaveMs as number)
    : DEFAULT_SETTINGS.autoSaveMs;
  const zoomWith = ZOOM_OPTIONS.includes(source.zoomWith as ZoomModifier)
    ? (source.zoomWith as ZoomModifier)
    : DEFAULT_SETTINGS.zoomWith;
  const theme = THEME_OPTIONS.includes(source.theme as Theme)
    ? (source.theme as Theme)
    : DEFAULT_SETTINGS.theme;
  const snapToGrid =
    typeof source.snapToGrid === 'boolean' ? source.snapToGrid : DEFAULT_SETTINGS.snapToGrid;
  return { autoSaveMs, snapToGrid, zoomWith, theme };
}

/** Read the file. Never throws: a failure is the defaults plus a warning in the log. */
export async function loadSettings(): Promise<Readonly<Settings>> {
  try {
    const raw = await invokeSafe<unknown>('read_settings');
    return applySettings(sanitizeSettings(raw));
  } catch (error) {
    logWarn('the settings file could not be read; using the defaults', error);
    return applySettings(DEFAULT_SETTINGS);
  }
}

/**
 * Apply to the store first so the page responds instantly (§10 contract 6: settings apply
 * as they are made), then write the whole file. A failed write is logged and nothing else.
 */
export async function setSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): Promise<void> {
  applySettings({ [key]: value } as Partial<Settings>);
  try {
    // Spread the store on the way out: `invoke` structured-clones its arguments and a
    // `$state` proxy throws there, at runtime rather than at build time.
    await invokeSafe('write_settings', { settings: { ...getSettings() } });
  } catch (error) {
    logWarn('the settings file could not be written; the value applies for this session', error);
  }
}

/**
 * The folder the application actually resolved, for the Settings page footer. The literal
 * is the fallback so the line is never empty, and never a path the file is not at in the
 * normal case.
 */
export async function settingsLocation(): Promise<string> {
  try {
    return await invokeSafe<string>('settings_location');
  } catch (error) {
    logWarn('the settings folder could not be resolved', error);
    return '%APPDATA%\\IdeaScape';
  }
}

/**
 * The properties panel footer copy, derived from the setting rather than hard-coded — the
 * mockup's literal "autosave in 2s" is a drawn example, not the authoritative value.
 */
export function autoSaveFooterText(settings: Readonly<Settings> = store): string {
  const seconds = Math.round(settings.autoSaveMs / 100) / 10;
  const rendered = Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1);
  return `Changes save automatically · autosave in ${rendered}s`;
}
