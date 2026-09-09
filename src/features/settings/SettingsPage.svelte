<!--
  The Settings page (design-system §9.11, frame 16a): a full-screen page replacing the canvas,
  with six rows in three groups. The title bar and the left column stay, and the left column's
  gear is the active row.

  There is no Save, no Cancel, no confirm and no toast. §10 contract 6 is explicit: changes
  apply the moment they are made, and contract 5 says the title bar's save state is the only
  save affordance in the product.

  Everything the page needs it reads from `getSettings()` and writes through `setSetting()`.
  `folderPath` arrives as a prop rather than being read from the store — §13.2 lists the
  screen's reads as `settings` and `project.folderPath`, a value rather than a store, and
  TitleBar already receives it the same way.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import Toggle from './Toggle.svelte';
  import { applyFont, applyTheme } from '../../lib/theme';
  import {
    AUTO_SAVE_OPTIONS,
    getSettings,
    setSetting,
    settingsLocation,
    type FontChoice,
    type Theme,
    type ZoomModifier,
  } from '../../lib/settings.svelte';

  interface Props {
    folderPath: string | null;
    onBack: () => void;
  }

  const { folderPath, onBack }: Props = $props();

  const settings = getSettings();

  const cadenceOptions = AUTO_SAVE_OPTIONS.map((ms) => ({
    value: String(ms),
    label: `${ms / 1000}s`,
  }));

  const zoomOptions: { value: ZoomModifier; label: string }[] = [
    { value: 'scroll', label: 'Scroll' },
    { value: 'ctrl-scroll', label: 'Ctrl+scroll' },
  ];

  const themeOptions: { value: Theme; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ];

  const fontOptions: { value: FontChoice; label: string }[] = [
    { value: 'serif', label: 'Serif' },
    { value: 'sans', label: 'Sans' },
    { value: 'marker', label: 'Marker' },
  ];

  // The drawn literal is the starting value, so the footer line is never empty and is right
  // in every normal case; the command replaces it with whatever the application resolved.
  let location = $state('%APPDATA%\\IdeaScape');

  $effect(() => {
    void settingsLocation().then((resolved) => {
      location = resolved;
    });
  });

  function chooseTheme(theme: Theme) {
    // Repaint first, then persist: §11.3 gives the theme change 0 ms and the write is slower.
    applyTheme(theme);
    void setSetting('theme', theme);
  }

  /** Same order as the theme: swap the family first, then persist. */
  function chooseFont(font: FontChoice) {
    applyFont(font);
    void setSetting('font', font);
  }
</script>

