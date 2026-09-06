/**
 * The project library's feature state: the recents list the picker draws, which card is
 * selected, and the message a failed open leaves behind.
 *
 * Every call goes through `invokeSafe`, and nothing here builds a path — the parent folder
 * for a new project comes from `default_project_parent`, and the folder for an existing one
 * comes from either the recents file or the Tauri directory selector. Opening and closing
 * the project itself is the root's job, because it also has to move the store, the assets
 * folder and the undo stack; this module owns only what the picker screen needs.
 */
import { invokeSafe } from '../../lib/ipc';
import { logWarn } from '../../lib/logger';
import type { RecentProject } from '../../lib/types';

class ProjectsState {
  recents = $state<RecentProject[]>([]);
  /** Which Recent card the arrow keys have moved to. `-1` is "none". */
  selectedIndex = $state(-1);
  /** A failed open or create, drawn as a strip on the picker — never a dialog. */
  failure = $state<string | null>(null);
  /** Where the New project dialog offers to put the folder. Read once, on demand. */
  defaultParent = $state<string | null>(null);

  async loadRecents(): Promise<void> {
    this.recents = await invokeSafe<RecentProject[]>('list_recent_projects');
    // A list that shrank must not leave the cursor past its end.
    if (this.selectedIndex >= this.recents.length) this.selectedIndex = this.recents.length - 1;
  }

  async loadDefaultParent(): Promise<string> {
    if (this.defaultParent === null) {
      this.defaultParent = await invokeSafe<string>('default_project_parent');
    }
    return this.defaultParent;
  }

  /** Move the Recent grid's cursor, wrapping at both ends. A empty grid stays at `-1`. */
  move(delta: number): void {
    if (this.recents.length === 0) {
      this.selectedIndex = -1;
      return;
    }
    const next =
      this.selectedIndex < 0
        ? delta > 0
          ? 0
          : this.recents.length - 1
        : this.selectedIndex + delta;
    this.selectedIndex = (next + this.recents.length) % this.recents.length;
  }

  /** The folder the cursor is on, or null when nothing is selected. */
  current(): string | null {
    return this.recents[this.selectedIndex]?.path ?? null;
  }

  /**
   * The Tauri directory selector. `dialog:allow-open` already covers it — it is the same
   * `open` command the image picker uses — so no capability changes for this.
   */
  async chooseFolder(defaultPath?: string | null): Promise<string | null> {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const picked = await open({
        directory: true,
        multiple: false,
        defaultPath: defaultPath ?? undefined,
      });
      return typeof picked === 'string' ? picked : null;
    } catch (error) {
      logWarn('the folder selector could not be opened', error);
      return null;
    }
  }
}

export const projectsState = new ProjectsState();
export type { ProjectsState };
