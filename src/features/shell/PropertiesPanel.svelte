<!--
  The properties panel (design-system §8.5): 177 px expanded, 32 px collapsed. The X/Y/W/H
  fields are the typed equivalent of dragging; the Order buttons and the footer pair are the
  same actions the element context menu offers.

  With a multi-selection, a field whose values differ across the selection reads "mixed".
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import {
    blueprintForPayload,
    fieldValueText,
    parseBlueprintPayload,
  } from '../../lib/blueprints.svelte';
  import FieldControl from '../../lib/fields/FieldControl.svelte';
  import { ROLES, roleLabel } from '../../lib/roles';
  import CardContext from '../../lib/fields/CardContext.svelte';
  import Combo from '../../lib/fields/Combo.svelte';
  import type { FieldValue, PickEntry } from '../../lib/blueprints.svelte';
  import type { ItemContext } from '../../lib/types';
  import { canvasStore } from '../../stores/canvasStore.svelte';
  import { assetStatus } from '../../lib/assets.svelte';
  import {
    CONNECTION_COLORS,
    CONNECTION_ROUTES,
    CONNECTION_WIDTHS,
    anchorLabel,
    connectionStroke,
    connectionWidthPx,
  } from '../../lib/connectionStyle';
  import { autoSaveFooterText } from '../../lib/settings.svelte';
  import { MIN_CARD_SIZE } from '../../lib/geometry';
  import { relativeTime } from '../../lib/relativeTime';
  import {
    cardTitle,
    connectionEdit,
    DIRECTED_BACK,
    DIRECTED_BOTH,
    DIRECTED_FORWARD,
    DIRECTED_NONE,
    parseImagePayload,
    parseLinkPayload,
    parseNotePayload,
    parseVideoPayload,
    type ConnectionEdit,
    type Placement,
  } from '../../lib/types';

  interface Props {
    expanded: boolean;
    onToggle: () => void;
    onGeometryChange?: (field: 'x' | 'y' | 'width' | 'height', value: number) => void;
    onBringForward?: () => void;
    onSendBack?: () => void;
    onDuplicate?: () => void;
    onDelete?: () => void;
    /** Commit a connection's label, direction, appearance, route and anchors together. */
    onConnectionChange?: (edit: ConnectionEdit) => void;
    onDeleteConnection?: () => void;
    /** The image card's Title text, committed on blur. */
    onImageTitleChange?: (title: string) => void;
    /** Whether the image card draws its title above the picture. */
    onImageTitleVisibleChange?: (visible: boolean) => void;
    /** The image card's Alt text group, committed on blur. */
    onAltTextChange?: (alt: string) => void;
    /** Whether the image card draws its description below the picture. */
    onAltVisibleChange?: (visible: boolean) => void;
    /** The note card's Title group, committed on blur. */
    onNoteTitleChange?: (title: string) => void;
    /** Replace the selected image card's picture, keeping its alt text. */
    onReplaceImage?: () => void;
    /** Where else the selected writing card is, and what it is wired to (§9.28). */
    itemContext?: ItemContext | null;
    /**
     * §9.33: while the Chapter sheet is open the panel is RESERVED — the type name, the card
     * id and one line, and nothing else. There is no AI glyph and none is held back.
     */
    reserved?: boolean;
    /** Write one field of the selected writing card. The root pushes the undo command. */
    onFieldChange?: (key: string, value: FieldValue, listAdded?: boolean) => void;
    /** A Scale reports where the change started, so a whole drag is one undo entry. */
    onScaleChange?: (key: string, next: number, before: number) => void;
    /** Replace the picture in one Image FIELD of a writing card. */
    onReplaceFieldImage?: (key: string) => void;
    onExpandIntoCanvas?: () => void;
    /** Open the selected writing card's own screen. Only the sheet types offer it. */
    onOpenSheet?: (placementId: number) => void;
    onOpenPlacement?: (canvasId: number, placementId: number) => void;
    onOpenItem?: (canvasId: number, itemId: number) => void;
    /** Reveal the project's `assets/` folder in the system shell. */
    onShowInFolder?: () => void;
    /** Read the selected link or video card's address again. */
    onRefetch?: () => void;
  }

  const {
    expanded,
    onToggle,
    onGeometryChange,
    onBringForward,
    onSendBack,
    onDuplicate,
    onDelete,
    onConnectionChange,
    onDeleteConnection,
    onAltTextChange,
    onAltVisibleChange,
    onNoteTitleChange,
    onImageTitleChange,
    onImageTitleVisibleChange,
    onReplaceImage,
    itemContext = null,
    reserved = false,
    onFieldChange,
    onScaleChange,
    onReplaceFieldImage,
    onExpandIntoCanvas,
    onOpenSheet,
    onOpenPlacement,
    onOpenItem,
    onShowInFolder,
    onRefetch,
  }: Props = $props();

  const connection = $derived(canvasStore.selectedConnection);

  const DIRECTIONS = [
    { value: DIRECTED_NONE, label: 'None' },
    { value: DIRECTED_FORWARD, label: 'Forward' },
    { value: DIRECTED_BACK, label: 'Back' },
    { value: DIRECTED_BOTH, label: 'Both' },
  ] as const;

  /** The selected row as an edit, with the one field this control owns replaced. */
  function commitConnection(change: Partial<ConnectionEdit>) {
    if (!connection) return;
    onConnectionChange?.({ ...connectionEdit(connection), ...change });
  }

  function commitLabel(raw: string) {
    if (!connection) return;
    const next = raw.trim() === '' ? null : raw;
    if (next === connection.label) return;
    commitConnection({ label: next });
  }

  /**
   * The Role group. It commits through the same `commitConnection` path every other
   * connection field uses, so setting a role is ONE `editConnectionCommand` and no new
   * command class is needed.
   *
   * A typed role is accepted like any other combo value. NULL is never written back as
   * 'relates-to': the two are indistinguishable on screen, and normalising one into the
   * other would rewrite every old row for no visible gain.
   */
  function commitRole(role: string | null) {
    if (!connection || connection.role === role) return;
    commitConnection({ role });
  }

  /** The seven roles as combo entries. A role the user typed is not in this list, and is
   *  accepted anyway — that is the point of the control. */
  const roleEntries = $derived(ROLES.map((role) => ({ id: role.key, text: role.label, tags: [] })));

  /** The current role as a pick entry, so the combo shows its name rather than its key. */
  const roleValue = $derived.by(() => {
    if (!connection?.role) return null;
    return { id: connection.role, text: roleLabel(connection.role), sources: ['roles'] };
  });

  function commitDirection(directed: number) {
    if (!connection || connection.directed === directed) return;
    commitConnection({ directed });
  }

  function commitColor(color: string) {
    if (!connection || connection.color === color) return;
    commitConnection({ color });
  }

  function commitRoute(route: string) {
    if (!connection || connection.route === route) return;
    commitConnection({ route });
  }

  function commitWidth(width: number) {
    if (!connection || connection.width === width) return;
    commitConnection({ width });
  }

  function commitLabelVisible(labelVisible: boolean) {
    if (!connection || connection.label_visible === labelVisible) return;
    commitConnection({ labelVisible });
  }

  /**
   * Put both ends back on `auto`. It is the one thing dragging a handle cannot do — a drag
   * always lands on a side — so the panel owns it.
   */
  function commitAnchorsAuto() {
    if (!connection || anchorsAreAuto) return;
    commitConnection({ fromAnchor: 'auto', toAnchor: 'auto' });
  }

  /** Clear a hand-placed bend. Dragging the middle handle is how one is made and moved; this
      is how it goes away, and Enter on that handle does the same. */
  function commitStraighten() {
    if (!connection || connection.bend === '') return;
    commitConnection({ bend: '' });
  }

  const isBent = $derived(
    connection !== null && connection !== undefined && connection.bend !== '',
  );

  const anchorsAreAuto = $derived(
    !connection || (connection.from_anchor === 'auto' && connection.to_anchor === 'auto'),
  );

  const selected = $derived(canvasStore.selectedPlacements);
  const hasSelection = $derived(selected.length > 0);

  /** One value across the whole selection, or null when they differ. */
  function shared(field: keyof Placement): number | null {
    if (selected.length === 0) return null;
    const first = selected[0][field] as number;
    return selected.every((p) => (p[field] as number) === first) ? first : null;
  }

  const FIELDS = [
    { key: 'x', letter: 'X', group: 'position' },
    { key: 'y', letter: 'Y', group: 'position' },
    { key: 'width', letter: 'W', group: 'size' },
    { key: 'height', letter: 'H', group: 'size' },
  ] as const;

  /** The one selected card's item, or null — every per-kind group below reads it. */
  const soleItem = $derived(selected.length === 1 ? canvasStore.itemFor(selected[0]) : null);

  const KIND_LABELS = { note: 'Note', image: 'Image', link: 'Link', video: 'Video' } as const;

  /** The blueprint of the one selected writing card, or null for every other kind. */
  const soleBlueprint = $derived(
    soleItem?.kind === 'blueprint' ? blueprintForPayload(soleItem.payload) : null,
  );

  /**
   * The sheet types head their panel with a notebook button. The panel is a SUMMARY; the
   * whole card lives on its own screen and this is the way in. Driven by the blueprint's
   * `sheet` flag — no card type is named here.
   */
  const sheetPlacementId = $derived(
    soleBlueprint?.sheet === true && selected.length === 1 ? selected[0].id : null,
  );

  const headerKind = $derived.by(() => {
    if (selected.length === 0) return '';
    if (selected.length > 1) return `${selected.length} Cards`;
    if (!soleItem) return 'Card';
    // A writing card is headed by its own type name, which the blueprint carries.
    if (soleItem.kind === 'blueprint') return soleBlueprint?.label ?? 'Card';
    return KIND_LABELS[soleItem.kind];
  });

  const headerId = $derived.by(() => {
    if (selected.length === 0) return '';
    if (selected.length > 1) {
      const notes = selected.filter((p) => canvasStore.itemFor(p)?.kind === 'note').length;
      return `with ${notes} ${notes === 1 ? 'note' : 'notes'}`;
    }
    // An image's name is its ORIGINAL file name, and that now lives in the File group at
    // the bottom rather than being said twice.
    if (soleItem?.kind === 'image') return '';
    return soleItem ? cardTitle(soleItem) : '';
  });

  /** The one selected note's payload, or null — the Title group reads it. */
  const note = $derived(soleItem?.kind === 'note' ? parseNotePayload(soleItem.payload) : null);

  // --- the image card's File and Alt text groups (§9.4) -------------------

  const image = $derived(soleItem?.kind === 'image' ? parseImagePayload(soleItem.payload) : null);
  const imageStatus = $derived(image === null ? null : assetStatus(image.asset));
  const imageMissing = $derived(image?.asset != null && imageStatus?.exists === false);

  /** `<w> × <h> · <size> · copied in`, or the missing line — never a stale size. */
  const imageFileLine = $derived.by(() => {
    if (image === null) return '';
    if (imageMissing) return 'Missing · the card is kept';
    const size = imageStatus === null ? 0 : imageStatus.byte_size;
    return `${image.natural_width} × ${image.natural_height} · ${formatBytes(size)} · copied in`;
  });

  function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
  }

  // --- the link and video card's Source group (§9.5, §9.7) ----------------

  const source = $derived.by(() => {
    if (soleItem?.kind === 'link') {
      const payload = parseLinkPayload(soleItem.payload);
      return { url: payload.url, fetchedAt: payload.fetched_at };
    }
    if (soleItem?.kind === 'video') {
      const payload = parseVideoPayload(soleItem.payload);
      return { url: payload.url, fetchedAt: payload.fetched_at };
    }
    return null;
  });

  // --- the generated writing-card panel (§9.25, §9.28) --------------------

  /** The one selected writing card's payload, or null for every other kind. */
  const blueprintPayload = $derived(
    soleItem?.kind === 'blueprint' ? parseBlueprintPayload(soleItem.payload) : null,
  );

  /**
   * The fields this panel draws.
   *
   * For a type WITH a sheet (Book, Chapter, Character) the panel still draws — §9.30 keeps
   * the 177px panel beside the sheet — but only the identity fields, because the rest of the
   * card has a whole screen of its own. That is driven by the blueprint's `sheet` flag; NO
   * CARD TYPE IS EVER NAMED IN THIS COMPONENT.
   */
  const panelFields = $derived.by(() => {
    if (!soleBlueprint) return [];
    if (!soleBlueprint.sheet) return soleBlueprint.fields;
    // The identity fields: everything up to and including the first long-form field, which
    // is where a sheet's own layout takes over.
    const firstLong = soleBlueprint.fields.findIndex(
      (field) => field.kind === 'long-text' || field.kind === 'scale',
    );
    const identity =
      firstLong === -1 ? soleBlueprint.fields : soleBlueprint.fields.slice(0, firstLong);
    // `name` is the card's own name and the header already prints it, so the panel does not
    // print it twice. `panel: 'hidden'` drops the rest the summary does not want. The
    // picture then leads, directly under that name. All read off the field's own members —
    // no card type is named here.
    const rest = identity.filter((field) => field.key !== 'name' && field.panel !== 'hidden');
    const picture = rest.filter((field) => field.kind === 'image');
    return [...picture, ...rest.filter((field) => field.kind !== 'image')];
  });

  /** The value of a field named by another field's `filter_by`. One hop, never a chain. */
  function parentFor(key: string | undefined): PickEntry | null {
    if (!key || !blueprintPayload) return null;
    const raw = blueprintPayload.fields[key];
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as PickEntry) : null;
  }

  function parentLabelFor(key: string | undefined): string {
    const value = parentFor(key);
    return value?.text ?? '';
  }

  const fetching = $derived(
    soleItem !== null && canvasStore.fetchStatusFor(soleItem.id) === 'fetching',
  );

  function commit(field: 'x' | 'y' | 'width' | 'height', raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    const floor = field === 'width' || field === 'height' ? MIN_CARD_SIZE : -Infinity;
    onGeometryChange?.(field, Math.max(floor, value));
  }
