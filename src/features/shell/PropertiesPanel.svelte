<!--
  The properties panel (design-system §8.5): 177 px expanded, 32 px collapsed. The X/Y/W/H
  fields are the typed equivalent of dragging; the Order buttons and the footer pair are the
  same actions the element context menu offers.

  With a multi-selection, a field whose values differ across the selection reads "mixed".
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import { canvasStore } from '../../stores/canvasStore.svelte';
  import { assetStatus } from '../../lib/assets';
  import {
    CONNECTION_COLORS,
    CONNECTION_WIDTHS,
    connectionStroke,
    connectionWidthPx,
  } from '../../lib/connectionStyle';
  import { autoSaveFooterText } from '../../lib/settings.svelte';
  import { MIN_CARD_SIZE } from '../../lib/geometry';
  import { relativeTime } from '../../lib/relativeTime';
  import {
    cardTitle,
    DIRECTED_BACK,
    DIRECTED_BOTH,
    DIRECTED_FORWARD,
    DIRECTED_NONE,
    parseImagePayload,
    parseLinkPayload,
    parseNotePayload,
    parseVideoPayload,
    type Placement,
  } from '../../lib/types';

  interface Props {
    expanded: boolean;
    onToggle: () => void;
    onGeometryChange?: (field: 'x' | 'y' | 'width' | 'height', value: number) => void;
    onBringForward?: () => void;
    onSendBack?: () => void;
    onDuplicate?: () => void;
    onDelete?: () => void;
    /** Commit a connection's label, direction and appearance together. */
    onConnectionChange?: (
      label: string | null,
      directed: number,
      color: string,
      width: number,
      labelVisible: boolean,
    ) => void;
    onDeleteConnection?: () => void;
    /** The image card's Alt text group, committed on blur. */
    onAltTextChange?: (alt: string) => void;
    /** The note card's Title group, committed on blur. */
    onNoteTitleChange?: (title: string) => void;
    /** Replace the selected image card's picture, keeping its alt text. */
    onReplaceImage?: () => void;
    /** Reveal the project's `assets/` folder in the system shell. */
    onShowInFolder?: () => void;
    /** Read the selected link or video card's address again. */
    onRefetch?: () => void;
  }

  const {
    expanded,
    onToggle,
    onGeometryChange,
    onBringForward,
    onSendBack,
    onDuplicate,
    onDelete,
    onConnectionChange,
    onDeleteConnection,
    onAltTextChange,
    onNoteTitleChange,
    onReplaceImage,
    onShowInFolder,
    onRefetch,
  }: Props = $props();

  const connection = $derived(canvasStore.selectedConnection);

  const DIRECTIONS = [
    { value: DIRECTED_NONE, label: 'None' },
    { value: DIRECTED_FORWARD, label: 'Forward' },
    { value: DIRECTED_BACK, label: 'Back' },
    { value: DIRECTED_BOTH, label: 'Both' },
  ] as const;

  function commitLabel(raw: string) {
    if (!connection) return;
    const next = raw.trim() === '' ? null : raw;
    if (next === connection.label) return;
    onConnectionChange?.(
      next,
      connection.directed,
      connection.color,
      connection.width,
      connection.label_visible,
    );
  }

  function commitDirection(directed: number) {
    if (!connection || connection.directed === directed) return;
    onConnectionChange?.(
      connection.label,
      directed,
      connection.color,
      connection.width,
      connection.label_visible,
    );
  }

  function commitColor(color: string) {
    if (!connection || connection.color === color) return;
    onConnectionChange?.(
      connection.label,
      connection.directed,
      color,
      connection.width,
      connection.label_visible,
    );
  }

  function commitWidth(width: number) {
    if (!connection || connection.width === width) return;
    onConnectionChange?.(
      connection.label,
      connection.directed,
      connection.color,
      width,
      connection.label_visible,
    );
  }

  function commitLabelVisible(visible: boolean) {
    if (!connection || connection.label_visible === visible) return;
    onConnectionChange?.(
      connection.label,
      connection.directed,
      connection.color,
      connection.width,
      visible,
    );
  }

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

  /** The one selected card's item, or null — every per-kind group below reads it. */
  const soleItem = $derived(selected.length === 1 ? canvasStore.itemFor(selected[0]) : null);

  const KIND_LABELS = { note: 'Note', image: 'Image', link: 'Link', video: 'Video' } as const;

  const headerKind = $derived.by(() => {
    if (selected.length === 0) return '';
    if (selected.length > 1) return `${selected.length} Cards`;
    return soleItem ? KIND_LABELS[soleItem.kind] : 'Card';
  });

  const headerId = $derived.by(() => {
    if (selected.length === 0) return '';
    if (selected.length > 1) {
      const notes = selected.filter((p) => canvasStore.itemFor(p)?.kind === 'note').length;
      return `with ${notes} ${notes === 1 ? 'note' : 'notes'}`;
    }
    // An image's name is its ORIGINAL file name, and that now lives in the File group at
    // the bottom rather than being said twice.
    if (soleItem?.kind === 'image') return '';
    return soleItem ? cardTitle(soleItem) : '';
  });

  /** The one selected note's payload, or null — the Title group reads it. */
  const note = $derived(soleItem?.kind === 'note' ? parseNotePayload(soleItem.payload) : null);

  // --- the image card's File and Alt text groups (§9.4) -------------------

  const image = $derived(soleItem?.kind === 'image' ? parseImagePayload(soleItem.payload) : null);
  const imageStatus = $derived(image === null ? null : assetStatus(image.asset));
  const imageMissing = $derived(image?.asset != null && imageStatus?.exists === false);

  /** `<w> × <h> · <size> · copied in`, or the missing line — never a stale size. */
  const imageFileLine = $derived.by(() => {
    if (image === null) return '';
    if (imageMissing) return 'Missing · the card is kept';
    const size = imageStatus === null ? 0 : imageStatus.byte_size;
    return `${image.natural_width} × ${image.natural_height} · ${formatBytes(size)} · copied in`;
  });

  function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
  }

  // --- the link and video card's Source group (§9.5, §9.7) ----------------

  const source = $derived.by(() => {
    if (soleItem?.kind === 'link') {
      const payload = parseLinkPayload(soleItem.payload);
      return { url: payload.url, fetchedAt: payload.fetched_at };
    }
    if (soleItem?.kind === 'video') {
      const payload = parseVideoPayload(soleItem.payload);
      return { url: payload.url, fetchedAt: payload.fetched_at };
    }
    return null;
  });

  const fetching = $derived(
    soleItem !== null && canvasStore.fetchStatusFor(soleItem.id) === 'fetching',
  );

  function commit(field: 'x' | 'y' | 'width' | 'height', raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    const floor = field === 'width' || field === 'height' ? MIN_CARD_SIZE : -Infinity;
    onGeometryChange?.(field, Math.max(floor, value));
  }
