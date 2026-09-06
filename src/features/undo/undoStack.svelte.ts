/**
 * The session undo stack. Two arrays of inverse commands: pushing clears the redo stack,
 * undo and redo move a command between them. Session-only — both stacks clear when the
 * project or the canvas closes, which is the scope the architecture chose.
 */
import type { UndoableCommand } from './commands';
import { logError } from '../../lib/logger';

class UndoStack {
  #undo = $state<UndoableCommand[]>([]);
  #redo = $state<UndoableCommand[]>([]);

  get undoDepth(): number {
    return this.#undo.length;
  }

  get redoDepth(): number {
    return this.#redo.length;
  }

  get nextUndoLabel(): string | null {
    return this.#undo.at(-1)?.label ?? null;
  }

  get nextRedoLabel(): string | null {
    return this.#redo.at(-1)?.label ?? null;
  }

  /** Record a completed action. A new action after an undo discards the redo stack. */
  push(command: UndoableCommand): void {
    this.#undo = [...this.#undo, command];
    if (this.#redo.length > 0) this.#redo = [];
  }

  /**
   * Undoing an empty stack is a safe no-op. A step that fails stays where it is — the state
   * it describes was not reversed, so dropping it would lose the only record of it — and the
   * error is re-thrown so the shell draws it. Swallowing it made a stuck stack look like a
   * dead button.
   */
  async undo(): Promise<void> {
    const command = this.#undo.at(-1);
    if (!command) return;
    try {
      await command.undo();
    } catch (error) {
      logError('an undo step failed', error);
      throw error;
    }
    this.#undo = this.#undo.slice(0, -1);
    this.#redo = [...this.#redo, command];
  }

  async redo(): Promise<void> {
    const command = this.#redo.at(-1);
    if (!command) return;
    try {
      await command.redo();
    } catch (error) {
      logError('a redo step failed', error);
      throw error;
    }
    this.#redo = this.#redo.slice(0, -1);
    this.#undo = [...this.#undo, command];
  }

  /** Called when the project or canvas closes. The stack does not survive either. */
  clear(): void {
    this.#undo = [];
    this.#redo = [];
  }
}

export const undoStack = new UndoStack();
export type { UndoStack };
