/**
 * The theme applicator. Four assertions, because the module is four lines — and the one
 * that matters is that Light writes the attribute rather than removing it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme } from '../theme';

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('applyTheme_dark_setsTheAttribute', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('applyTheme_light_setsTheAttributeRatherThanRemovingIt', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('applyTheme_system_removesTheAttribute', () => {
    applyTheme('light');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('applyTheme_darkThenSystem_leavesNoAttributeBehind', () => {
    applyTheme('dark');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('applyTheme_anExplicitRoot_leavesTheDocumentAlone', () => {
    const root = document.createElement('div');
    applyTheme('dark', root);
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