</script>

{#if expanded}
  <aside class="panel scroll-thin" data-testid="properties-panel" aria-label="Properties">
    {#if reserved}
      <!-- The sheet is already open, so no notebook button here: it would go nowhere. -->
      <header class="header">
        <span class="kind">{headerKind}</span>
        <span class="item-id">{headerId}</span>
      </header>
      <p class="footer-note" data-testid="panel-reserved">Reserved for AI options</p>
    {:else if connection}
      <header class="header">
        <span class="kind">Connection</span>
      </header>

      <!-- §9.13 places Role ABOVE Label. -->
      <section class="group" data-testid="panel-role-group">
        <p class="group-label">Role</p>
        <Combo
          list="roles"
          entries={roleEntries}
          value={roleValue}
          placeholder="Relates To"
          onCommit={(entry) =>
            commitRole(entry.text === 'Relates To' ? null : (entry.id ?? entry.text))}
          onClear={() => commitRole(null)}
        />
      </section>

      <section class="group">
        <p class="group-label">Label</p>
        <!-- A hidden chip still shows its label here: §9.13 is explicit about that. -->
        <input
          class="input"
          type="text"
          value={connection.label ?? ''}
          aria-label="Connection Label"
          placeholder="name this relationship"
          onchange={(e) => commitLabel(e.currentTarget.value)}
          onblur={(e) => commitLabel(e.currentTarget.value)}
        />
        <!-- Hiding the chip is a display choice: the words above are kept either way. -->
        <label class="check">
          <input
            type="checkbox"
            checked={connection.label_visible}
            onchange={(e) => commitLabelVisible(e.currentTarget.checked)}
          />
          Show Label On Canvas
        </label>
      </section>

      <section class="group">
        <p class="group-label">Arrows</p>
        <div class="pairs">
          {#each DIRECTIONS as direction (direction.value)}
            <button
              type="button"
              class="order-button"
              class:active={connection.directed === direction.value}
              aria-pressed={connection.directed === direction.value}
              onclick={() => commitDirection(direction.value)}
            >
              {direction.label}
            </button>
          {/each}
        </div>
      </section>

      <section class="group">
        <p class="group-label">Route</p>
        <!-- Shape before colour. The Width group's grammar, with words for labels: two of
             them fit the 177px panel, and §7.1's glyph set is closed. -->
        <div class="order">
          {#each CONNECTION_ROUTES as option (option.key)}
            <button
              type="button"
              class="order-button"
              class:active={connection.route === option.key}
              aria-pressed={connection.route === option.key}
              onclick={() => commitRoute(option.key)}
            >
              {option.label}
            </button>
          {/each}
        </div>
      </section>

      <section class="group">
        <p class="group-label">Anchor</p>
        <!-- An end is pinned by dragging its square handle on the canvas onto a card side.
             This group reports where both ends sit and puts them back on Auto, which a drag
             cannot do — see design-system §9.13, "Anchor". -->
        <p class="anchor-state">
          From {anchorLabel(connection.from_anchor)} · To {anchorLabel(connection.to_anchor)}
        </p>
        <div class="order">
          <button
            type="button"
            class="order-button"
            disabled={anchorsAreAuto}
            onclick={() => commitAnchorsAuto()}
          >
            Reset To Auto
          </button>
        </div>
      </section>

      <section class="group">
        <p class="group-label">Bend</p>
        <!-- A bend is placed by dragging the hollow handle in the middle of a selected line.
             It is held relative to the two cards, so moving a card keeps the shape — see
             design-system §9.13, "Bend". -->
        <p class="anchor-state">{isBent ? 'One hand-placed bend' : 'No bend'}</p>
        <div class="order">
          <button
            type="button"
            class="order-button"
            disabled={!isBent}
            onclick={() => commitStraighten()}
          >
            Straighten Line
          </button>
        </div>
      </section>

      <section class="group">
        <p class="group-label">Color</p>
        <!-- Eight swatches on one row of four. The chosen one carries a ring AND a check,
             so colour is never the only signal (§12). -->
        <div class="swatches">
          {#each CONNECTION_COLORS as swatch (swatch.key)}
            <button
              type="button"
              class="swatch"
              class:active={connection.color === swatch.key}
              style="--swatch: {connectionStroke(swatch.key)}"
              title={swatch.label}
              aria-label={swatch.label}
              aria-pressed={connection.color === swatch.key}
              onclick={() => commitColor(swatch.key)}
            >
              {#if connection.color === swatch.key}
                <!-- check-circle, not a bare tick: §7.1's glyph set is closed. -->
                <Icon glyph="check-circle" size={12} />
              {/if}
            </button>
          {/each}
        </div>
      </section>

      <section class="group">
        <p class="group-label">Width</p>
        <div class="order">
          {#each CONNECTION_WIDTHS as step (step.step)}
            <button
              type="button"
              class="order-button width-button"
              class:active={connection.width === step.step}
              title={step.label}
              aria-label={step.label}
              aria-pressed={connection.width === step.step}
              onclick={() => commitWidth(step.step)}
            >
              <!-- The bar IS the label: its thickness says which step this is. The name
                   stays on the title and the aria-label so the control is still nameable. -->
              <span class="width-sample" style="height: {connectionWidthPx(step.step)}px"></span>
            </button>
          {/each}
        </div>
      </section>

      <footer class="footer">
        <div class="footer-row">
          <span></span>
          <button type="button" class="icon-button delete" onclick={onDeleteConnection}>
            <Icon glyph="trash" size={13} label="Delete Connection" />
          </button>
        </div>
        <p class="footer-note">Edits here are undoable · {autoSaveFooterText().split('· ')[1]}</p>
      </footer>
    {:else if hasSelection}
      <header class="header" class:has-open-sheet={sheetPlacementId !== null}>
        <div class="header-line">
          <span class="kind">{headerKind}</span>
          {#if sheetPlacementId !== null}
            <button
              type="button"
              class="open-sheet"
              title="Open {headerKind}"
              onclick={() => onOpenSheet?.(sheetPlacementId)}
              data-testid="panel-open-sheet"
            >
              <Icon glyph="notebook" size={26} label="Open {headerKind}" />
            </button>
          {/if}
        </div>
        <span class="item-id">{headerId}</span>
      </header>

      {#if note}
        <!-- Always editable, whether or not the card's own editor is open. The card's
             heading is not a text field the pointer can reach while it is only selected,
             so this is the one place a title can be renamed without entering the card. -->
        <section class="group" data-testid="panel-title-group">
          <p class="group-label">Title</p>
          <input
            class="input"
            type="text"
            aria-label="Note Title"
            placeholder="untitled"
            value={note.title}
            onblur={(e) => onNoteTitleChange?.(e.currentTarget.value)}
          />
        </section>
      {/if}

      {#if image}
        <!-- Directly under the Image header, like the note card's Title: the caption is the
             first thing a user names. The checkbox only decides whether the card draws it;
             the words are kept either way. -->
        <section class="group" data-testid="panel-image-title-group">
          <p class="group-label">Image Title</p>
          <input
            class="input"
            type="text"
            aria-label="Image Title"
            placeholder="name this picture"
            value={image.title}
            onblur={(e) => onImageTitleChange?.(e.currentTarget.value)}
          />
          <label class="check">
            <input
              type="checkbox"
              checked={image.title_visible}
              onchange={(e) => onImageTitleVisibleChange?.(e.currentTarget.checked)}
            />
            Show Title
          </label>
        </section>
      {/if}

      {#if soleBlueprint && blueprintPayload}
        <!-- ONE CONTROL PER FIELD, IN BLUEPRINT ORDER. There is no per-card-type branch
             here and there must never be one: if a branch on one card type's id is ever
             needed, the blueprint format is missing a member and the fix belongs in the
             data file, not in this component. -->
        <section class="group" data-testid="panel-blueprint-fields">
          {#each panelFields as field (field.key)}
            {#if field.panel === 'text'}
              <!-- Printed, not edited: the screen that owns this type owns the editing. -->
              <p class="panel-text" data-testid="panel-text-{field.key}">
                {fieldValueText(field, blueprintPayload.fields[field.key])}
              </p>
            {:else}
              <FieldControl
                {field}
                value={blueprintPayload.fields[field.key]}
                parent={parentFor(field.filter_by)}
                parentLabel={parentLabelFor(field.filter_by)}
                showMeaning={soleBlueprint.sheet !== true}
                imageFull={soleBlueprint.sheet === true}
                onCommit={(value, added) => onFieldChange?.(field.key, value, added)}
                onCommitScale={(next, before) => onScaleChange?.(field.key, next, before)}
                onReplaceImage={() => onReplaceFieldImage?.(field.key)}
              />
            {/if}
          {/each}
        </section>
      {/if}

      <!-- One heading over both rows: Size sits directly under Position and needs no
           second label to say what it is. -->
      {#each ['position', 'size'] as const as group}
        <section class="group" class:size-row={group === 'size'}>
          {#if group === 'position'}
            <p class="group-label">Position / Size</p>
          {/if}
          <div class="pairs">
            {#each FIELDS.filter((f) => f.group === group) as field (field.key)}
              {@const value = shared(field.key)}
              <label class="field">
                {field.letter}
                <input
                  class="input"
                  class:mixed={value === null}
                  type="text"
                  value={value === null ? 'mixed' : Math.round(value)}
                  aria-label={`${group === 'position' ? 'Position' : 'Size'} ${field.letter}`}
                  onfocus={(e) => e.currentTarget.select()}
                  onchange={(e) => commit(field.key, e.currentTarget.value)}
                />
              </label>
            {/each}
          </div>
        </section>
      {/each}

      {#if image}
        <section class="group">
          <p class="group-label">Description</p>
          <textarea
            class="input alt-text"
            aria-label="Description"
            placeholder="describe this picture"
            value={image.alt}
            onblur={(e) => onAltTextChange?.(e.currentTarget.value)}
          ></textarea>
          <!-- The words are kept either way; this only decides whether the card draws them. -->
          <label class="check">
            <input
              type="checkbox"
              checked={image.alt_visible}
              onchange={(e) => onAltVisibleChange?.(e.currentTarget.checked)}
            />
            Show Description
          </label>
        </section>
      {/if}

      {#if source}
        <!-- §9.5's Source group, and §9.7's not-fetched line. -->
        <section class="group" data-testid="panel-source-group">
          <p class="group-label">Source</p>
          <input
            class="input"
            type="text"
            readonly
            value={source.url}
            aria-label="Source Address"
          />
          <p class="file-meta" data-testid="panel-source-meta">
            {source.fetchedAt === null
              ? 'Not fetched yet · 5s limit'
              : `Preview fetched ${relativeTime(source.fetchedAt)}`}
          </p>
          <div class="order">
            <button
              type="button"
              class="order-button"
              disabled={fetching}
              class:pending={fetching}
              onclick={onRefetch}
            >
              <Icon glyph="arrow-clockwise" size={13} />
              Refetch
            </button>
          </div>
        </section>
      {/if}

      <section class="group">
        <p class="group-label">Order</p>
        <div class="order">
          <button type="button" class="order-button" onclick={onBringForward}>
            <Icon glyph="arrow-line-up" size={13} />
            Front
          </button>
          <button type="button" class="order-button" onclick={onSendBack}>
            <Icon glyph="arrow-line-down" size={13} />
            Back
          </button>
        </div>
      </section>

      {#if image}
        <!-- Last group in the column: it is reference, not something the user reaches for
             while placing a card. The name shown is the ORIGINAL file's — the stored name is
             a content hash and names nothing a reader recognises, so Show in folder is the
             way to the file itself. Replace and Show in folder stay enabled when the file is
             gone: they are the fix, and nothing here says where the original used to live. -->
        <section class="group" data-testid="panel-file-group">
          <p class="group-label">File</p>
          <p class="file-name" title={image.source_name}>{image.source_name}</p>
          <p class="file-meta" data-testid="panel-file-meta">{imageFileLine}</p>
          <div class="order">
            <button type="button" class="order-button" onclick={onReplaceImage}>Replace</button>
            <button
              type="button"
              class="icon-button folder"
              title="Show in folder"
              aria-label="Show in folder"
              onclick={onShowInFolder}
            >
              <Icon glyph="folder-open" size={13} />
            </button>
          </div>
        </section>
      {/if}

      <!-- §9.28. Both groups are drawn for writing cards ONLY: the four original kinds'
           panel states are untouched, which is a regression line in PRD §11. -->
      {#if soleBlueprint}
        <CardContext context={itemContext} {onOpenPlacement} {onOpenItem} />
      {/if}

      <footer class="footer">
        {#if soleBlueprint}
          <!-- §9.28: for a writing type the Card group REPLACES the Duplicate/Delete pair
               rather than being drawn beside it, and the delete is named for the type. -->
          <div class="card-actions">
            <button type="button" class="card-action" onclick={onExpandIntoCanvas}>
              <Icon glyph="square-half" size={13} />
              Expand Into A Canvas
            </button>
            <button type="button" class="card-action destructive" onclick={onDelete}>
              <Icon glyph="trash" size={13} />
              Delete {soleBlueprint.label}
            </button>
          </div>
        {:else}
          <div class="footer-row">
            <button type="button" class="icon-button duplicate" onclick={onDuplicate}>
              <Icon glyph="copy" size={13} label="Duplicate" />
            </button>
            <button type="button" class="icon-button delete" onclick={onDelete}>
              <Icon glyph="trash" size={13} label="Delete" />
            </button>
          </div>
        {/if}
        <p class="footer-note">Edits here are undoable · {autoSaveFooterText().split('· ')[1]}</p>
      </footer>
    {:else}
      <p class="footer-note">Nothing is selected.</p>
    {/if}
  </aside>
{:else}
  <aside class="panel collapsed" data-testid="properties-panel" aria-label="Properties">
    <button type="button" class="caret" onclick={onToggle}>
      <Icon glyph="caret-left" size={14} label="Expand Properties" />
    </button>
    <span class="collapsed-label">Nothing Selected</span>
  </aside>
{/if}

<style>
  .panel {
    width: var(--size-panel-expanded);
    flex: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-13);
    padding: var(--space-14) var(--space-12) var(--space-12);
    background: var(--color-surface);
    border-left: 1px solid var(--color-divider);
    font-size: var(--text-12);
    overflow-y: auto;
    box-sizing: border-box;
    transition: width var(--duration-140) var(--ease);
  }

  .panel.collapsed {
    width: var(--size-panel-collapsed);
    align-items: center;
    gap: var(--space-12);
    padding: var(--space-10) 0;
  }

  .header {
    display: flex;
    flex-direction: column;
  }

  .header-line {
    display: flex;
    justify-content: space-between;
    gap: var(--space-8);
  }

  /* The 26px mark is taller than the type name, so the row aligns on TOPS, not centres,
     and the whole header rises by the same 3px. The type name and the card name keep
     their own spacing and move together. */
  .header.has-open-sheet {
    position: relative;
    /* A 2px breath between the type name and the card name. */
    row-gap: 2px;
    margin-top: -3px;
  }

  .header-line {
    align-items: flex-start;
  }

  /* No box: the mark alone is the button, at twice the panel's icon size. */
  .open-sheet {
    /* Taken OUT of the flow: at 26px it would otherwise set the row's height and push
       the card name down away from the type name. */
    position: absolute;
    top: 0;
    right: -3px;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-accent);
    line-height: 1;
    cursor: pointer;
    opacity: 0.85;
    transition: opacity var(--duration-90) var(--ease);
  }

  .open-sheet:hover {
    opacity: 1;
  }

  .kind {
    font-size: var(--text-13);
    font-weight: 600;
  }

  .item-id {
    font-size: var(--text-10-5);
    opacity: 0.45;
  }

  /* A printed field: no label, no box, and it wraps. The 2px lifts it off the picture
     directly above it. */
  .panel-text {
    margin: 2px 0 0;
    font-size: var(--text-11);
    line-height: 1.45;
    opacity: 0.75;
    overflow-wrap: anywhere;
  }

  .group {
    display: flex;
    flex-direction: column;
  }

  /* W and H sit under X and Y as one block, not as a second group. */
  .group.size-row {
    margin-top: -3px;
  }

  .group-label {
    margin: 0 0 var(--space-6);
    font-size: var(--text-10);
    letter-spacing: var(--tracking-10);
    text-transform: uppercase;
    opacity: 0.65;
  }

  .pairs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-5);
  }

  .field {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--text-11);
    opacity: 0.75;
  }

  /* The four geometry boxes hold one short signed number, so they are sized to that rather
     than stretched across the column. 42px is the floor that still shows `-1024` whole. */
  .field .input {
    flex: none;
    width: 42px;
  }

  .input {
    flex: 1;
    min-width: 0;
    padding: 2px 4px;
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-md);
    background: var(--color-raised);
    color: inherit;
    font: inherit;
    font-size: var(--text-11);
    transition: border-color var(--duration-90) var(--ease);
  }

  .input:hover {
    border-color: color-mix(in srgb, var(--color-text) 28%, transparent);
  }

  .input.mixed {
    font-style: italic;
    opacity: 0.6;
  }

  .file-name {
    margin: 0;
    font-size: var(--text-11);
    line-height: 1.5;
    opacity: 0.75;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-meta {
    margin: 0 0 var(--space-6);
    font-size: var(--text-11);
    opacity: 0.45;
  }

  .anchor-state {
    margin: 0 0 var(--space-6);
    font-size: var(--text-11);
    opacity: 0.45;
  }

  .alt-text {
    width: 100%;
    height: 44px;
    resize: none;
    box-sizing: border-box;
    line-height: 1.4;
  }

  .order {
    display: flex;
    gap: var(--space-5);
  }

  /* The one documented exception to the .35 disabled value (§9.5). */
  .order-button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .icon-button.folder {
    width: 28px;
    height: 28px;
    flex: none;
    border: 1px solid var(--color-divider);
    color: inherit;
  }

  .icon-button.folder:hover {
    background: var(--tint-neutral-hover);
  }

  .order-button {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 3px 4px;
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-card);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-11);
    cursor: pointer;
    transition: background-color var(--duration-90) var(--ease);
  }

  .order-button:hover {
    background: var(--tint-neutral-hover);
    border-color: color-mix(in srgb, var(--color-text) 28%, transparent);
  }

  .order-button:active {
    background: var(--tint-neutral-press);
  }

  /* Weight as well as fill, so colour is never the only signal (§12). */
  .order-button.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-surface);
    font-weight: 600;
  }

  .check {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    margin-top: var(--space-6);
    font-size: var(--text-11);
    opacity: 0.75;
    cursor: pointer;
  }

  .check input {
    margin: 0;
    accent-color: var(--color-accent);
    cursor: pointer;
  }

  .swatches {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-5);
  }

  .swatch {
    height: 22px;
    display: grid;
    place-items: center;
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-md);
    background: var(--swatch);
    color: var(--color-surface);
    cursor: pointer;
    transition: box-shadow var(--duration-90) var(--ease);
  }

  .swatch:hover {
    border-color: color-mix(in srgb, var(--color-text) 40%, transparent);
  }

  .swatch.active {
    box-shadow: 0 0 0 2px var(--color-surface) inset;
    border-color: var(--color-text);
  }

  .width-button {
    padding: 8px 4px;
  }

  /* Plain ink, never the chosen colour: this control picks a WIDTH, and colouring it would
     make two groups look like one. */
  .width-sample {
    width: 26px;
    border-radius: 2px;
    background: var(--color-text);
  }

  .card-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .card-action {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    width: 100%;
    padding: var(--space-5) var(--space-6);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-md);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-11);
    text-align: left;
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

  .footer {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .footer-row {
    display: flex;
    justify-content: space-between;
  }

  .icon-button {
    width: 30px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-card);
    background: transparent;
    cursor: pointer;
    transition: background-color var(--duration-90) var(--ease);
  }

  .icon-button.duplicate {
    border: 1px solid var(--color-accent);
    color: var(--color-accent-text);
  }

  .icon-button.duplicate:hover {
    background: var(--tint-accent-hover);
  }

  .icon-button.duplicate:active {
    background: var(--tint-accent-press);
  }

  .icon-button.delete {
    border: 1px solid var(--color-divider);
    color: var(--color-accent-2);
  }

  .icon-button.delete:hover {
    background: var(--tint-neutral-hover);
  }

  .icon-button.delete:active {
    background: var(--tint-neutral-press);
  }

  .footer-note {
    margin: 0;
    font-size: var(--text-11);
    opacity: 0.42;
  }

  .caret {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border: none;
    background: transparent;
    color: inherit;
    opacity: 0.5;
    cursor: pointer;
  }

  .caret:hover {
    opacity: 1;
  }

  .collapsed-label {
    writing-mode: vertical-rl;
    text-transform: uppercase;
    font-size: var(--text-9-5);
    letter-spacing: var(--tracking-12);
    opacity: 0.58;
  }
</style>
