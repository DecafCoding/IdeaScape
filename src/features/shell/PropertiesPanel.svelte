<!--
  The properties panel (design-system §8.5): 177 px expanded, 32 px collapsed. The X/Y/W/H
  fields are the typed equivalent of dragging; the Order buttons and the footer pair are the
  same actions the element context menu offers.

  With a multi-selection, a field whose values differ across the selection reads "mixed".
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import { canvasStore } from '../../stores/canvasStore.svelte';
  import { autoSaveFooterText } from '../../lib/settings';
  import { MIN_CARD_SIZE } from '../../lib/geometry';
  import { parseNotePayload, type Placement } from '../../lib/types';

  interface Props {
    expanded: boolean;
    onToggle: () => void;
    onGeometryChange?: (field: 'x' | 'y' | 'width' | 'height', value: number) => void;
    onBringForward?: () => void;
    onSendBack?: () => void;
    onDuplicate?: () => void;
    onDelete?: () => void;
  }

  const {
    expanded,
    onToggle,
    onGeometryChange,
    onBringForward,
    onSendBack,
    onDuplicate,
    onDelete,
  }: Props = $props();

  const selected = $derived(canvasStore.selectedPlacements);
  const hasSelection = $derived(selected.length > 0);

  /** One value across the whole selection, or null when they differ. */
  function shared(field: keyof Placement): number | null {
    if (selected.length === 0) return null;
    const first = selected[0][field] as number;
    return selected.every((p) => (p[field] as number) === first) ? first : null;
  }

  const FIELDS = [
    { key: 'x', letter: 'X', group: 'position' },
    { key: 'y', letter: 'Y', group: 'position' },
    { key: 'width', letter: 'W', group: 'size' },
    { key: 'height', letter: 'H', group: 'size' },
  ] as const;

  const headerKind = $derived.by(() => {
    if (selected.length === 0) return '';
    if (selected.length > 1) return `${selected.length} Cards`;
    const item = canvasStore.itemFor(selected[0]);
    return item?.kind === 'note' ? 'Note' : 'Card';
  });

  const headerId = $derived.by(() => {
    if (selected.length === 0) return '';
    if (selected.length > 1) {
      const notes = selected.filter((p) => canvasStore.itemFor(p)?.kind === 'note').length;
      return `with ${notes} ${notes === 1 ? 'note' : 'notes'}`;
    }
    const item = canvasStore.itemFor(selected[0]);
    if (!item) return '';
    const title = parseNotePayload(item.payload).title;
    return title || `${item.kind}-${String(item.id).padStart(3, '0')}`;
  });

  function commit(field: 'x' | 'y' | 'width' | 'height', raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    const floor = field === 'width' || field === 'height' ? MIN_CARD_SIZE : -Infinity;
    onGeometryChange?.(field, Math.max(floor, value));
  }
</script>

