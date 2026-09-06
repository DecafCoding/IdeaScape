<!--
  The note editor: a plain textarea over the Markdown source, with the floating text bar
  above it. There is no editor library, and exactly one editor exists at a time — the
  focused card only. Two hundred and fifty editor instances is precisely what the
  note-text-format decision rejected.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import { insertMark, type Mark } from '../../lib/markdown';
  import type { Glyph } from '../../lib/glyphs';

  interface Props {
    title: string;
    text: string;
    onChange: (next: { title: string; text: string }) => void;
    onCommit: () => void;
  }

  const { title, text, onChange, onCommit }: Props = $props();

  let textarea: HTMLTextAreaElement | null = $state(null);

  /**
   * Commit when focus leaves the editor as a whole, not when it leaves one field. A blur
   * handler on the body alone closed the editor the moment the title box was clicked, so
   * the title could never be reached — `relatedTarget` is the element focus is moving to,
   * and a move to a sibling field inside the editor is not the user finishing.
   */
  function onFocusOut(event: FocusEvent) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget instanceof Node) {
      if (event.currentTarget.contains(next)) return;
    }
    onCommit();
  }

  const MARKS: Array<{ mark: Mark; glyph: Glyph; label: string }> = [
    { mark: 'bold', glyph: 'text-b', label: 'Bold' },
    { mark: 'italic', glyph: 'text-italic', label: 'Italic' },
    { mark: 'bullet-list', glyph: 'list-bullets', label: 'Bullet List' },
    { mark: 'numbered-list', glyph: 'list-numbers', label: 'Numbered List' },
  ];

  function applyMark(mark: Mark) {
    if (!textarea) return;
    const result = insertMark(text, textarea.selectionStart, textarea.selectionEnd, mark);
    onChange({ title, text: result.source });
    // Restore the selection after Svelte has written the new value back.
    queueMicrotask(() => {
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  $effect(() => {
    textarea?.focus();
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="editor" data-testid="note-editor" onfocusout={onFocusOut}>
  <div class="text-bar" data-testid="text-bar">
    {#each MARKS as { mark, glyph, label } (mark)}
      <button
        type="button"
        class="format-button"
        onmousedown={(event) => event.preventDefault()}
        onclick={() => applyMark(mark)}
      >
        <Icon {glyph} size={14} {label} />
      </button>
    {/each}
  </div>

  <input
    class="title-input"
    type="text"
    value={title}
    aria-label="Note Title"
    oninput={(event) => onChange({ title: event.currentTarget.value, text })}
  />

  <textarea
    bind:this={textarea}
    class="body-input"
    aria-label="Note Text"
    value={text}
    oninput={(event) => onChange({ title, text: event.currentTarget.value })}
  ></textarea>
</div>

<style>
  .editor {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: 11px 13px;
    box-sizing: border-box;
  }

  .text-bar {
    position: absolute;
    left: -2px;
    top: -38px;
    display: flex;
    gap: var(--space-2);
    padding: 3px;
    background: var(--color-surface);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-textbar);
  }

  .format-button {
    width: 28px;
    height: 26px;
    display: grid;
    place-items: center;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: inherit;
    opacity: 0.7;
    cursor: pointer;
    transition:
      background-color var(--duration-90) var(--ease),
      opacity var(--duration-90) var(--ease);
  }

  .format-button:hover {
    background: var(--tint-accent-hover);
    opacity: 1;
  }

  .format-button:active {
    background: var(--tint-accent-press);
  }

  /* Both fields carry the same 1px rule. Without it the title was indistinguishable from
     the heading it replaces, so it read as plain text and nobody tried to click it. */
  .title-input,
  .body-input {
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-md);
    background: var(--color-raised);
    color: inherit;
    font: inherit;
    padding: 3px 5px;
    transition: border-color var(--duration-90) var(--ease);
  }

  .title-input:hover,
  .body-input:hover {
    border-color: color-mix(in srgb, var(--color-text) 28%, transparent);
  }

  .title-input:focus,
  .body-input:focus {
    outline: 1px solid var(--color-accent);
    outline-offset: -1px;
    border-color: var(--color-accent);
  }

  .title-input {
    font-size: var(--text-13);
    font-weight: 600;
  }

  .body-input {
    flex: 1;
    font-size: var(--text-12);
    line-height: 1.5;
    resize: none;
  }
</style>
