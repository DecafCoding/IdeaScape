<!--
  The combo, in all four states (design-system §9.26).

  Two rulings are drawn here and both are firm:
  - A TYPED VALUE IS ALWAYS ACCEPTED. On Enter *and* on blur. Losing what the user typed
    because they clicked away is the failure this control exists to prevent.
  - FILTERING SORTS, IT NEVER HIDES. The one-hop filter puts the card's own genre group
    first and everything else below it, at reduced opacity. Nothing is removed.

  It is a text box first; the list is an offer, not a gate.

  The whole control fits 153px of content width in the panel: the input is `flex: 1` and the
  caret button is a fixed 26px. Never set a fixed input width here.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';
  import { splitOnMatch } from '../highlight';
  import {
    addListEntry,
    groupForFilter,
    loadListEntries,
    matchEntries,
    type ListEntry,
    type ListGroup,
  } from '../lists';
  import type { PickEntry } from '../blueprints.svelte';

  interface Props {
    /** Which shipped list to offer. */
    list: string;
    /**
     * A fixed vocabulary to offer INSTEAD of reading `list` through the seam. The connection
     * Role group uses it: the seven roles are a front-end table, not a project list, so
     * there is nothing to load and nothing to save a typed value into.
     */
    entries?: ListEntry[] | null;
    value: PickEntry | null;
    /** The parent field's current value, for the one-hop filter. Null sorts nothing. */
    parent?: PickEntry | null;
    /** The parent field's label, which heads the first group. */
    parentLabel?: string;
    placeholder?: string;
    /** `added` says whether a row was written, so undo knows there is anything to reverse. */
    onCommit?: (entry: PickEntry, added: boolean) => void;
    /** Clears the value. Offered by Pick, not by the Pick Many adder. */
    onClear?: () => void;
  }

  const {
    list,
    entries: fixedEntries = null,
    value,
    parent = null,
    parentLabel = '',
    placeholder = '',
    onCommit,
    onClear,
  }: Props = $props();

  let open = $state(false);
  let typed = $state('');
  let loaded = $state<ListEntry[]>([]);
  const entries = $derived(fixedEntries ?? loaded);
  let highlighted = $state(-1);
  let input = $state<HTMLInputElement | null>(null);
  /** Guards the blur commit, so Enter and blur do not each write once. */
  let settled = $state(false);

  // The text box shows the committed value while it is closed, and what is being typed
  // while it is open.
  const shown = $derived(open ? typed : (value?.text ?? ''));

  const filtered = $derived(matchEntries(entries, open ? typed : ''));
  const groups = $derived<ListGroup[]>(groupForFilter(filtered, parent?.id ?? null, parentLabel));
  /** Every row in draw order, so the keyboard can walk the two groups as one list. */
  const rows = $derived(groups.flatMap((group) => group.entries));
  const typedIsNew = $derived(
    typed.trim().length > 0 &&
      !entries.some((entry) => entry.text.toLowerCase() === typed.trim().toLowerCase()),
  );

  async function openList() {
    if (open) return;
    typed = value?.text ?? '';
    settled = false;
    if (!fixedEntries) loaded = await loadListEntries(list);
    open = true;
    highlighted = -1;
  }

  function close() {
    open = false;
    highlighted = -1;
  }

  /** A shipped entry carries its id and the list it came from; a typed one carries neither. */
  async function commitEntry(entry: ListEntry) {
    settled = true;
    close();
    onCommit?.({ id: entry.id, text: entry.text, sources: entry.id ? [list] : [] }, false);
  }

  /**
   * The user's own words. Saved to the project's own vocabulary so they are offered again
   * next time, and carrying no id and no source, permanently — that absence is what marks
   * the value as theirs.
   */
  async function commitTyped() {
    const text = typed.trim();
    if (text.length === 0) {
      settled = true;
      close();
      return;
    }
    settled = true;
    const existing = entries.find((entry) => entry.text.toLowerCase() === text.toLowerCase());
    close();
    if (existing) {
      onCommit?.(
        { id: existing.id, text: existing.text, sources: existing.id ? [list] : [] },
        false,
      );
      return;
    }
    // A fixed vocabulary has no project list behind it, so a typed value is accepted and
    // stored on the row itself with nothing written anywhere else.
    const added = fixedEntries ? false : await addListEntry(list, text);
    onCommit?.({ id: null, text, sources: [] }, added);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      // Stop here, or the global cancel chain also clears the canvas selection.
      event.preventDefault();
      event.stopPropagation();
      settled = true;
      close();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      const row = rows[highlighted];
      if (row) void commitEntry(row);
      else void commitTyped();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        void openList();
        return;
      }
      if (rows.length === 0) return;
      // −1 is a real position: it means "what I typed", and the walk wraps through it, so
      // the keyboard can always get back to the typed text without reaching for the mouse.
      if (event.key === 'ArrowDown') {
        highlighted = highlighted + 1 >= rows.length ? -1 : highlighted + 1;
      } else {
        highlighted = highlighted - 1 < -1 ? rows.length - 1 : highlighted - 1;
      }
    }
  }

  /** A typed value is committed on blur too. Clicking away must never discard it. */
  function onBlur() {
    if (settled || !open) return;
    void commitTyped();
  }
</script>

