<!--
  Chapter, the writing surface (design-system §9.33).

  Chapter is the one type the field stack cannot hold, because ITS LONG TEXT IS THE WORK, so
  the screen inverts: a strip of short fields at the top, one context line, then a writing
  surface that runs off the bottom of the window.

  The prose stores Markdown and renders through the SAME SANITISED PATH a note body does —
  the `note-text-format` contract, for a second kind of card. No editor library, on the same
  250-instance reasoning. The prose can never run script.

  Two differences from the other sheets, and only two:
  - the HEADER carries the Card actions, because the strip has no room for a Card group;
  - the 177px panel is RESERVED — the type name, the card id and *Reserved for AI options*,
    and nothing else. There is no AI glyph and none is held back.

  A long prose edit must not push one undo entry per keystroke: the surface commits on blur
  and on an idle pause bounded by the auto-save cadence, exactly as the note editor does.
  That is `persistence-strategy` — rapid changes grouped and written when the burst ends.

  The word count is computed FOR DISPLAY AND NEVER STORED. A stored count would drift from
  the prose beside it.
-->
<script lang="ts">
  import SheetShell from './SheetShell.svelte';
  import FieldControl from '../../lib/fields/FieldControl.svelte';
  import Icon from '../../lib/Icon.svelte';
  import { getSettings } from '../../lib/settings.svelte';
  import { parseBlueprintPayload } from '../../lib/blueprints.svelte';
  import { roleLabel } from '../../lib/roles';
  import type { Blueprint, FieldValue } from '../../lib/blueprints.svelte';
  import type { Item, ItemContext } from '../../lib/types';

  interface Props {
    blueprint: Blueprint;
    item: Item;
    context: ItemContext | null;
    onBack?: () => void;
    onFieldChange?: (key: string, value: FieldValue, listAdded?: boolean) => void;
    onExpandIntoCanvas?: () => void;
    onDelete?: () => void;
  }

  const { blueprint, item, context, onBack, onFieldChange, onExpandIntoCanvas, onDelete }: Props =
    $props();

  const payload = $derived(parseBlueprintPayload(item.payload));

  const field = (key: string) => blueprint.fields.find((f) => f.key === key) ?? null;
  const value = (key: string) => payload.fields[key];

  const proseField = $derived(blueprint.fields.find((f) => f.kind === 'long-text') ?? null);
  // The strip's fields, resolved once: `{@const}` may only sit directly inside a block.
  const numberField = $derived(field('number'));
  const nameField = $derived(field('name'));
  const wordTargetField = $derived(field('word_target'));
  const summaryField = $derived(field('summary'));
  const themesField = $derived(field('themes'));
  const stored = $derived(
    proseField && typeof value(proseField.key) === 'string'
      ? (value(proseField.key) as string)
      : '',
  );

  /** What is being typed. Committed on blur and on an idle pause, never per keystroke. */
  let draft = $state('');
  let editing = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const shown = $derived(editing ? draft : stored);

  const wordCount = $derived(shown.trim() === '' ? 0 : shown.trim().split(/\s+/).length);
  const target = $derived(
    typeof value('word_target') === 'number' ? (value('word_target') as number) : 0,
  );
  const progress = $derived(target > 0 ? Math.min(1, wordCount / target) : 0);

  /** One line, not two groups: this is the only place §9.28's groups collapse to a line. */
  const contextLine = $derived.by(() => {
    if (!context) return [];
    const parts: { glyph: 'square-half' | 'book' | 'film-slate'; label: string }[] = [];
    if (context.placements.length > 0) {
      parts.push({
        glyph: 'square-half',
        label: `Placed on ${context.placements.map((p) => p.canvas_name).join(', ')}`,
      });
    }
    for (const join of context.joined) {
      parts.push({
        glyph: join.reversed ? 'film-slate' : 'book',
        label: `${roleLabel(join.role, join.reversed)} ${join.other_name}`,
      });
    }
    return parts;
  });

  function commitProse() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    editing = false;
    if (!proseField || draft === stored) return;
    onFieldChange?.(proseField.key, draft.length === 0 ? null : draft);
  }

  /** The idle pause, bounded by the auto-save cadence the user chose. */
  function scheduleCommit() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!proseField || draft === stored) return;
      onFieldChange?.(proseField.key, draft.length === 0 ? null : draft);
    }, getSettings().autoSaveMs);
  }
</script>

