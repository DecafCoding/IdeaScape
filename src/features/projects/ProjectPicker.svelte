<!--
  The project picker (design-system §9.1, frame 19a) — what the window shows when no project
  is open. New project…, Open folder…, and a 2 × 2 grid of at most four recent projects.

  It is not rendered inside `div.body`: the picker is the only screen with no left column and
  no canvas, so it replaces the body rather than sitting in it. A failed open draws the strip
  below the actions (design-system §15.2, `failure-surfaces`) and never a dialog.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import { relativeTime } from '../../lib/relativeTime';
  import type { RecentProject } from '../../lib/types';

  interface Props {
    recents: RecentProject[];
    /** Which card the arrow keys are on. `-1` is none. */
    selectedIndex?: number;
    /** The message a failed open left, already named after the database file. */
    failure?: string | null;
    onOpenPath?: (path: string) => void;
    onChooseFolder?: () => void;
    onNewProject?: () => void;
    onSelect?: (index: number) => void;
  }

  const {
    recents,
    selectedIndex = -1,
    failure = null,
    onOpenPath,
    onChooseFolder,
    onNewProject,
    onSelect,
  }: Props = $props();

  function cardsLabel(recent: RecentProject): string {
    const canvases = `${recent.canvas_count} ${recent.canvas_count === 1 ? 'canvas' : 'canvases'}`;
    const cards = `${recent.card_count} ${recent.card_count === 1 ? 'card' : 'cards'}`;
    return `${canvases} · ${cards}`;
  }
</script>

<main class="picker" data-testid="project-picker">
  <div class="content">
    <h2>Open a project</h2>
    <p class="sub">
      A project is a folder on this machine. It holds one database, its pictures, and every canvas
      inside it. Nothing leaves this computer.
    </p>

    <div class="actions">
      <button type="button" class="primary" onclick={onNewProject}>
        <Icon glyph="folder-plus" size={14} />
        New project…
      </button>
      <button type="button" class="secondary" onclick={onChooseFolder}>
        <Icon glyph="folder-open" size={14} />
        Open folder…
      </button>
    </div>

    {#if failure}
      <p class="failure" role="status" data-testid="picker-failure">{failure}</p>
    {/if}

    <p class="section-label">Recent</p>

    {#if recents.length > 0}
      <ul class="grid" data-testid="recent-grid">
        {#each recents as recent, index (recent.path)}
          <li>
            <button
              type="button"
              class="card"
              class:selected={index === selectedIndex}
              onclick={() => {
                onSelect?.(index);
                onOpenPath?.(recent.path);
              }}
            >
              <span class="name-row">
                <Icon glyph="folder" size={16} />
                <span class="name">{recent.name}</span>
              </span>
              <span class="path">{recent.path}</span>
              <span class="counts-row">
                <span class="counts">{cardsLabel(recent)}</span>
                <span class="when">{relativeTime(recent.opened_at)}</span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <footer>
      <span>IdeaScape 0.1 · Windows</span>
      <span>No account, no sync — nothing leaves this machine</span>
    </footer>
  </div>
</main>

<style>
  .picker {
    flex: 1;
    min-height: 0;
    display: flex;
    background: var(--color-bg);
    overflow-y: auto;
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 54px var(--space-64) 0;
    box-sizing: border-box;
  }

  h2 {
    margin: 0 0 7px;
    font-size: var(--text-32);
    font-weight: 600;
    letter-spacing: var(--tracking-tight-2);
  }

  .sub {
    margin: 0 0 var(--space-26);
    max-width: 62ch;
    font-size: var(--text-12-5);
    line-height: 1.6;
    opacity: 0.6;
  }

  .actions {
    display: flex;
    gap: var(--space-10);
    margin-bottom: var(--space-36);
  }

  .actions button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-6);
    padding: 7px var(--space-16);
    border-radius: var(--radius-lg);
    font: inherit;
    font-size: var(--text-13);
    cursor: pointer;
    transition: background-color var(--duration-90) var(--ease);
  }

  .primary {
    background: var(--color-accent);
    border: 1px solid var(--color-accent);
    color: var(--color-bg);
  }

  .primary:hover {
    background: var(--color-accent-hover);
    border-color: var(--color-accent-hover);
  }

  .secondary {
    background: transparent;
    border: 1px solid var(--color-divider);
    color: var(--color-text);
  }

  .secondary:hover {
    background: var(--tint-neutral-hover);
  }

  /* Drawn on the surface the user is looking at, never in a dialog (§15.2). */
  .failure {
    margin: calc(-1 * var(--space-26)) 0 var(--space-26);
    padding: 8px var(--space-12);
    background: var(--color-accent-2-tint-fill);
    color: var(--color-accent-2-tint-text);
    border-radius: var(--radius-card);
    font-size: var(--text-11-5);
  }

  .section-label {
    margin: 0 0 var(--space-12);
    font-size: var(--text-10);
    letter-spacing: var(--tracking-10);
    text-transform: uppercase;
    opacity: 0.65;
  }

  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-14);
    max-width: 720px;
  }

  .card {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 7px;
    width: 100%;
    min-width: 0;
    padding: var(--space-14) var(--space-16) 13px;
    background: var(--color-surface);
    border: none;
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-picker-card);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background-color var(--duration-90) var(--ease);
  }

  .card:hover {
    background: var(--color-raised);
  }

  .card:active {
    background: var(--tint-neutral-press);
  }

  /* Selection is an outline, focus is the global focus ring — §11.4 keeps them apart. */
  .card.selected {
    outline: 2px solid var(--color-accent);
  }

  .name-row {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    min-width: 0;
  }

  .name-row :global(i) {
    opacity: 0.5;
  }

  .name {
    font-size: var(--text-14);
    font-weight: 600;
    letter-spacing: var(--tracking-tight-1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .path {
    font-size: var(--text-11);
    opacity: 0.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .counts-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-10);
    margin-top: 3px;
  }

  .counts {
    font-size: var(--text-11-5);
    opacity: 0.6;
  }

  .when {
    font-size: var(--text-11-5);
    opacity: 0.42;
  }

  footer {
    margin-top: auto;
    display: flex;
    gap: 20px;
    padding-bottom: 22px;
    font-size: var(--text-11-5);
    opacity: 0.42;
  }
</style>
