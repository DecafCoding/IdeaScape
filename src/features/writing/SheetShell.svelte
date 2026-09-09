<!--
  The shared full-screen sheet shell (design-system §9.30).

  ONE header, ONE back affordance, ONE body grid, for all three sheets. No per-sheet
  component may re-implement any of them: if a sheet needs a different header, the difference
  belongs in a prop — the Chapter's Card actions are the one such variation (§9.33).

  The sheet REPLACES THE CANVAS, exactly where `SettingsPage` renders. The title bar, the
  rail and the properties panel all stay, and A SHEET TAKES NO STACKING RUNG (§8.6): it is
  not a dialog and must never be layered over the canvas.

  The body is exposed as two named snippets: an `identity` band and a `columns` band. A sheet
  fills them; it does not restyle them.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    /** The card's own name, at 14px/600 in the header. */
    name: string;
    /** The card type, at 9.5px uppercase on the same baseline. */
    typeLabel: string;
    onBack?: () => void;
    /** The identity band: a picture beside a column of short fields. */
    identity?: Snippet;
    /** The two-column band below it. */
    columns?: Snippet;
    /** A single full-width band, for the Chapter's strip and writing surface. */
    full?: Snippet;
    /** Right-aligned header actions. Only the Chapter uses them (§9.33). */
    headerActions?: Snippet;
  }

  const { name, typeLabel, onBack, identity, columns, full, headerActions }: Props = $props();
</script>

<main class="sheet" data-testid="writing-sheet">
  <header class="header">
    <button type="button" class="back" onclick={() => onBack?.()} data-testid="sheet-back">
      <Icon glyph="arrow-left" size={13} />
      Back to canvas
    </button>
    <h1 class="name" data-testid="sheet-name">{name}</h1>
    <span class="type" data-testid="sheet-type">{typeLabel}</span>
    {#if headerActions}
      <span class="header-actions">{@render headerActions()}</span>
    {/if}
  </header>

  <div class="body scroll-thin">
    {#if identity}
      <section class="identity" data-testid="sheet-identity">{@render identity()}</section>
    {/if}
    {#if columns}
      <section class="columns" data-testid="sheet-columns">{@render columns()}</section>
    {/if}
    {@render full?.()}
  </div>
</main>

<style>
  .sheet {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
    color: var(--color-text);
    overflow: hidden;
  }

  .header {
    flex: none;
    display: flex;
    align-items: baseline;
    gap: var(--space-12);
    padding: 11px var(--space-26);
    border-bottom: 1px solid var(--color-divider);
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: var(--space-6);
    align-self: center;
    padding: 3px var(--space-9);
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-md);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-11-5);
    cursor: pointer;
  }

  .back:hover {
    background: var(--tint-neutral-hover);
  }

  .name {
    margin: 0;
    font-size: var(--text-14);
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .type {
    font-size: var(--text-9-5);
    letter-spacing: var(--tracking-11);
    text-transform: uppercase;
    opacity: 0.45;
  }

  .header-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-6);
    margin-left: auto;
    align-self: center;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: var(--space-22) var(--space-26);
    overflow-y: auto;
    min-height: 0;
    flex: 1;
  }

  .identity {
    display: flex;
    gap: var(--space-22);
    align-items: flex-start;
  }

  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-26);
    align-items: start;
  }
</style>