<div class="combo" data-testid="combo">
  <div class="row">
    <input
      bind:this={input}
      class="input"
      type="text"
      value={shown}
      {placeholder}
      spellcheck="false"
      autocomplete="off"
      role="combobox"
      aria-expanded={open}
      aria-controls="combo-list"
      onfocus={() => void openList()}
      oninput={(event) => {
        typed = event.currentTarget.value;
        highlighted = -1;
      }}
      onkeydown={onKeyDown}
      onblur={onBlur}
    />
    <button
      type="button"
      class="caret"
      aria-label={open ? 'Close The List' : 'Open The List'}
      onmousedown={(event) => event.preventDefault()}
      onclick={() => {
        if (open) close();
        else {
          void openList();
          input?.focus();
        }
      }}
    >
      <Icon glyph={open ? 'caret-up' : 'caret-down'} size={12} />
    </button>
    {#if onClear && value && !open}
      <button type="button" class="caret clear" aria-label="Clear" onclick={() => onClear()}>
        <Icon glyph="x" size={11} />
      </button>
    {/if}
  </div>

  {#if open}
    <div class="list" id="combo-list" role="listbox" data-testid="combo-list">
      {#if rows.length === 0}
        <!-- State 4: a value of your own. The list collapses to one accent-tinted row. -->
        <button
          type="button"
          class="use-mine"
          onmousedown={(event) => event.preventDefault()}
          onclick={() => void commitTyped()}
        >
          <span class="use-line"><Icon glyph="plus" size={12} />Use “{typed.trim()}”</span>
          <span class="no-match">Nothing in the list matches</span>
        </button>
      {:else}
        {#each groups as group, groupIndex (group.heading ?? groupIndex)}
          {#if group.heading}
            <p class="group-heading">{group.heading}</p>
          {/if}
          <div class="group" class:dimmed={group.dimmed}>
            {#each group.entries as entry (entry.id ?? entry.text)}
              {@const index = rows.indexOf(entry)}
              <button
                type="button"
                class="row-button"
                class:highlighted={index === highlighted}
                role="option"
                aria-selected={index === highlighted}
                onmousedown={(event) => event.preventDefault()}
                onclick={() => void commitEntry(entry)}
              >
                {#each splitOnMatch(entry.text, typed) as part, i (i)}
                  {#if part.match}<b>{part.text}</b>{:else}{part.text}{/if}
                {/each}
              </button>
            {/each}
          </div>
        {/each}
        {#if typedIsNew}
          <button
            type="button"
            class="use-mine"
            onmousedown={(event) => event.preventDefault()}
            onclick={() => void commitTyped()}
          >
            <span class="use-line"><Icon glyph="plus" size={12} />Use “{typed.trim()}”</span>
          </button>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .combo {
    position: relative;
    width: 100%;
  }

  .row {
    display: flex;
    align-items: stretch;
    width: 100%;
  }

  /* `flex: 1` and a fixed caret is what fits the control into 153px with no fixed width. */
  .input {
    flex: 1;
    min-width: 0;
    padding: var(--space-5) var(--space-9);
    border: 1px solid var(--color-divider);
    border-right: none;
    border-radius: var(--radius-md) 0 0 var(--radius-md);
    background: var(--color-raised);
    color: inherit;
    font: inherit;
    font-size: var(--text-11-5);
    box-sizing: border-box;
  }

  .input:focus {
    outline: 2px solid var(--color-accent);
    outline-offset: -1px;
  }

  .caret {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    flex: none;
    border: 1px solid var(--color-divider);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .caret.clear {
    border-left: none;
    border-radius: 0;
    width: 20px;
    opacity: 0.5;
  }

  .caret.clear:hover {
    opacity: 0.9;
  }

  .list {
    position: absolute;
    top: calc(100% + 3px);
    left: 0;
    right: 0;
    z-index: var(--z-search-popover);
    max-height: 220px;
    overflow-y: auto;
    padding: var(--space-2) 0;
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-combo-list);
  }

  .group-heading {
    margin: 0;
    padding: 4px var(--space-9);
    /* A wash of the ink rather than a ramp step, so the band follows the theme. */
    background: var(--tint-neutral-hover);
    font-size: var(--text-9-5);
    letter-spacing: var(--tracking-9);
    text-transform: uppercase;
    opacity: 0.45;
  }

  /* The second group sits below a rule, at reduced opacity — sorted, never hidden. */
  .group.dimmed {
    border-top: 1px solid var(--color-divider);
    opacity: 0.72;
  }

  .row-button {
    display: block;
    width: 100%;
    padding: var(--space-5) var(--space-9);
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-11-5);
    text-align: left;
    cursor: pointer;
  }

  .row-button:hover,
  .row-button.highlighted {
    background: var(--color-accent-100);
    color: var(--color-accent-800);
  }

  .use-mine {
    display: flex;
    flex-direction: column;
    gap: 1px;
    width: 100%;
    padding: var(--space-5) var(--space-9);
    border: none;
    background: var(--color-accent-100);
    color: var(--color-accent-800);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .use-line {
    display: inline-flex;
    align-items: center;
    gap: var(--space-6);
    font-size: var(--text-11-5);
  }

  .no-match {
    font-size: var(--text-10-5);
    opacity: 0.5;
  }
</style>
