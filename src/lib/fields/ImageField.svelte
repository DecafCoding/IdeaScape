<!--
  An Image field (design-system §9.25): a 52px square, the file name ellipsized at 11px
  opacity .6, then *Replace* / *Remove* as two 11px buttons in a `gap: 5px` row — the same
  pair as §9.4's File group.

  The value is a BARE FILE NAME inside the project's `assets/` folder and never a path. The
  picture goes through the existing assets module unchanged: copied in, named by its content
  hash, deduplicated and reference counted. `set_item_field` revalidates the name in Rust,
  which is what keeps the no-separator rule applying here for free.

  A file that is not in `assets/` draws §9.22's marker; the item is never deleted for it.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';
  import { assetStatus, assetUrl } from '../assets.svelte';
  import type { BlueprintField, FieldValue } from '../blueprints.svelte';

  interface Props {
    field: BlueprintField;
    value: FieldValue | undefined;
    /** The picture box's drawn size. 52px in the panel; a sheet passes its own. */
    size?: number;
    /** Opens the picker and copies the chosen file in. The root owns the assets module call. */
    onReplace?: () => void;
    onCommit?: (value: FieldValue) => void;
  }

  const { field, value, size = 52, onReplace, onCommit }: Props = $props();

  const name = $derived(typeof value === 'string' && value.length > 0 ? value : null);
  const missing = $derived(name !== null && !assetStatus(name).exists);
</script>

<div class="image-field">
  <div class="row">
    <span
      class="box"
      class:missing
      style="width: {size}px; height: {size}px"
      data-testid="image-field-box"
    >
      {#if name && !missing}
        <img src={assetUrl(name)} alt={field.label} />
      {:else if missing}
        <Icon glyph="image-broken" size={Math.round(size / 2.4)} label="Missing Picture" />
      {:else}
        <Icon glyph="image" size={Math.round(size / 2.4)} />
      {/if}
    </span>
    <span class="file">{name ?? 'No picture'}</span>
  </div>
  <div class="buttons">
    <button type="button" onclick={() => onReplace?.()}>Replace</button>
    <button type="button" disabled={name === null} onclick={() => onCommit?.(null)}>Remove</button>
  </div>
</div>

<style>
  .image-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    width: 100%;
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-9);
    min-width: 0;
  }

  .box {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    overflow: hidden;
    border-radius: var(--radius-md);
    background: var(--color-neutral-200);
  }

  /* §9.22: a dashed inset border on a neutral ground. The item is never deleted for it. */
  .box.missing {
    border: 1px dashed var(--color-divider);
    background: var(--color-neutral-100);
  }

  .box img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .file {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-11);
    opacity: 0.6;
  }

  .buttons {
    display: flex;
    gap: var(--space-5);
  }

  .buttons button {
    padding: var(--space-2) var(--space-6);
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-md);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-11);
    cursor: pointer;
  }

  .buttons button:hover:not(:disabled) {
    background: var(--tint-neutral-hover);
  }
</style>
