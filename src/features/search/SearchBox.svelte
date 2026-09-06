<!--
  The left column's search box (design-system §8.3). Idle it is the drawn 1 px divider outline
  at opacity .5; with a query it takes full opacity, the accent border and a 1 px accent
  outline, and a clear glyph appears on the right. The drawn 1 × 13 px accent caret is the
  input's own caret.

  The four keys are handled on the input itself, not through the global dispatcher:
  `matchAction` returns null for ArrowUp, ArrowDown and Enter whenever focus is in a text box,
  and relaxing that rule to serve this box would fire Delete and Enter while the user is typing
  into a note.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';

  interface Props {
    query: string;
    onType?: (query: string) => void;
    onMove?: (delta: number) => void;
    onOpen?: () => void;
    onClose?: () => void;
    onClear?: () => void;
  }

  const { query, onType, onMove, onOpen, onClose, onClear }: Props = $props();

  let input = $state<HTMLInputElement | null>(null);

  const hasQuery = $derived(query.length > 0);

  function onKeyDown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        onMove?.(-1);
        return;
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        onMove?.(1);
        return;
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        onOpen?.();
        return;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        onClose?.();
        return;
      default:
        break;
    }
  }
</script>

<div class="search-wrapper">
  <div class="search-box" class:has-query={hasQuery} data-testid="search-box">
    <Icon glyph="magnifying-glass" size={13} />
    <input
      bind:this={input}
      type="text"
      value={query}
      aria-label="Search"
      placeholder="Search"
      spellcheck="false"
      autocomplete="off"
      oninput={(event) => onType?.(event.currentTarget.value)}
      onkeydown={onKeyDown}
    />
    {#if hasQuery}
      <button
        type="button"
        class="clear"
        aria-label="Clear Search"
        onclick={() => {
          onClear?.();
          input?.focus();
        }}
      >
        <Icon glyph="x" size={12} />
      </button>
    {/if}
  </div>
</div>

<style>
  .search-wrapper {
    padding: 0 var(--space-12) var(--space-9);
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    padding: 3px 8px;
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-card);
    font-size: var(--text-11-5);
    opacity: 0.5;
    transition:
      opacity var(--duration-90) var(--ease),
      border-color var(--duration-90) var(--ease);
  }

  .search-box:focus-within,
  .search-box.has-query {
    opacity: 1;
    border-color: var(--color-accent);
    outline: 1px solid var(--color-accent);
  }

  input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-11-5);
    caret-color: var(--color-accent);
  }

  /* The box already carries the accent outline, so the global ring would double it. */
  input:focus {
    outline: none;
  }

  input::placeholder {
    color: inherit;
    opacity: 0.7;
  }

  .clear {
    display: inline-flex;
    align-items: center;
    margin-left: auto;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    opacity: 0.45;
    cursor: pointer;
    transition: opacity var(--duration-90) var(--ease);
  }

  .clear:hover {
    opacity: 1;
  }
</style>
