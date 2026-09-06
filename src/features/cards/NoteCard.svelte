<!--
  A note card's contents: a plain-string title and a Markdown body, rendered through the one
  sanitized path. When selected the title widens by half a pixel and the body lifts to .85
  (design-system §6.2).

  Below LOW_ZOOM the card draws as three text bars instead of real text — reading at that
  size is impossible and drawing it is wasted work (frame 21h).
-->
<script lang="ts">
  import { renderMarkdown } from '../../lib/markdown';
  import { LOW_ZOOM } from '../../lib/geometry';

  interface Props {
    title: string;
    text: string;
    selected: boolean;
    zoom: number;
  }

  const { title, text, selected, zoom }: Props = $props();

  const simplified = $derived(zoom < LOW_ZOOM);
  const body = $derived(simplified ? '' : renderMarkdown(text));
</script>

{#if simplified}
  <div class="note simplified" data-testid="note-card-simplified" aria-hidden="true">
    <span class="bar wide"></span>
    <span class="bar"></span>
    <span class="bar short"></span>
  </div>
{:else}
  <div class="note" data-testid="note-card">
    <p class="title" class:selected>{title}</p>
    <!-- The only {@html} in the front end, and only ever on renderMarkdown's output. -->
    <div class="body" class:selected>{@html body}</div>
  </div>
{/if}

<style>
  .note {
    height: 100%;
    padding: 11px 13px;
    box-sizing: border-box;
    overflow: hidden;
  }

  .title {
    margin: 0 0 var(--space-5);
    font-size: var(--text-13);
    font-weight: 600;
  }

  .title.selected {
    font-size: var(--text-13-5);
  }

  .body {
    font-size: var(--text-12);
    line-height: 1.5;
    opacity: 0.8;
  }

  .body.selected {
    opacity: 0.85;
  }

  .body :global(p) {
    margin: 0 0 var(--space-5);
  }

  .body :global(p:last-child) {
    margin-bottom: 0;
  }

  .body :global(ul),
  .body :global(ol) {
    margin: 0 0 var(--space-5);
    padding-left: 1.2em;
  }

  .body :global(a) {
    color: var(--color-accent-700);
  }

  .body :global(code) {
    background: var(--color-raised);
    border-radius: var(--radius-md);
    padding: 0 3px;
  }

  .simplified {
    display: flex;
    flex-direction: column;
    gap: 4px;
    justify-content: center;
  }

  .bar {
    height: 2px;
    background: var(--color-text);
    opacity: 0.35;
    border-radius: var(--radius-sm);
  }

  .bar.wide {
    height: 3px;
    opacity: 0.5;
  }

  .bar.short {
    width: 55%;
  }
</style>
