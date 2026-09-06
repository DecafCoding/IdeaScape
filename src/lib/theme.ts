/**
 * The theme applicator — the one place `data-theme` is set or removed.
 *
 * There is deliberately no `matchMedia` listener anywhere in the front end. `src/lib/theme.css`
 * was written in Phase 1 as two guarded blocks — `:root[data-theme='dark']` and
 * `@media (prefers-color-scheme: dark) :root:not([data-theme='light'])` — so an absent
 * attribute already means "follow Windows", in both directions, and the browser re-evaluates
 * the media query live when Windows changes. A listener would be a second source of truth for
 * the same fact.
 *
 * Note that `light` writes the attribute rather than leaving it absent: absent is System, and
 * a user on a dark Windows who chose Light would otherwise get dark.
 *
 * Design-system §11.3 gives the theme change a duration of 0 ms — it is a repaint, not a
 * transition — so nothing here animates and no `background`/`color` transition exists to
 * smooth it.
 */
import type { Theme } from './settings.svelte';

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}