<main class="settings" data-testid="settings-page">
  <header>
    <h1>Settings</h1>
    <p class="sub">Applied as you change them</p>
    <button type="button" class="back" onclick={onBack} data-testid="settings-back">
      <Icon glyph="arrow-left" size={13} />
      Back to canvas
    </button>
  </header>

  <div class="body scroll-thin">
    <section>
      <p class="section-label">Files</p>

      <div class="row">
        <div class="text">
          <span class="label">Project folder</span>
        </div>
        <div class="value">
          {#if folderPath}
            <span class="path" title={folderPath} data-testid="settings-folder">{folderPath}</span>
          {:else}
            <span class="path" data-testid="settings-folder">No project is open</span>
          {/if}
          <span class="read-only">read-only</span>
        </div>
      </div>

      <div class="row">
        <div class="text">
          <span class="label">Auto-save</span>
          <span class="helper">Written atomically; the canvas never blocks on a save.</span>
        </div>
        <SegmentedControl
          options={cadenceOptions}
          value={String(settings.autoSaveMs)}
          label="Auto-save"
          onChange={(value) => void setSetting('autoSaveMs', Number(value))}
        />
      </div>
    </section>

    <section>
      <p class="section-label">Canvas</p>

      <div class="row">
        <div class="text">
          <span class="label">Snap to grid</span>
          <span class="helper">Off keeps free placement to the pixel.</span>
        </div>
        <Toggle
          checked={settings.snapToGrid}
          label="Snap to grid"
          onChange={(checked) => void setSetting('snapToGrid', checked)}
        />
      </div>

      <div class="row">
        <div class="text">
          <span class="label">Zoom with</span>
          <span class="helper">Ctrl+scroll leaves the plain wheel free to pan.</span>
        </div>
        <SegmentedControl
          options={zoomOptions}
          value={settings.zoomWith}
          label="Zoom with"
          onChange={(value) => void setSetting('zoomWith', value)}
        />
      </div>
    </section>

    <section>
      <p class="section-label">Appearance</p>

      <div class="row">
        <div class="text">
          <span class="label">Theme</span>
        </div>
        <SegmentedControl
          options={themeOptions}
          value={settings.theme}
          label="Theme"
          onChange={chooseTheme}
        />
      </div>

      <div class="row">
        <div class="text">
          <span class="label">Font</span>
          <span class="helper">Marker is a single-weight hand; sizes never change.</span>
        </div>
        <SegmentedControl
          options={fontOptions}
          value={settings.font}
          label="Font"
          onChange={chooseFont}
        />
      </div>
    </section>

    <!-- §9.11: the SEVENTH row, in a new Packs group that sits UNDER the two-column grid as
         a single full-width row, because it governs the whole application. The Font row of
         2026-09-07 took the sixth. -->
    <section class="full-width" data-testid="settings-packs">
      <p class="section-label">Packs</p>

      <div class="row">
        <div class="text">
          <span class="label">Show Writing Cards</span>
          <span class="helper">
            Off hides Book, Chapter, Scene, Beat, Character and Location from the Cards menu. Cards
            already on a canvas stay.
          </span>
        </div>
        <Toggle
          checked={settings.showWritingCards}
          label="Show Writing Cards"
          onChange={(checked) => void setSetting('showWritingCards', checked)}
        />
      </div>
    </section>
  </div>

  <footer data-testid="settings-footer">
    settings.json · {location} · nothing leaves this machine
  </footer>
</main>

<style>
  .settings {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
    color: var(--color-text);
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: flex-end;
    gap: var(--space-16);
    padding: 30px var(--space-44) 20px;
  }

  h1 {
    margin: 0;
    font-size: var(--text-32);
    font-weight: 600;
    letter-spacing: var(--tracking-tight-2);
  }

  .sub {
    margin: 0;
    padding-bottom: 8px;
    font-size: var(--text-12);
    opacity: 0.5;
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: var(--space-6);
    margin-left: auto;
    padding: 5px var(--space-14);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-lg);
    background: transparent;
    color: var(--color-accent-text);
    font: inherit;
    font-size: var(--text-12);
    cursor: pointer;
    transition: background-color var(--duration-90) var(--ease);
  }

  .back:hover {
    background: var(--tint-accent-hover);
  }

  .body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-34) var(--space-64);
    align-content: start;
    max-width: 1000px;
    padding: 0 var(--space-44) 20px;
    overflow-y: auto;
  }

  section {
    min-width: 0;
  }

  /* The Packs group governs the whole application, so it spans both columns rather than
     sitting beside Appearance. */
  section.full-width {
    grid-column: 1 / -1;
  }

  .section-label {
    margin: 0 0 var(--space-12);
    font-size: var(--text-10);
    letter-spacing: var(--tracking-10);
    text-transform: uppercase;
    opacity: 0.65;
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    padding: var(--space-9) 0;
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }

  .label {
    font-size: var(--text-12-5);
  }

  .helper {
    font-size: var(--text-11-5);
    opacity: 0.5;
  }

  .value {
    display: flex;
    align-items: baseline;
    gap: var(--space-6);
    margin-left: auto;
    min-width: 0;
  }

  /* direction: rtl so a long path clips at its front and the folder name survives. */
  .path {
    direction: rtl;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: var(--text-11-5);
  }

  .read-only {
    flex: none;
    font-size: var(--text-11-5);
    opacity: 0.42;
  }

  .row :global(.segmented),
  .row :global([role='switch']) {
    flex: none;
    margin-left: auto;
  }

  footer {
    padding: 0 var(--space-44) 22px;
    font-size: var(--text-11-5);
    opacity: 0.42;
  }
</style>