{#if expanded}
  <aside class="panel scroll-thin" data-testid="properties-panel" aria-label="Properties">
    {#if hasSelection}
      <header class="header">
        <span class="kind">{headerKind}</span>
        <span class="item-id">{headerId}</span>
      </header>

      {#each ['position', 'size'] as const as group}
        <section class="group">
          <p class="group-label">{group === 'position' ? 'Position' : 'Size'}</p>
          <div class="pairs">
            {#each FIELDS.filter((f) => f.group === group) as field (field.key)}
              {@const value = shared(field.key)}
              <label class="field">
                {field.letter}
                <input
                  class="input"
                  class:mixed={value === null}
                  type="text"
                  value={value === null ? 'mixed' : Math.round(value)}
                  aria-label={`${group === 'position' ? 'Position' : 'Size'} ${field.letter}`}
                  onfocus={(e) => e.currentTarget.select()}
                  onchange={(e) => commit(field.key, e.currentTarget.value)}
                />
              </label>
            {/each}
          </div>
        </section>
      {/each}

      <section class="group">
        <p class="group-label">Order</p>
        <div class="order">
          <button type="button" class="order-button" onclick={onBringForward}>
            <Icon glyph="arrow-line-up" size={13} />
            Front
          </button>
          <button type="button" class="order-button" onclick={onSendBack}>
            <Icon glyph="arrow-line-down" size={13} />
            Back
          </button>
        </div>
      </section>

      <footer class="footer">
        <div class="footer-row">
          <button type="button" class="icon-button duplicate" onclick={onDuplicate}>
            <Icon glyph="copy" size={13} label="Duplicate" />
          </button>
          <button type="button" class="icon-button delete" onclick={onDelete}>
            <Icon glyph="trash" size={13} label="Delete" />
          </button>
        </div>
        <p class="footer-note">Edits here are undoable · {autoSaveFooterText().split('· ')[1]}</p>
      </footer>
    {:else}
      <p class="footer-note">Nothing is selected.</p>
    {/if}
  </aside>
{:else}
  <aside class="panel collapsed" data-testid="properties-panel" aria-label="Properties">
    <button type="button" class="caret" onclick={onToggle}>
      <Icon glyph="caret-left" size={14} label="Expand Properties" />
    </button>
    <span class="collapsed-label">Nothing Selected</span>
  </aside>
{/if}

<style>
  .panel {
    width: var(--size-panel-expanded);
    flex: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-13);
    padding: var(--space-14) var(--space-12) var(--space-12);
    background: var(--color-surface);
    border-left: 1px solid var(--color-divider);
    font-size: var(--text-12);
    overflow-y: auto;
    box-sizing: border-box;
    transition: width var(--duration-140) var(--ease);
  }

  .panel.collapsed {
    width: var(--size-panel-collapsed);
    align-items: center;
    gap: var(--space-12);
    padding: var(--space-10) 0;
  }

  .header {
    display: flex;
    flex-direction: column;
  }

  .kind {
    font-size: var(--text-13);
    font-weight: 600;
  }

  .item-id {
    font-size: var(--text-10-5);
    opacity: 0.45;
  }

  .group {
    display: flex;
    flex-direction: column;
  }

  .group-label {
    margin: 0 0 var(--space-6);
    font-size: var(--text-10);
    letter-spacing: var(--tracking-10);
    text-transform: uppercase;
    opacity: 0.45;
  }

  .pairs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-5);
  }

  .field {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--text-11);
    opacity: 0.75;
  }

  .input {
    flex: 1;
    min-width: 0;
    padding: 2px 4px;
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-md);
    background: var(--color-raised);
    color: inherit;
    font: inherit;
    font-size: var(--text-11);
    transition: border-color var(--duration-90) var(--ease);
  }

  .input:hover {
    border-color: color-mix(in srgb, var(--color-text) 28%, transparent);
  }

  .input.mixed {
    font-style: italic;
    opacity: 0.6;
  }

  .order {
    display: flex;
    gap: var(--space-5);
  }

  .order-button {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 3px 4px;
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-card);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-11);
    cursor: pointer;
    transition: background-color var(--duration-90) var(--ease);
  }

  .order-button:hover {
    background: var(--tint-neutral-hover);
    border-color: color-mix(in srgb, var(--color-text) 28%, transparent);
  }

  .order-button:active {
    background: var(--tint-neutral-press);
  }

  .footer {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .footer-row {
    display: flex;
    justify-content: space-between;
  }

  .icon-button {
    width: 30px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-card);
    background: transparent;
    cursor: pointer;
    transition: background-color var(--duration-90) var(--ease);
  }

  .icon-button.duplicate {
    border: 1px solid var(--color-accent);
    color: var(--color-accent-700);
  }

  .icon-button.duplicate:hover {
    background: var(--tint-accent-hover);
  }

  .icon-button.duplicate:active {
    background: var(--tint-accent-press);
  }

  .icon-button.delete {
    border: 1px solid var(--color-divider);
    color: var(--color-accent-2);
  }

  .icon-button.delete:hover {
    background: var(--tint-neutral-hover);
  }

  .icon-button.delete:active {
    background: var(--tint-neutral-press);
  }

  .footer-note {
    margin: 0;
    font-size: var(--text-11);
    opacity: 0.42;
  }

  .caret {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border: none;
    background: transparent;
    color: inherit;
    opacity: 0.5;
    cursor: pointer;
  }

  .caret:hover {
    opacity: 1;
  }

  .collapsed-label {
    writing-mode: vertical-rl;
    text-transform: uppercase;
    font-size: var(--text-9-5);
    letter-spacing: var(--tracking-12);
    opacity: 0.38;
  }
</style>
