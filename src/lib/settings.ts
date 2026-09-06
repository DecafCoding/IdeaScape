/**
 * The typed settings module. CLAUDE.md requires settings be read once through one typed
 * module, so this file exists now even though its `settings.json` under
 * `%APPDATA%\IdeaScape` and the Settings screen are both Phase 5. In this phase the
 * defaults are the only source; Phase 5 adds the file behind the same accessor.
 */

export type ZoomModifier = 'scroll' | 'ctrl-scroll';
export type Theme = 'light' | 'dark' | 'system';

export interface Settings {
  /** How long the panel footer says the next automatic save is away. Options: 1000 / 3000 / 10000. */
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

let current: Settings = { ...DEFAULT_SETTINGS };

export function getSettings(): Readonly<Settings> {
  return current;
}

/** Phase 5 calls this once with the values read from settings.json. */
export function applySettings(patch: Partial<Settings>): Readonly<Settings> {
  current = { ...current, ...patch };
  return current;
}

export function resetSettings(): void {
  current = { ...DEFAULT_SETTINGS };
}

/**
 * The properties panel footer copy, derived from the setting rather than hard-coded — the
 * mockup's literal "autosave in 2s" is a drawn example, not the authoritative value.
 */
export function autoSaveFooterText(settings: Readonly<Settings> = current): string {
  const seconds = Math.round(settings.autoSaveMs / 100) / 10;
  const rendered = Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1);
  return `Changes save automatically · autosave in ${rendered}s`;
}
