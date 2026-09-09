/**
 * The one place a key event becomes a named action. Features hand this module callbacks;
 * it imports no feature, so a shared shortcut never becomes a cross-feature import and no
 * shortcut is implemented twice.
 *
 * Every key printed on a context menu or the search footer must be honoured (PRD §6.8),
 * so the printed labels are derived from `SHORTCUT_LABELS` here rather than retyped.
 */

export type Action =
  // The twelve keys this phase implements.
  | 'new-note'
  | 'edit'
  | 'cancel'
  | 'delete'
  | 'duplicate'
  | 'copy'
  | 'paste'
  | 'select-all'
  | 'reset-zoom'
  | 'zoom-to-fit'
  | 'bring-forward'
  | 'send-back'
  | 'undo'
  | 'redo'
  // Declared now, handled by Phases 2–4.
  | 'new-image'
  | 'connect'
  | 'result-up'
  | 'result-down'
  // The writing pack (Phase 6). One key per card type, in rail order.
  | 'new-book'
  | 'new-chapter'
  | 'new-scene'
  | 'new-beat'
  | 'new-character'
  | 'new-location';

/** The label each shortcut prints in a menu. Menus read these; they never retype a key. */
export const SHORTCUT_LABELS: Record<Action, string> = {
  'new-note': 'N',
  edit: 'Enter',
  cancel: 'Esc',
  delete: 'Del',
  duplicate: 'Ctrl+D',
  copy: 'Ctrl+C',
  paste: 'Ctrl+V',
  'select-all': 'Ctrl+A',
  'reset-zoom': '100%',
  'zoom-to-fit': 'Ctrl+0',
  'bring-forward': 'Ctrl+]',
  'send-back': 'Ctrl+[',
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Y',
  'new-image': 'I',
  connect: 'C',
  'result-up': 'Up',
  'result-down': 'Down',
  'new-book': '2',
  'new-chapter': '3',
  'new-scene': '4',
  'new-beat': '5',
  'new-character': '6',
  'new-location': '7',
};

/**
 * The card type each writing-pack key makes. The rail's submenu reads this, so the rows and
 * the keys can never disagree, and `SHORTCUT_LABELS` above is still the only place a key is
 * written down.
 */
export const WRITING_ACTIONS: readonly { action: Action; blueprint: string }[] = [
  { action: 'new-book', blueprint: 'book' },
  { action: 'new-chapter', blueprint: 'chapter' },
  { action: 'new-scene', blueprint: 'scene' },
  { action: 'new-beat', blueprint: 'beat' },
  { action: 'new-character', blueprint: 'character' },
  { action: 'new-location', blueprint: 'location' },
];

/**
 * Whether a key came from a text box. Exported because a full-screen sheet asks it directly:
 * `matchAction` returns 'cancel' for Escape *before* its own text bail, deliberately, so a
 * note editor can cancel — which is why the sheet's two-press Esc lives in its handler.
 */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}

/**
 * Turn a key event into an action, or null. Pure: it reads the event and nothing else.
 *
 * While the focus is in a text box only Esc and the non-text-editing Ctrl combinations
 * are dispatched, so typing an `n` into a note never creates a card.
 */
export function matchAction(event: KeyboardEvent): Action | null {
  const ctrl = event.ctrlKey || event.metaKey;
  const inText = isTextEntry(event.target);

  if (ctrl) {
    // event.code is layout-stable for the bracket keys; event.key is the fallback.
    if (event.code === 'BracketRight' || event.key === ']') return 'bring-forward';
    if (event.code === 'BracketLeft' || event.key === '[') return 'send-back';

    switch (event.key.toLowerCase()) {
      case 'd':
        return 'duplicate';
      case 'z':
        return 'undo';
      case 'y':
        return 'redo';
      case '0':
        return 'zoom-to-fit';
      // Copy, paste and select-all are text-editing defaults — leave them to the text box.
      case 'c':
        return inText ? null : 'copy';
      case 'v':
        return inText ? null : 'paste';
      case 'a':
        return inText ? null : 'select-all';
      default:
        return null;
    }
  }

  if (event.key === 'Escape') return 'cancel';
  if (inText) return null;

  switch (event.key) {
    case 'Enter':
      return 'edit';
    case 'Delete':
    case 'Backspace':
      return 'delete';
    case 'ArrowUp':
      return 'result-up';
    case 'ArrowDown':
      return 'result-down';
    default:
      break;
  }

  // The writing pack's 2–7, AFTER the `inText` bail above, so typing a 4 into a field never
  // makes a Scene.
  switch (event.key) {
    case '2':
      return 'new-book';
    case '3':
      return 'new-chapter';
    case '4':
      return 'new-scene';
    case '5':
      return 'new-beat';
    case '6':
      return 'new-character';
    case '7':
      return 'new-location';
    default:
      break;
  }

  switch (event.key.toLowerCase()) {
    case 'n':
      return 'new-note';
    case 'i':
      return 'new-image';
    case 'c':
      return 'connect';
    default:
      return null;
  }
}

export type ShortcutHandlers = Partial<Record<Action, (event: KeyboardEvent) => void>>;

/**
 * Attach the one global keydown listener. Returns its teardown, so a component can
 * register in `$effect` and clean up on destroy.
 */
export function registerShortcuts(
  handlers: ShortcutHandlers,
  target: EventTarget = window,
): () => void {
  const onKeyDown = (event: Event) => {
    const keyEvent = event as KeyboardEvent;
    const action = matchAction(keyEvent);
    if (!action) return;
    const handler = handlers[action];
    if (!handler) return;
    keyEvent.preventDefault();
    handler(keyEvent);
  };
  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}
