<!--
  The empty-canvas state, frame 15a. Headings and buttons are Title Case; the instruction
  and the hint are body copy and stay in sentence case.
-->
<script lang="ts">
  interface Props {
    onNewNote: () => void;
  }

  const { onNewNote }: Props = $props();
</script>

<div class="empty" data-testid="empty-canvas">
  <h1>Nothing On The Canvas Yet</h1>
  <p class="instruction">
    Press N to drop a note wherever the pointer is, or paste an address, some text or an image
    straight onto the canvas.
  </p>
  <div class="actions">
    <button type="button" class="page-button primary" onclick={onNewNote}>New Note</button>
    <!-- Image cards land in Phase 3. -->
    <button type="button" class="page-button is-unavailable" disabled>Add Image</button>
  </div>
  <p class="hint">Everything you do here saves itself.</p>
</div>

<style>
  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-14);
    text-align: center;
    pointer-events: none;
  }

  h1 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: var(--text-22);
    font-weight: 400;
    letter-spacing: var(--tracking-tight-2);
  }

  .instruction {
    margin: 0;
    max-width: 40ch;
    font-size: var(--text-13);
    opacity: 0.6;
  }

  .actions {
    display: flex;
    gap: var(--space-10);
    pointer-events: auto;
  }

  .page-button {
    padding: 6px 14px;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-divider);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-13);
    cursor: pointer;
    transition: background-color var(--duration-90) var(--ease);
  }

  .page-button.primary {
    border-color: var(--color-accent);
    color: var(--color-accent-text);
  }

  .page-button.primary:hover {
    background: var(--tint-accent-hover);
  }

  .page-button.primary:active {
    background: var(--tint-accent-press);
  }

  .hint {
    margin: 0;
    margin-top: var(--space-16);
    font-size: var(--text-11-5);
    opacity: 0.4;
  }
</style>
