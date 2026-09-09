<!--
  *Placed on* and *Joined to* (design-system §9.28) — the two generated groups that make a
  reused card legible: where else this record is, and what it is wired to. Both are the
  visible proof that one item can have many placements.

  It lives in `lib/` because the properties panel (`features/shell`) and all three sheets
  (`features/writing`) draw it, and a feature may not import another feature.

  Two rules are carried here rather than in either caller:
  - the *Placed on* count is stated IN WORDS — "One record, three places" — because it is
    helper text; beyond ten it falls back to digits;
  - several connections of one role COLLAPSE TO A COUNT, and *Contains* is *Part Of* read
    from the other end, driven by `reversed` and never a stored value.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';
  import { countInWords } from '../countInWords';
  import { roleGlyph, roleLabel } from '../roles';
  import type { ItemContext, ItemJoin } from '../types';

  interface Props {
    context: ItemContext | null;
    /** Which groups to draw. The Chapter sheet collapses both to one line instead. */
    show?: 'both' | 'placed' | 'joined';
    onOpenPlacement?: (canvasId: number, placementId: number) => void;
    onOpenItem?: (canvasId: number, itemId: number) => void;
  }

  const { context, show = 'both', onOpenPlacement, onOpenItem }: Props = $props();

  const placements = $derived(context?.placements ?? []);

  const joined = $derived.by(() => {
    if (!context) return [];
    const byLabel = new Map<
      string,
      { label: string; role: string | null; names: string[]; first: ItemJoin }
    >();
    for (const join of context.joined) {
      const label = roleLabel(join.role, join.reversed);
      const group = byLabel.get(label) ?? { label, role: join.role, names: [], first: join };
      group.names.push(join.other_name);
      byLabel.set(label, group);
    }
    return [...byLabel.values()].map((group) => ({
      label: group.label,
      role: group.role,
      name: group.names.length === 1 ? group.names[0] : `${group.names.length} cards`,
      count: group.names.length,
      canvasId: group.first.canvas_id,
      itemId: group.first.other_item_id,
    }));
  });
</script>

{#if show !== 'joined' && placements.length > 0}
  <section class="group" data-testid="panel-placed-on">
    <p class="group-label">Placed On</p>
    {#each placements as placement (placement.placement_id)}
      <button
        type="button"
        class="context-row"
        onclick={() => onOpenPlacement?.(placement.canvas_id, placement.placement_id)}
      >
        <Icon glyph="square-half" size={13} />
        <span class="context-name">{placement.canvas_name}</span>
        <span class="coords">{Math.round(placement.x)}, {Math.round(placement.y)}</span>
      </button>
    {/each}
    {#if placements.length > 1}
      <p class="helper">
        One record, {countInWords(placements.length)} places. Editing here changes all {countInWords(
          placements.length,
        )}.
      </p>
    {/if}
  </section>
{/if}

{#if show !== 'placed' && joined.length > 0}
  <section class="group" data-testid="panel-joined-to">
    <p class="group-label">Joined To</p>
    {#each joined as row (row.label)}
      <button
        type="button"
        class="context-row joined"
        disabled={row.count > 1}
        onclick={() => onOpenItem?.(row.canvasId, row.itemId)}
      >
        <span class="role-disc"><Icon glyph={roleGlyph(row.role)} size={9} /></span>
        <span class="context-name">{row.name}</span>
      </button>
      <!-- The role sits on its own line beneath the far card's name. -->
      <p class="role-line">{row.label}</p>
    {/each}
  </section>
{/if}

<style>
  .group {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .group-label {
    margin: 0 0 3px;
    font-size: var(--text-10);
    letter-spacing: var(--tracking-10);
    text-transform: uppercase;
    opacity: 0.45;
  }

  .context-row {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    width: 100%;
    padding: 3px 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-11);
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }

  .context-row:disabled {
    cursor: default;
  }

  .context-row :global(i) {
    opacity: 0.55;
    flex: none;
  }

  .context-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .coords {
    flex: none;
    font-size: var(--text-10);
    opacity: 0.4;
    font-variant-numeric: tabular-nums;
  }

  .role-disc {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 15px;
    height: 15px;
    flex: none;
    border: 1px solid var(--color-divider);
    border-radius: 50%;
  }

  .role-line {
    margin: -3px 0 0;
    padding-left: 22px;
    font-size: var(--text-10);
    opacity: 0.45;
  }

  /* Helper text: sentence case, and the count in words. */
  .helper {
    margin: var(--space-5) 0 0;
    font-size: var(--text-10);
    line-height: 1.4;
    opacity: 0.5;
  }
</style>
