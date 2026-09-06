/**
 * A pointer press inside an element marked `data-owns-press` belongs to that control.
 *
 * The canvas surface and the card layer both take pointer capture on press so a drag keeps
 * working outside the element. A captured pointer retargets the click that follows to the
 * capture element, so a button underneath never sees its click. Both handlers call this
 * first and leave the press alone.
 */
export function ownsPress(event: { target: EventTarget | null }): boolean {
  return event.target instanceof Element && event.target.closest('[data-owns-press]') !== null;
}