</script>

{#if expanded}
  <aside class="panel scroll-thin" data-testid="properties-panel" aria-label="Properties">
    {#if connection}
      <header class="header">
        <span class="kind">Connection</span>
      </header>

      <section class="group">
        <p class="group-label">Label</p>
        <!-- A hidden chip still shows its label here: §9.13 is explicit about that. -->
        <input
          class="input"
          type="text"
          value={connection.label ?? ''}
          aria-label="Connection Label"
          placeholder="name this relationship"
          onchange={(e) => commitLabel(e.currentTarget.value)}
          onblur={(e) => commitLabel(e.currentTarget.value)}
        />
        <!-- Hiding the chip is a display choice: the words above are kept either way. -->
        <label class="check">
          <input
            type="checkbox"
            checked={connection.label_visible}
            onchange={(e) => commitLabelVisible(e.currentTarget.checked)}
          />
          Show Label On Canvas
        </label>
      </section>

      <section class="group">
        <p class="group-label">Arrows</p>
        <div class="pairs">
          {#each DIRECTIONS as direction (direction.value)}
            <button
              type="button"
              class="order-button"
              class:active={connection.directed === direction.value}
              aria-pressed={connection.directed === direction.value}
              onclick={() => commitDirection(direction.value)}
            >
              {direction.label}
            </button>
          {/each}
        </div>
      </section>

      <section class="group">
        <p class="group-label">Color</p>
        <!-- Eight swatches on one row of four. The chosen one carries a ring AND a check,
             so colour is never the only signal (§12). -->
        <div class="swatches">
          {#each CONNECTION_COLORS as swatch (swatch.key)}
            <button
              type="button"
              class="swatch"
              class:active={connection.color === swatch.key}
              style="--swatch: {connectionStroke(swatch.key)}"
              title={swatch.label}
              aria-label={swatch.label}
              aria-pressed={connection.color === swatch.key}
              onclick={() => commitColor(swatch.key)}
            >
              {#if connection.color === swatch.key}
                <!-- check-circle, not a bare tick: §7.1's glyph set is closed. -->
                <Icon glyph="check-circle" size={12} />
              {/if}
            </button>
          {/each}
        </div>
      </section>

      <section class="group">
        <p class="group-label">Width</p>
        <div class="order">
          {#each CONNECTION_WIDTHS as step (step.step)}
            <button
              type="button"
              class="order-button width-button"
              class:active={connection.width === step.step}
              title={step.label}
              aria-label={step.label}
              aria-pressed={connection.width === step.step}
              onclick={() => commitWidth(step.step)}
            >
              <!-- The bar IS the label: its thickness says which step this is. The name
                   stays on the title and the aria-label so the control is still nameable. -->
              <span class="width-sample" style="height: {connectionWidthPx(step.step)}px"></span>
            </button>
          {/each}
        </div>
      </section>

      <footer class="footer">
        <div class="footer-row">
          <span></span>
          <button type="button" class="icon-button delete" onclick={onDeleteConnection}>
            <Icon glyph="trash" size={13} label="Delete Connection" />
          </button>
        </div>
        <p class="footer-note">Edits here are undoable · {autoSaveFooterText().split('· ')[1]}</p>
      </footer>
    {:else if hasSelection}
      <header class="header">
        <span class="kind">{headerKind}</span>
        <span class="item-id">{headerId}</span>
      </header>

      {#if note}
        <!-- Always editable, whether or not the card's own editor is open. The card's
             heading is not a text field the pointer can reach while it is only selected,
             so this is the one place a title can be renamed without entering the card. -->
        <section class="group" data-testid="panel-title-group">
          <p class="group-label">Title</p>
          <input
            class="input"
            type="text"
            aria-label="Note Title"
            placeholder="untitled"
            value={note.title}
            onblur={(e) => onNoteTitleChange?.(e.currentTarget.value)}
          />
        </section>
      {/if}

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

      {#if image}
        <section class="group">
          <p class="group-label">Description</p>
          <textarea
            class="input alt-text"
            aria-label="Description"
            placeholder="describe this picture"
            value={image.alt}
            onblur={(e) => onAltTextChange?.(e.currentTarget.value)}
          ></textarea>
        </section>
      {/if}

      {#if source}
        <!-- §9.5's Source group, and §9.7's not-fetched line. -->
        <section class="group" data-testid="panel-source-group">
          <p class="group-label">Source</p>
          <input
            class="input"
            type="text"
            readonly
            value={source.url}
            aria-label="Source Address"
          />
          <p class="file-meta" data-testid="panel-source-meta">
            {source.fetchedAt === null
              ? 'Not fetched yet · 5s limit'
              : `Preview fetched ${relativeTime(source.fetchedAt)}`}
          </p>
          <div class="order">
            <button
              type="button"
              class="order-button"
              disabled={fetching}
              class:pending={fetching}
              onclick={onRefetch}
            >
              <Icon glyph="arrow-clockwise" size={13} />
              Refetch
            </button>
          </div>
        </section>
      {/if}

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

      {#if image}
        <!-- Last group in the column: it is reference, not something the user reaches for
             while placing a card. The name shown is the ORIGINAL file's — the stored name is
             a content hash and names nothing a reader recognises, so Show in folder is the
             way to the file itself. Replace and Show in folder stay enabled when the file is
             gone: they are the fix, and nothing here says where the original used to live. -->
        <section class="group" data-testid="panel-file-group">
          <p class="group-label">File</p>
          <p class="file-name" title={image.source_name}>{image.source_name}</p>
          <p class="file-meta" data-testid="panel-file-meta">{imageFileLine}</p>
          <div class="order">
            <button type="button" class="order-button" onclick={onReplaceImage}>Replace</button>
            <button
              type="button"
              class="icon-button folder"
              title="Show in folder"
              aria-label="Show in folder"
              onclick={onShowInFolder}
            >
              <Icon glyph="folder-open" size={13} />
            </button>
          </div>
        </section>
      {/if}

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

  /* The four geometry boxes hold one short signed number, so they are sized to that rather
     than stretched across the column. 42px is the floor that still shows `-1024` whole. */
  .field .input {
    flex: none;
    width: 42px;
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

  .file-name {
    margin: 0;
    font-size: var(--text-11);
    line-height: 1.5;
    opacity: 0.75;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-meta {
    margin: 0 0 var(--space-6);
    font-size: var(--text-11);
    opacity: 0.45;
  }

  .alt-text {
    width: 100%;
    height: 44px;
    resize: none;
    box-sizing: border-box;
    line-height: 1.4;
  }

  .order {
    display: flex;
    gap: var(--space-5);
  }

  /* The one documented exception to the .35 disabled value (§9.5). */
  .order-button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .icon-button.folder {
    width: 28px;
    height: 28px;
    flex: none;
    border: 1px solid var(--color-divider);
    color: inherit;
  }

  .icon-button.folder:hover {
    background: var(--tint-neutral-hover);
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

  /* Weight as well as fill, so colour is never the only signal (§12). */
  .order-button.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-surface);
    font-weight: 600;
  }

  .check {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    margin-top: var(--space-6);
    font-size: var(--text-11);
    opacity: 0.75;
    cursor: pointer;
  }

  .check input {
    margin: 0;
    accent-color: var(--color-accent);
    cursor: pointer;
  }

  .swatches {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-5);
  }

  .swatch {
    height: 22px;
    display: grid;
    place-items: center;
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-md);
    background: var(--swatch);
    color: var(--color-surface);
    cursor: pointer;
    transition: box-shadow var(--duration-90) var(--ease);
  }

  .swatch:hover {
    border-color: color-mix(in srgb, var(--color-text) 40%, transparent);
  }

  .swatch.active {
    box-shadow: 0 0 0 2px var(--color-surface) inset;
    border-color: var(--color-text);
  }

  .width-button {
    padding: 8px 4px;
  }

  /* Plain ink, never the chosen colour: this control picks a WIDTH, and colouring it would
     make two groups look like one. */
  .width-sample {
    width: 26px;
    border-radius: 2px;
    background: var(--color-text);
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
    color: var(--color-accent-text);
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