<SheetShell name={payload.name} typeLabel={blueprint.label} {onBack}>
  {#snippet headerActions()}
    <!-- The one header variation: the strip has no room for a Card group. -->
    <button type="button" class="card-action" onclick={() => onExpandIntoCanvas?.()}>
      <Icon glyph="square-half" size={13} />
      Expand into a canvas
    </button>
    <button type="button" class="card-action destructive" onclick={() => onDelete?.()}>
      <Icon glyph="trash" size={13} />
      Delete
    </button>
  {/snippet}

  {#snippet full()}
    <div class="strip" data-testid="chapter-strip">
      <div class="row">
        {#if numberField}
          <div class="number">
            <FieldControl
              field={numberField}
              value={value('number')}
              onCommit={(next) => onFieldChange?.('number', next)}
            />
          </div>
        {/if}
        {#if nameField}
          <div class="title">
            <FieldControl
              field={nameField}
              value={payload.name}
              onCommit={(next) => onFieldChange?.('name', next)}
            />
          </div>
        {/if}
        {#if wordTargetField}
          <div class="word-target">
            <FieldControl
              field={wordTargetField}
              value={value('word_target')}
              onCommit={(next) => onFieldChange?.('word_target', next)}
            />
          </div>
        {/if}
      </div>

      <div class="row second">
        {#if summaryField}
          <div class="summary">
            <FieldControl
              field={summaryField}
              value={value('summary')}
              onCommit={(next) => onFieldChange?.('summary', next)}
            />
          </div>
        {/if}
        {#if themesField}
          <div class="themes">
            <FieldControl
              field={themesField}
              value={value('themes')}
              onCommit={(next, added) => onFieldChange?.('themes', next, added)}
            />
          </div>
        {/if}
      </div>
    </div>

    {#if contextLine.length > 0}
      <p class="context-line" data-testid="chapter-context-line">
        {#each contextLine as part, i (i)}
          <span class="context-part"><Icon glyph={part.glyph} size={12} />{part.label}</span>
        {/each}
      </p>
    {/if}

    {#if proseField}
      <div class="surface" data-testid="writing-surface">
        <textarea
          class="measure"
          aria-label={proseField.label}
          value={shown}
          onfocus={() => {
            draft = stored;
            editing = true;
          }}
          oninput={(event) => {
            draft = event.currentTarget.value;
            scheduleCommit();
          }}
          onblur={commitProse}
        ></textarea>
      </div>

      <footer class="foot" data-testid="chapter-foot">
        <span>Prose · Long Text</span>
        <span class="count">
          {wordCount.toLocaleString()}{target > 0 ? ` of ${target.toLocaleString()}` : ''} words
        </span>
        {#if target > 0}
          <span class="rail"><span class="fill" style="width: {progress * 100}%"></span></span>
        {/if}
        <span class="never">Never shown on the card face</span>
      </footer>
    {/if}
  {/snippet}
</SheetShell>

<style>
  .strip {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    flex: none;
  }

  .row {
    display: flex;
    align-items: flex-end;
    gap: var(--space-16);
  }

  .row.second {
    align-items: flex-start;
  }

  .number {
    width: 66px;
    flex: none;
  }

  .title {
    flex: 1;
    min-width: 0;
  }

  .word-target {
    width: 120px;
    flex: none;
  }

  .summary {
    flex: 1;
    min-width: 0;
  }

  .themes {
    width: 300px;
    flex: none;
  }

  .context-line {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-14);
    margin: 0;
    flex: none;
    font-size: var(--text-10-5);
    opacity: 0.5;
  }

  .context-part {
    display: inline-flex;
    align-items: center;
    gap: var(--space-5);
  }

  /* Runs off the bottom of the window: the work has no end, so the surface has no floor. */
  .surface {
    flex: 1;
    min-height: 320px;
    display: flex;
    justify-content: center;
    background: var(--color-surface);
    border-radius: var(--radius-card) var(--radius-card) 0 0;
    box-shadow: 0 -1px 0 var(--color-divider) inset;
    padding: var(--space-26) 0 0;
  }

  /* One centred 560px measure. */
  .measure {
    width: 560px;
    max-width: 100%;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-13);
    line-height: 1.85;
    resize: none;
    caret-color: var(--color-accent);
  }

  .measure:focus {
    outline: none;
  }

  .foot {
    display: flex;
    align-items: center;
    gap: var(--space-14);
    flex: none;
    padding: var(--space-9) var(--space-22);
    border-top: 1px solid var(--color-divider);
    font-size: var(--text-10-5);
    opacity: 0.5;
  }

  .count {
    font-variant-numeric: tabular-nums;
  }

  .rail {
    display: inline-block;
    width: 120px;
    height: 3px;
    background: var(--color-inset);
  }

  .fill {
    display: block;
    height: 100%;
    background: var(--color-accent);
  }

  .never {
    margin-left: auto;
  }

  .card-action {
    display: inline-flex;
    align-items: center;
    gap: var(--space-6);
    padding: 3px var(--space-9);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-md);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-11);
    cursor: pointer;
  }

  .card-action:hover {
    background: var(--tint-accent-hover);
  }

  .card-action.destructive {
    border-color: var(--color-accent-2);
    color: var(--color-accent-2-tint-text);
  }

  .card-action.destructive:hover {
    background: var(--color-accent-2-tint-fill);
  }
</style>
