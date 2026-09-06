<!--
  The New project dialog. Design-system §15.1 lists this state as undrawn, so it is designed
  here in the document's own visual language — the surface, radius, type scale and focus
  treatment are all existing tokens — and flagged in the PR body for a later `dev-ui-update`
  run to fold into §9.

  It is modal: while it is open it owns Enter and Esc, and its keydown stops propagating so
  the global dispatcher's `edit` and `cancel` chains never see them. A create failure draws
  inside the dialog, on the same strip the picker uses — never a dialog on top of a dialog.
-->
<script lang="ts">
  interface Props {
    /** The folder the new project's folder will be created inside. */
    parentPath: string;
    /** A rejected create, already phrased by Rust ("a folder called X is already there"). */
    failure?: string | null;
    busy?: boolean;
    onCreate?: (name: string) => void;
    onChooseParent?: () => void;
    onCancel?: () => void;
  }

  const {
    parentPath,
    failure = null,
    busy = false,
    onCreate,
    onChooseParent,
    onCancel,
  }: Props = $props();

  let name = $state('');
  let input = $state<HTMLInputElement | null>(null);

  const trimmed = $derived(name.trim());
  const canCreate = $derived(trimmed.length > 0 && !busy);

  // The name field takes focus on mount: the dialog exists to be typed into.
  $effect(() => {
    input?.focus();
  });

  function submit() {
    if (!canCreate) return;
    onCreate?.(trimmed);
  }

  /**
   * The dialog owns these keys while it is open. Without `stopPropagation` Esc reaches the
   * root's `cancel` chain and Enter reaches `edit`.
   */
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel?.();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      submit();
    }
  }
</script>

<!-- The scrim swallows a click on the surface behind it; Esc is the keyboard equivalent. -->
<div
  class="scrim"
  role="presentation"
  onclick={() => onCancel?.()}
  onkeydown={onKeyDown}
  data-testid="new-project-scrim"
>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="panel"
    role="dialog"
    aria-modal="true"
    aria-label="New Project"
    tabindex="-1"
    data-testid="new-project-dialog"
    onclick={(event) => event.stopPropagation()}
  >
    <h3>New Project</h3>

    <label class="field">
      <span class="label">Name</span>
      <input
        bind:this={input}
        bind:value={name}
        type="text"
        aria-label="Name"
        spellcheck="false"
        autocomplete="off"
      />
    </label>

    <div class="folder">
      <span class="label">Folder</span>
      <span class="row">
        <span class="path" data-testid="new-project-parent">{parentPath}</span>
        <button type="button" class="ghost" onclick={() => onChooseParent?.()}>Choose…</button>
      </span>
    </div>

    <p class="helper">
      {#if trimmed}
        {parentPath}\{trimmed} will be created.
      {:else}
        A folder will be created inside this one.
      {/if}
    </p>

    {#if failure}
      <p class="failure" role="status" data-testid="new-project-failure">{failure}</p>
    {/if}

    <div class="buttons">
      <button type="button" class="ghost" onclick={() => onCancel?.()}>Cancel</button>
      <button
        type="button"
        class="primary"
        class:is-unavailable={!canCreate}
        disabled={!canCreate}
        onclick={submit}
      >
        Create Project
      </button>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: var(--z-dialog);
    display: grid;
    place-items: center;
    background: var(--scrim);
  }

  .panel {
    width: 380px;
    box-sizing: border-box;
    padding: 18px 20px var(--space-16);
    background: var(--color-surface);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-dialog);
    color: var(--color-text);
  }

  h3 {
    margin: 0 0 var(--space-14);
    font-size: var(--text-22);
    font-weight: 600;
    letter-spacing: var(--tracking-tight-2);
  }

  .label {
    display: block;
    margin-bottom: 4px;
    font-size: var(--text-10);
    letter-spacing: var(--tracking-10);
    text-transform: uppercase;
    opacity: 0.45;
  }

  .field {
    display: block;
    margin-bottom: var(--space-12);
  }

  input {
    width: 100%;
    box-sizing: border-box;
    padding: 5px 8px;
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-card);
    background: var(--color-bg);
    color: inherit;
    font: inherit;
    font-size: var(--text-12-5);
  }

  /* §11.4: focus is a ring plus the accent border, and it is not the selection treatment. */
  input:focus {
    border-color: var(--color-accent);
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }

  .folder {
    margin-bottom: var(--space-10);
  }

  .folder .row {
    display: flex;
    align-items: center;
    gap: var(--space-10);
    min-width: 0;
  }

  .path {
    flex: 1;
    min-width: 0;
    font-size: var(--text-11);
    opacity: 0.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .helper {
    margin: 0 0 var(--space-14);
    font-size: var(--text-11);
    opacity: 0.5;
    overflow-wrap: anywhere;
  }

  .failure {
    margin: 0 0 var(--space-12);
    padding: 8px var(--space-12);
    background: var(--color-accent-2-tint-fill);
    color: var(--color-accent-2-tint-text);
    border-radius: var(--radius-card);
    font-size: var(--text-11-5);
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-10);
  }

  .buttons button,
  .folder button {
    padding: 5px var(--space-12);
    border-radius: var(--radius-lg);
    font: inherit;
    font-size: var(--text-12);
    cursor: pointer;
    transition: background-color var(--duration-90) var(--ease);
  }

  .ghost {
    background: transparent;
    border: 1px solid var(--color-divider);
    color: var(--color-text);
  }

  .ghost:hover {
    background: var(--tint-neutral-hover);
  }

  .primary {
    background: var(--color-accent);
    border: 1px solid var(--color-accent);
    color: var(--color-bg);
  }

  .primary:hover:not(:disabled) {
    background: var(--color-accent-hover);
    border-color: var(--color-accent-hover);
  }

  .primary.is-unavailable {
    opacity: 0.35;
    cursor: default;
  }
</style>
